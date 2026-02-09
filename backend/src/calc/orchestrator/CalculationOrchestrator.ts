import { DealPassport, CalculationPackage, HSResult, LogisticsResult, CustomsValueResult, DutyVatResult } from '../types/contracts';
import { EscalationRequiredError as CustomsEscalationError } from '../customs/CustomsValueCalculator';
import { CurrencyProvider } from '../currency/CurrencyProvider';
import { CustomsValueCalculator } from '../customs/CustomsValueCalculator';
import { DutyVatCalculator } from '../duty/DutyVatCalculator';
import { LogisticsCalculator } from '../logistics/LogisticsCalculator';
import { HSClient } from '../hs/HSClient';
import { DataCacheManager } from '../config/DataCacheManager';
import {
  aggregateSources,
  aggregateAssumptions,
  aggregateMissingInputs,
  aggregateEscalationReasons
} from './aggregate';
import { ReasonCodeMapper } from './ReasonCodeMapper';
import { CALC_ENGINE } from '../../config';

export class CalculationOrchestrator {
  private currencyProvider: CurrencyProvider;
  private customsCalculator: CustomsValueCalculator;
  private dutyVatCalculator: DutyVatCalculator;
  private logisticsCalculator: LogisticsCalculator;
  private hsClient: HSClient;
  private dataCache: DataCacheManager;
  
  constructor() {
    this.currencyProvider = new CurrencyProvider();
    this.hsClient = new HSClient();
    this.dataCache = new DataCacheManager();
    this.customsCalculator = new CustomsValueCalculator();
    this.dutyVatCalculator = new DutyVatCalculator(
      this.hsClient,
      this.dataCache,
      this.currencyProvider.converter
    );
    this.logisticsCalculator = new LogisticsCalculator();
  }
  
  async execute(passport: DealPassport): Promise<CalculationPackage> {
    const engine = CALC_ENGINE; 
    const mode = ['legacy', 'v2', 'dual'].includes(engine) ? engine : 'legacy';

    // 1. Legacy Run
    if (mode === 'legacy') return this.runLegacy(passport);

    // 2. Dual / V2
    const legacyPromise = this.runLegacy(passport);
    const v2Promise = this.runV2(passport);

    if (mode === 'v2') return v2Promise;

    // Dual Mode
    const [legacyResult, v2Result] = await Promise.all([legacyPromise, v2Promise]);

    // Compare
    try {
        const diff = this.compareResults(legacyResult, v2Result);
        legacyResult.calculation_trace.engine_comparison = {
             mode: 'dual',
             timestamp: new Date().toISOString(),
             v2_status: v2Result.status,
             v2_confidence: v2Result.confidence_level,
             v2_requires_escalation: v2Result.requires_escalation,
             diff_summary: diff,
             v2_reason_codes: v2Result.reason_codes
        };
    } catch (e: any) {
        legacyResult.calculation_trace.engine_comparison = { error: e.message };
    }

    return legacyResult;
  }

  private async runV2(passport: DealPassport): Promise<CalculationPackage> {
      // MVP V2: Currently identical to Legacy to establish baseline.
      // In future steps, this will use RuleRepository and new logic.
      return this.runLegacy(passport);
  }

