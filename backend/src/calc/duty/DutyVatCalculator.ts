import {
  DealPassport,
  CustomsValueResult,
  DutyVatResult,
  DutyBreakdown,
  CustomsFee,
  HSResult,
  DutyAST,
  Source
} from '../types/contracts';
import { HSClient } from '../hs/HSClient';
import { DataCacheManager } from '../config/DataCacheManager';
import { CurrencyConverter } from '../currency/CurrencyConverter';
import { UnsupportedTariffError } from '../errors';
import { logger } from '../../logger';

interface CountryTaxConfig {
  country_code: string;
  import_vat_default_rate: number;
  active: boolean;
}

interface CustomsFeesConfig {
  fee_id?: string;
  country_code: string;
  fee_type: string;
  calculation_rule: {
    type: string;
    currency: string;
    brackets?: Array<{ max_customs_value_kzt: number | null; fee_kzt: number }>;
    amount?: number;
    percent?: number;
  };
  active: boolean;
}

export class DutyVatCalculator {
  constructor(
    private hsClient: HSClient,
    private cache: DataCacheManager,
    private converter: CurrencyConverter
  ) {}

  async execute(
    passport: DealPassport,
    hsResult: HSResult,
    customsValue: CustomsValueResult
  ): Promise<DutyVatResult> {
    const result: DutyVatResult = {
      duty: {
        range_usd: [0, 0],
        breakdown: [],
        base_formula: ''
      },
      vat: {
        rate: 0,
        range_usd: [0, 0],
        base_formula: ''
      },
      fees_usd: [],
      total_range_usd: [0, 0],
      assumptions: [],
      sources: [],
      missing_inputs: [],
      requires_escalation: false,
      escalation_reasons: []
    };

    // Check HS confidence and risk flags
    const topConfidence = hsResult.candidates[0]?.confidence || 0;
    if (hsResult.candidates.length > 0 && topConfidence < 0.65) {
      result.requires_escalation = true;
      result.escalation_reasons.push(`Low HS confidence: ${topConfidence.toFixed(2)}`);
    }

    if (hsResult.candidates.length > 1) {
      result.requires_escalation = true;
      result.escalation_reasons.push(`Multiple HS candidates (${hsResult.candidates.length})`);
    }

    // Calculate duty for each HS candidate
    const dutyBreakdowns: DutyBreakdown[] = [];
    let dutyMin = Infinity;
    let dutyMax = -Infinity;
    let vatExempt = false;
    
    for (const candidate of hsResult.candidates) {
      try {
        const tariffInfo = await this.hsClient.getTariff(candidate.hs_code);
        
        if (!tariffInfo.import_duty_parsed) {
          result.requires_escalation = true;
          result.escalation_reasons.push(`No parsed duty for HS ${candidate.hs_code}`);
          continue;
        }

        const dutyRange = this.calculateDutyFromAST(
          tariffInfo.import_duty_parsed,
          customsValue.customs_value_usd,
          passport
        );

        const breakdown: DutyBreakdown = {
          hs_code: candidate.hs_code,
          type: tariffInfo.import_duty_parsed.kind,
          calculated_amount: dutyRange
        };

        // Add type-specific details
        if (tariffInfo.import_duty_parsed.kind === 'advalorem') {
          breakdown.advalorem_rate = tariffInfo.import_duty_parsed.percent;
        } else if (tariffInfo.import_duty_parsed.kind === 'specific') {
          breakdown.specific_rate = {
            amount: tariffInfo.import_duty_parsed.amount,
            currency: tariffInfo.import_duty_parsed.currency,
            unit: tariffInfo.import_duty_parsed.unit
          };
        }

        dutyBreakdowns.push(breakdown);
        dutyMin = Math.min(dutyMin, dutyRange[0]);
        dutyMax = Math.max(dutyMax, dutyRange[1]);

        if (tariffInfo.vat_exempt) {
          vatExempt = true;
        }

        result.sources.push({
          type: 'hs_engine',
          ref: candidate.hs_code,
          version: 'hs_client'
        });

        if (!result.duty.base_formula) {
          result.duty.base_formula = tariffInfo.import_duty_raw;
        }

      } catch (error: any) {
        if (error instanceof UnsupportedTariffError) {
          result.requires_escalation = true;
          result.escalation_reasons.push(`Unsupported tariff for HS ${candidate.hs_code}: ${error.message}`);
        } else {
          result.requires_escalation = true;
          result.escalation_reasons.push(`HS tariff lookup failed for ${candidate.hs_code}`);
        }
      }
    }

    // Calculate VAT
    logger.debug('calculateVAT', { country: passport.dest_country, customs: customsValue.customs_value_usd, duty: dutyBreakdowns.length > 0 ? [dutyMin, dutyMax] : [0, 0], vat_exempt: vatExempt });
    const vatResult = await this.calculateVAT(
      passport,
      customsValue.customs_value_usd,
      dutyBreakdowns.length > 0 ? [dutyMin, dutyMax] : [0, 0],
      vatExempt
    );

    result.vat = vatResult.vat;
    result.assumptions.push(...vatResult.assumptions);
    result.sources.push(...vatResult.sources);
    
    if (vatResult.requires_escalation) {
      result.requires_escalation = true;
      result.escalation_reasons.push(...vatResult.escalation_reasons);
    }

    if (dutyBreakdowns.length === 0) {
      if (hsResult.candidates.length > 0) {
        result.requires_escalation = true;
        result.escalation_reasons.push('No valid duty calculations available');
      }
      return result;
    }

    result.duty.range_usd = [dutyMin, dutyMax];
    result.duty.breakdown = dutyBreakdowns;

    // Calculate total
    result.total_range_usd = [
      result.duty.range_usd[0] + result.vat.range_usd[0],
      result.duty.range_usd[1] + result.vat.range_usd[1]
    ];

    // Calculate customs fees from calc_customs_fees_config
    const feeConfigs = this.cache.query<CustomsFeesConfig>(
      'calc_customs_fees_config',
      { country_code: passport.dest_country }
    ).filter(c => c.active);

    if (feeConfigs.length > 0) {
      const customsValueUsd = customsValue.customs_value_usd[0];

      for (const config of feeConfigs) {
        const rule = config.calculation_rule;

        if (rule.type === 'tiered' && rule.brackets && rule.currency === 'KZT') {
          const customsValueKZT = this.converter.convert(customsValueUsd, 'USD', 'KZT');
          const bracket = rule.brackets.find(b =>
            b.max_customs_value_kzt === null || customsValueKZT <= b.max_customs_value_kzt
          );

          if (bracket) {
            result.fees_usd.push({
              name: config.fee_type,
              amount: this.converter.toInternal(bracket.fee_kzt, 'KZT'),
              currency: 'USD',
              source_ref: 'calc_customs_fees_config'
            });
          }
        }
      }
    }

    if (result.fees_usd.length === 0) {
      result.assumptions.push('Customs fees not included in MVP calculation');
    }

    return result;
  }

