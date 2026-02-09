import { DealPassport } from '../types/contracts';
import { DataCacheManager } from '../config/DataCacheManager';
import { RuleRepository, IncotermsRule, InsuranceRule } from '../rules/RuleRepository';
import { CurrencyConverter } from '../currency/CurrencyConverter';

export interface CustomsResult {
  customs_value_usd: number;
  breakdown: {
    invoice_value_usd: number;
    added_freight_usd: number;
    added_insurance_usd: number;
    added_other_usd: number;
  };
  assumptions: string[];
  missing_inputs: string[];
  is_incomplete: boolean;
  incomplete_reasons: string[]; // For scenario generation hints
}

export class CustomsValueCalculatorV2 {
  constructor(private ruleRepo: RuleRepository) {}

  async calculate(
    passport: DealPassport,
    freightToBorderUSD: number | null, // Pre-calculated freight
    cache: DataCacheManager,
    converter: CurrencyConverter
  ): Promise<CustomsResult> {
    const result: CustomsResult = {
      customs_value_usd: 0,
      breakdown: {
        invoice_value_usd: passport.goods_value, // Assumed USD normalized before this call or simple pass
        added_freight_usd: 0,
        added_insurance_usd: 0,
        added_other_usd: 0
      },
      assumptions: [],
      missing_inputs: [],
      is_incomplete: false,
      incomplete_reasons: []
    };

    // 1. Get Rules
    let rule: IncotermsRule;
    try {
      rule = await this.ruleRepo.getIncotermsRule(passport.incoterms);
    } catch (e: any) {
      result.assumptions.push(e.message);
      result.is_incomplete = true;
      result.missing_inputs.push('incoterms_rule');
      return result; 
    }

    const components = rule.customs_components_in_base ?? [];

    // 2. Resolve Inclusion for Components in Base
    // Components to check: 'border_freight', 'insurance' mostly.
    
    // --- Border Freight ---
    if (components.includes('border_freight')) {
        const inclusion = await this.resolveInclusion(passport, 'invoice_includes_border_freight', 'border_freight', result, rule.unknown_policy);
        
        if (inclusion === 'no') {
            if (freightToBorderUSD !== null) {
                result.breakdown.added_freight_usd = freightToBorderUSD;
            } else {
                // Missing rate!
                const critical = rule.critical_components ?? [];
                if (critical.includes('border_freight')) {
                     result.missing_inputs.push('border_freight_rate'); // Signal to orchestrator
                } else {
                     result.assumptions.push('Border freight not added (rate missing)');
                }
            }
        } 
        else if (inclusion === 'unknown') {
            // Policy check (ASSUME_DEFAULT already handled inside resolveInclusion)
            if (rule.unknown_policy === 'SCENARIO_RANGE') {
                 result.is_incomplete = true;
                 result.incomplete_reasons.push('unknown_border_freight_inclusion');
            } else {
                 result.is_incomplete = true;
                 result.missing_inputs.push('invoice_includes_border_freight');
            }
        }
        // If 'yes', do nothing (already in invoice)
    }

    // --- Insurance ---
    if (components.includes('insurance')) {
        const inclusion = await this.resolveInclusion(passport, 'invoice_includes_insurance', 'insurance', result, rule.unknown_policy);
        
        if (inclusion === 'no') {
             // Calculate Insurance
             const insRule = await this.ruleRepo.getInsuranceRule(passport.dest_country, passport.incoterms);
             const val = this.calculateInsurance(insRule, passport.goods_value, freightToBorderUSD || 0);
             
             result.breakdown.added_insurance_usd = val;
             result.assumptions.push(`Insurance calculated: ${(insRule.rate_value * 100).toFixed(2)}% (${insRule.source_quality})`);
        }
        else if (inclusion === 'unknown') {
             // Policy check
             if (rule.unknown_policy === 'SCENARIO_RANGE') {
                 result.is_incomplete = true;
                 result.incomplete_reasons.push('unknown_insurance_inclusion');
             } else {
                 result.is_incomplete = true; 
                 result.missing_inputs.push('invoice_includes_insurance');
             }
        }
    }

    // Sum up
    result.customs_value_usd = 
        result.breakdown.invoice_value_usd + 
        result.breakdown.added_freight_usd + 
        result.breakdown.added_insurance_usd + 
        result.breakdown.added_other_usd;

    return result;
  }

  // Decision Phase Resolution
  private async resolveInclusion(
      passport: any, 
      field: string, 
      component: string,
      result: CustomsResult,
      policy?: string
  ): Promise<'yes'|'no'|'unknown'> {
      // Prioritize normalized V2 fields
      const v2Field = field === 'invoice_includes_border_freight' ? 'v2_freight_inclusion' : 
                     field === 'invoice_includes_insurance' ? 'v2_insurance_inclusion' : null;
      
      const userValue = (v2Field && passport[v2Field]) ? passport[v2Field] : passport[field];
      
      if (userValue === 'yes' || userValue === 'no') return userValue;
      // Explicit 'unknown' from passport is handled below alongside missing values

      // 2. Default Rule
      const rule = await this.ruleRepo.getInclusionRule(passport.incoterms, component);
      let effective = rule.default_included; 

      // 3. Assume Default Logic
      if ((userValue === 'unknown' || !userValue) && effective === 'unknown' && policy === 'ASSUME_DEFAULT') {
          // Hardcoded Industry Defaults as final safeguard
          effective = ['CIF', 'CIP'].includes(passport.incoterms) ? 'yes' : 'no';
          result.assumptions.push(`ASSUMPTION_${component.toUpperCase()}_INCLUSION: Assumed ${effective} for ${passport.incoterms}`);
          result.missing_inputs.push(`ASSUMPTION_${component.toUpperCase()}_INCLUSION`); 
          return effective;
      }

      if (effective !== 'unknown') return effective;

      return 'unknown'; 
  }

  private calculateInsurance(rule: InsuranceRule, invoice: number, freight: number): number {
      let base = rule.base_type === 'invoice_plus_border_freight' ? (invoice + freight) : invoice;
      
      // Fixed base override
      if (rule.base_type === 'fixed') return rule.rate_value;

      let amount = 0;
      if (rule.rate_type === 'percent') {
          amount = base * rule.rate_value;
      } else {
          amount = rule.rate_value; // Fixed amount
      }

      return Math.max(amount, rule.min_premium_usd);
  }
}