  private compareResults(legacy: CalculationPackage, v2: CalculationPackage): any {
      const diffs: any[] = [];
      const tol = 0.01; // $0.01
      const tolRate = 1e-9;

      // Status
      if (legacy.status !== v2.status) diffs.push({ path: 'status', legacy: legacy.status, v2: v2.status });
      if (legacy.requires_escalation !== v2.requires_escalation) diffs.push({ path: 'requires_escalation', legacy: legacy.requires_escalation, v2: v2.requires_escalation });

      // Customs Value
      const lCV = legacy.customs_value.customs_value_usd;
      const vCV = v2.customs_value.customs_value_usd;
      if (Math.abs(lCV[0] - vCV[0]) > tol || Math.abs(lCV[1] - vCV[1]) > tol) {
          diffs.push({ path: 'customs_value_usd', legacy: lCV, v2: vCV });
      }

      // VAT Rate
      if (Math.abs(legacy.duty_vat.vat.rate - v2.duty_vat.vat.rate) > tolRate) {
           diffs.push({ path: 'vat.rate', legacy: legacy.duty_vat.vat.rate, v2: v2.duty_vat.vat.rate });
      }

      // Totals
      if (legacy.totals.landed_cost_range_usd && v2.totals.landed_cost_range_usd) {
           const lTotal = legacy.totals.landed_cost_range_usd;
           const vTotal = v2.totals.landed_cost_range_usd;
           if (Math.abs(lTotal[0] - vTotal[0]) > tol || Math.abs(lTotal[1] - vTotal[1]) > tol) {
               diffs.push({ path: 'landed_cost', legacy: lTotal, v2: vTotal });
           }
      } else if (legacy.totals.landed_cost_range_usd !== v2.totals.landed_cost_range_usd) {
           diffs.push({ path: 'landed_cost', legacy: legacy.totals.landed_cost_range_usd, v2: v2.totals.landed_cost_range_usd });
      }

      // Reason Codes (Set comparison)
      const lCodes = new Set(legacy.reason_codes);
      const vCodes = new Set(v2.reason_codes);
      if (lCodes.size !== vCodes.size || [...lCodes].some(c => !vCodes.has(c))) {
           diffs.push({ path: 'reason_codes', legacy: legacy.reason_codes, v2: v2.reason_codes });
      }

      return {
          diff_count: diffs.length,
          diffs
      };
  }