  private calculateDutyFromAST(
    ast: DutyAST,
    customsValueRange: [number, number],
    passport: DealPassport
  ): [number, number] {
    const [customsMin, customsMax] = customsValueRange;

    switch (ast.kind) {
      case 'advalorem': {
        const dutyMin = customsMin * ast.percent;
        const dutyMax = customsMax * ast.percent;
        return [dutyMin, dutyMax];
      }

      case 'specific': {
        const amountUSD = this.converter.toInternal(ast.amount, ast.currency);

        switch (ast.unit) {
          case 'kg': {
            if (!passport.weight_gross_kg || passport.weight_gross_kg <= 0) {
              throw new UnsupportedTariffError('weight_gross_kg required for specific duty calculation');
            }
            return [amountUSD * passport.weight_gross_kg, amountUSD * passport.weight_gross_kg];
          }
          case 'pcs': {
            if (!passport.quantity || passport.quantity <= 0) {
              throw new UnsupportedTariffError('MISSING_INPUT:quantity — required for pcs-based duty');
            }
            return [amountUSD * passport.quantity, amountUSD * passport.quantity];
          }
          case 'l': {
            if (!passport.volume_l || passport.volume_l <= 0) {
              throw new UnsupportedTariffError('MISSING_INPUT:volume_l — required for per-litre duty');
            }
            return [amountUSD * passport.volume_l, amountUSD * passport.volume_l];
          }
          case 'm2': {
            if (!passport.area_m2 || passport.area_m2 <= 0) {
              throw new UnsupportedTariffError('MISSING_INPUT:area_m2 — required for per-m² duty');
            }
            return [amountUSD * passport.area_m2, amountUSD * passport.area_m2];
          }
          default:
            throw new UnsupportedTariffError(`UNSUPPORTED_UNIT:${ast.unit} — escalation required`);
        }
      }

      case 'sum': {
        const advaloremRange = this.calculateDutyFromAST(
          ast.advalorem,
          customsValueRange,
          passport
        );
        const specificRange = this.calculateDutyFromAST(
          ast.specific,
          customsValueRange,
          passport
        );
        return [
          advaloremRange[0] + specificRange[0],
          advaloremRange[1] + specificRange[1]
        ];
      }

      case 'max': {
        const ranges = ast.options.map(option =>
          this.calculateDutyFromAST(option, customsValueRange, passport)
        );
        const dutyMin = Math.max(...ranges.map(r => r[0]));
        const dutyMax = Math.max(...ranges.map(r => r[1]));
        return [dutyMin, dutyMax];
      }

      default:
        throw new UnsupportedTariffError(`Unknown AST kind: ${(ast as any).kind}`);
    }
  }