  private async runLegacy(passport: DealPassport): Promise<CalculationPackage> {
    const startTime = Date.now();
    
    try {
      // Initialize infrastructure (once)
      await this.currencyProvider.fetchRates();
      await this.dataCache.ensureLoaded();
      
      // Build HSResult from passport (if hs_code provided)
      const hsResult: HSResult = {
        candidates: passport.hs_code ? [{
          hs_code: passport.hs_code,
          confidence: passport.hs_confidence || 0.95,
          rationale: ['Provided by user'],
          risk_flags: []
        }] : [],
        requires_human_confirmation: false
      };

      // Calculate logistics
      const logisticsResult = await this.logisticsCalculator.calculate(
        passport,
        this.dataCache,
        this.currencyProvider.converter
      );
      
      // Calculate customs value
      const customsValueResult = this.customsCalculator.calculate(
        passport,
        logisticsResult,
        this.currencyProvider.converter
      );
      
      // Calculate duty and VAT
      const dutyVatResult = await this.dutyVatCalculator.execute(
        passport,
        hsResult,
        customsValueResult
      );
      
      // Assemble totals
      const totals = this.assembleTotals(
        passport,
        logisticsResult,
        customsValueResult,
        dutyVatResult
      );
      
      // Aggregate all metadata
      const allSources = aggregateSources([
        customsValueResult.sources,
        dutyVatResult.sources,
        logisticsResult.sources
      ]);
      
      const allAssumptions = aggregateAssumptions([
        customsValueResult.assumptions,
        dutyVatResult.assumptions,
        logisticsResult.assumptions
      ]);
      
      const allMissingInputs = aggregateMissingInputs([
        customsValueResult.missing_inputs,
        dutyVatResult.missing_inputs,
        logisticsResult.missing_inputs
      ]);
      
      const allEscalationReasons = aggregateEscalationReasons([
        dutyVatResult.escalation_reasons,
        logisticsResult.escalation_reasons
      ]);
      
      // Determine overall escalation status
      const requiresEscalation = 
        dutyVatResult.requires_escalation ||
        logisticsResult.requires_escalation;
      
      // Determine status
      let status: 'ok' | 'incomplete' | 'escalation_required';
      
      const hasValidLandedCost = totals.landed_cost_range_usd !== null;

      if (requiresEscalation) {
        status = 'escalation_required';
      } else if (allMissingInputs.length > 0 || hsResult.candidates.length === 0 || !hasValidLandedCost) {
        status = 'incomplete';
        if (allMissingInputs.length === 0 && !hasValidLandedCost) {
            allMissingInputs.push('valid_shipping_route_or_rates');
        }
      } else {
        status = 'ok';
      }
      
      // Calculate confidence level
      const confidenceLevel = this.calculateConfidenceLevel(
        hsResult,
        allMissingInputs,
        allAssumptions,
        allEscalationReasons,
        logisticsResult.is_defaulted_origin
      );
      
      // Normalize inputs
      const goodsValueUSD = this.currencyProvider.converter.toInternal(
        passport.goods_value,
        passport.currency
      );
      
      return {
        meta: {
          query_time_ms: Date.now() - startTime,
          calculation_timestamp: new Date().toISOString(),
          schema_versions: {
            customs_value_rules_version: '1.0',
            config_version: 'v1.0'
          },
          is_defaulted_origin: logisticsResult.is_defaulted_origin
        },
        
        status,

        reason_codes: ReasonCodeMapper.map(allMissingInputs, allEscalationReasons),
        
        calculation_trace: { 
            rule_version: 'v1.0',
            components: {
                 logistics: logisticsResult.scenarios[0] ? {
                     mode: logisticsResult.scenarios[0].mode,
                     transit_days: logisticsResult.scenarios[0].transit_days_range,
                 } : null,
                 customs_value: {
                     formula: customsValueResult.formula_used,
                     base_usd: customsValueResult.customs_value_usd
                 },
                 duty_vat: {
                     vat_rate: dutyVatResult.vat.rate,
                     base_formula: dutyVatResult.vat.base_formula
                 }
            },
            selected_records: allSources.map(s => ({
                 type: s.type,
                 id: s.ref, 
                 version: s.version 
             })),
            assumptions: allAssumptions,
            warnings: allEscalationReasons
        },

        inputs_normalized: {
          dest_country: passport.dest_country,
          incoterms: passport.incoterms,
          goods_value_usd: goodsValueUSD,
          weight_gross_kg: passport.weight_gross_kg,
          hs_code: passport.hs_code
        },
        
        hs_classification: hsResult.candidates.length > 0 ? hsResult : undefined,
        logistics: logisticsResult,
        customs_value: customsValueResult,
        duty_vat: dutyVatResult,
        
        totals,
        
        all_assumptions: allAssumptions,
        all_sources: allSources,
        all_missing_inputs: allMissingInputs,
        
        requires_escalation: requiresEscalation,
        escalation_reasons: allEscalationReasons,
        
        confidence_level: confidenceLevel
      };
      
    } catch (error) {
      if (error instanceof CustomsEscalationError) {
        // DDP or other escalation from customs calculator
        const queryTime = Date.now() - startTime;
        
        return {
          meta: {
            query_time_ms: queryTime,
            calculation_timestamp: new Date().toISOString(),
            schema_versions: {}
          },
          status: 'escalation_required',
          reason_codes: [],
          calculation_trace: { rule_version: 'v1.0', error: error.message },
          inputs_normalized: {
            dest_country: passport.dest_country,
            incoterms: passport.incoterms,
            goods_value_usd: passport.goods_value,
            weight_gross_kg: passport.weight_gross_kg,
            hs_code: passport.hs_code
          },
          logistics: {
            scenarios: [],
            chargeable_weight_kg: passport.weight_gross_kg,
            assumptions: [],
            sources: [],
            missing_inputs: [],
            requires_escalation: false,
            escalation_reasons: []
          },
          customs_value: {
            customs_value_usd: [0, 0],
            breakdown: { invoice_value_usd: 0 },
            formula_used: '',
            assumptions: [],
            sources: [],
            missing_inputs: []
          },
          duty_vat: {
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
            requires_escalation: true,
            escalation_reasons: [error.message]
          },
          totals: {
            landed_cost_range_usd: null,
            components: {
              product_cost_usd: 0,
              shipping_usd: null,
              shipping_to_border_usd: null,
              shipping_last_mile_usd: null,
              estimated_border_freight_usd: null,
              added_border_freight_usd: null,
              estimated_last_mile_freight_usd: null,
              added_last_mile_freight_usd: null,
              duty_usd: [0, 0],
              vat_usd: [0, 0],
              fees_usd: 0
            }
          },
          all_assumptions: [],
          all_sources: [],
          all_missing_inputs: [],
          requires_escalation: true,
          escalation_reasons: [error.message],
          confidence_level: 'low'
        };
      }
      throw error;
    }
  }
  