  private async calculateVAT(
    passport: DealPassport,
    customsValueRange: [number, number],
    dutyRange: [number, number],
    vatExempt: boolean
  ): Promise<{
    vat: {
      rate: number;
      range_usd: [number, number];
      base_formula: string;
    };
    assumptions: string[];
    sources: Source[];
    requires_escalation: boolean;
    escalation_reasons: string[];
  }> {
    const result = {
      vat: {
        rate: 0,
        range_usd: [0, 0] as [number, number],
        base_formula: ''
      },
      assumptions: [] as string[],
      sources: [] as Source[],
      requires_escalation: false,
      escalation_reasons: [] as string[]
    };

    if (vatExempt) {
      result.vat.range_usd = [0, 0];
      result.vat.base_formula = 'VAT exempt';
      result.assumptions.push('VAT exempt for this HS code');
      return result;
    }

    // Date validity check (String Comparison YYYY-MM-DD)
    const todayStr = new Date().toISOString().split('T')[0];

    // Get VAT rate from config
    const taxConfigs = this.cache.query<CountryTaxConfig & { valid_from?: string; valid_to?: string }>(
      'calc_country_tax_config', 
      { country_code: passport.dest_country }
    );

    // Filter for active/valid config
    const countryConfig = taxConfigs.find(c => {
         // Active check (loose for migration: true or null/undefined)
         const isActive = c.active === true || c.active === null || c.active === undefined;
         if (!isActive) return false;

         // Date validity check
         if (c.valid_from && c.valid_from > todayStr) return false; // Future
         if (c.valid_to && c.valid_to < todayStr) return false; // Past

         return true;
    });

    if (!countryConfig) {
      result.requires_escalation = true;
      
      // Diagnose validation failure
      if (taxConfigs.length === 0) {
          result.escalation_reasons.push(`VAT config missing for country ${passport.dest_country}`);
      } else {
          // Check the first candidate to determine specific reason
          const candidate = taxConfigs[0];
          const isActive = candidate.active === true || candidate.active === null || candidate.active === undefined;
          
          if (!isActive) {
              result.escalation_reasons.push(`VAT_CONFIG_INACTIVE: Config is explicitly inactive for ${passport.dest_country}`);
          } else {
              result.escalation_reasons.push(`VAT_CONFIG_OUT_OF_DATE: Config valid only from ${candidate['valid_from']||'*'} to ${candidate['valid_to']||'*'}`);
          }
      }
      
      return result;
    }

    const vatRate = Number(countryConfig.import_vat_default_rate);
    result.vat.rate = vatRate;
    
    // VAT base = customs_value + duty
    const vatBaseMin = customsValueRange[0] + dutyRange[0];
    const vatBaseMax = customsValueRange[1] + dutyRange[1];
    
    result.vat.range_usd = [vatBaseMin * vatRate, vatBaseMax * vatRate];
    result.vat.base_formula = '(customs_value + duty) * vat_rate';
    result.assumptions.push(`VAT rate: ${(vatRate * 100).toFixed(1)}% on (customs value + duty)`);
    result.sources.push({
      type: 'supabase_table',
      ref: 'calc_country_tax_config',
      version: passport.dest_country
    });

    return result;
  }
}