  private assembleTotals(
    passport: DealPassport,
    logistics: LogisticsResult,
    customsValue: CustomsValueResult,
    dutyVat: DutyVatResult
  ) {
    const productCost = customsValue.breakdown.invoice_value_usd;
    const borderUsd = logistics.freight_to_border_usd || null;
    const lastMileUsd = logistics.last_mile_usd || [0, 0];
    const dutyUsd = dutyVat.duty.range_usd;
    const vatUsd = dutyVat.vat.range_usd;
    const feesUsd = dutyVat.fees_usd.reduce((sum: number, fee: any) => sum + fee.amount_usd, 0);
    
    // Determine which logicistics components to include in Landed Cost
    // Rules:
    // - CIF/CIP: Freight to border is already in invoice. Only add last mile.
    // - EXW/FOB/FCA/DAP: Add both freight to border and last mile.
    const isFreightIncludedInInvoice = ['CIF', 'CIP'].includes(passport.incoterms);
    
    let includedShipping: [number, number] | null = null;
    let addedBorderFreight: [number, number] | null = null;
    
    // If CIF/CIP, we don't need borderUsd to perform the sum (it's 0 addition).
    // If EXW/FOB, we NEED borderUsd.
    const effectiveBorderUsd = borderUsd || (isFreightIncludedInInvoice ? [0, 0] : null);

    if (effectiveBorderUsd) {
       addedBorderFreight = isFreightIncludedInInvoice ? [0, 0] : effectiveBorderUsd;
       const min = addedBorderFreight[0] + lastMileUsd[0];
       const max = addedBorderFreight[1] + lastMileUsd[1];
       includedShipping = [min, max];
    }
    
    // Calculate landed cost only if we have all components
    let landedCostRange: [number, number] | null = null;
    
    if (includedShipping !== null) {
      const minCost = productCost + includedShipping[0] + dutyUsd[0] + vatUsd[0] + feesUsd;
      const maxCost = productCost + includedShipping[1] + dutyUsd[1] + vatUsd[1] + feesUsd;
      landedCostRange = [minCost, maxCost];
    }
    
    return {
      landed_cost_range_usd: landedCostRange,
      components: {
        product_cost_usd: productCost,
        shipping_usd: includedShipping,
        shipping_to_border_usd: borderUsd, // Legacy ref -> Estimated
        shipping_last_mile_usd: lastMileUsd, // Legacy ref -> Estimated/Added (usually same for last mile)
        
        estimated_border_freight_usd: borderUsd,
        added_border_freight_usd: addedBorderFreight,
        estimated_last_mile_freight_usd: lastMileUsd,
        added_last_mile_freight_usd: lastMileUsd,

        duty_usd: dutyUsd,
        vat_usd: vatUsd,
        fees_usd: feesUsd
      }
    };
  }
  
  private calculateConfidenceLevel(
    hsResult: HSResult,
    missingInputs: string[],
    assumptions: string[],
    escalationReasons: string[],
    isDefaultedOrigin: boolean = false
  ): 'high' | 'medium' | 'low' {
    const topConfidence = hsResult.candidates.length > 0
      ? Math.max(...hsResult.candidates.map(c => c.confidence))
      : 0;
    
    const hasRiskFlags = hsResult.candidates.some(c => c.risk_flags.length > 0);
    const hasCriticalMissing = missingInputs.some(m => 
      m.includes('freight_to_border') || m.includes('hs_code') || m.includes('weight')
    );
    const hasHeuristicAssumptions = assumptions.some(a => 
      a.includes('Insurance:') || a.includes('border_fraction') // "Last mile" is standard, doesn't degrade confidence
    );
    
    // Check if logistics came from real rate cards
    const hasLogisticsRateCard = assumptions.every(a => !a.includes('Freight calculated from 0 rate card')); 

    // HIGH: real rate cards used, no critical warnings, explicit origin country
    const isCleanLogistics = !hasHeuristicAssumptions && hasLogisticsRateCard && !isDefaultedOrigin;

    if (
      topConfidence >= 0.85 &&
      !hasRiskFlags &&
      missingInputs.length === 0 &&
      escalationReasons.length === 0 &&
      isCleanLogistics
    ) {
      return 'high';
    }
    
    // LOW: critical problems
    if (
      topConfidence < 0.65 ||
      hasCriticalMissing ||
      escalationReasons.length > 0
    ) {
      return 'low';
    }
    
    // MEDIUM: everything else
    return 'medium';
  }
}
