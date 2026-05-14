import { DealPassport, CalculationPackage, HSResult, LogisticsResult, CustomsValueResult, DutyVatResult, CustomsFee } from '../types/contracts';
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
import { RuleRepository } from '../rules/RuleRepository';
import { CustomsValueCalculatorV2 } from '../customs/CustomsValueCalculatorV2';
import { CALC_ENGINE, V2_CUSTOMS_VALUE_IMPL } from '../../config';

export class CalculationOrchestrator {
  private currencyProvider: CurrencyProvider;
  private customsCalculator: CustomsValueCalculator;
  private customsCalculatorV2: CustomsValueCalculatorV2;
  private dutyVatCalculator: DutyVatCalculator;
  private logisticsCalculator: LogisticsCalculator;
  private hsClient: HSClient;
  private dataCache: DataCacheManager;
  private ruleRepository: RuleRepository;
  
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
    this.ruleRepository = new RuleRepository(this.dataCache);
    this.customsCalculatorV2 = new CustomsValueCalculatorV2(this.ruleRepository);
  }
  
  async execute(passport: DealPassport): Promise<CalculationPackage> {
    const engine = process.env.CALC_ENGINE || CALC_ENGINE; 
    const mode = ['legacy', 'v2', 'dual'].includes(engine) ? engine : 'legacy';

    // 1. Legacy Run
    if (mode === 'legacy') return this.runLegacy(passport);

    // 2. Dual / V2
    const v2Promise = this.runV2(passport);

    if (mode === 'v2') {
        const softTimeoutMs = 5000;
        const softTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), softTimeoutMs));
        const result = await Promise.race([v2Promise, softTimeout]);
        
        if (result) return result;
        
        // Contractual Fallback for V2 timeout (Return incomplete instead of 500)
        return {
            status: 'incomplete',
            requires_escalation: true,
            confidence_level: 'low',
            reason_codes: ['V2_TIMEOUT'],
            calculation_trace: { 
                v2_timeout: true,
                error: `V2 Calculation exceeded ${softTimeoutMs}ms limit`
            }
        } as any;
    }

    // Dual Mode: Start legacy and apply timeout to V2
    const legacyPromise = this.runLegacy(passport);
    const v2Timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));

    const [legacyResult, v2Result] = await Promise.all([
        legacyPromise, 
        Promise.race([v2Promise, v2Timeout])
    ]);

    // Compare
    try {
        if (v2Result) {
            const diff = this.compareResults(legacyResult, v2Result);
            legacyResult.calculation_trace.engine_comparison = {
                 mode: 'dual',
                 timestamp: new Date().toISOString(),
                 v2_status: v2Result.status,
                 v2_confidence: v2Result.confidence_level,
                 v2_requires_escalation: v2Result.requires_escalation,
                 v2_reason_codes: v2Result.reason_codes,
                 v2_metadata: v2Result.calculation_trace.v2_metadata,
                 diff_summary: diff
            };
        } else {
            legacyResult.calculation_trace.engine_comparison = {
                mode: 'dual',
                timestamp: new Date().toISOString(),
                v2_timeout: true,
                v2_status: 'timeout',
                diff_summary: { diff_count: null, diffs: [] }
            };
        }
    } catch (e: any) {
        legacyResult.calculation_trace.engine_comparison = { error: e.message };
    }

    return legacyResult;
  }

  private normalizeIntake(passport: DealPassport) {
    const notes: any[] = [];
    const input: DealPassport = { ...passport };
    const todayStr = new Date().toISOString().split('T')[0];

    // Default origin country to "CN"
    if (!input.country_of_origin) {
      input.country_of_origin = 'CN';
      notes.push({ field: 'country_of_origin', original: null, normalized: 'CN', reason: 'Defaulting to CN' });
    }

    // mode_preference vs shipping_mode (normalization)
    // For now we just ensure it's present if available
    
    // Semantics normalization (tri-state)
    const toTriState = (val: boolean | undefined | null): 'yes' | 'no' | 'unknown' => {
      if (val === true) return 'yes';
      if (val === false) return 'no';
      return 'unknown';
    };

    (input as any).v2_freight_inclusion = toTriState(passport.invoice_includes_freight);
    (input as any).v2_insurance_inclusion = toTriState(passport.invoice_includes_insurance);

    return { 
      input, 
      notes, 
      metadata: { todayStr } 
    };
  }

  private mapCustomsV2ToContract(v2: any, incoterms: string): CustomsValueResult {
      return {
          customs_value_usd: [v2.customs_value_usd, v2.customs_value_usd],
          breakdown: {
              invoice_value_usd: v2.breakdown.invoice_value_usd,
              freight_to_border_usd: v2.breakdown.added_freight_usd > 0 ? [v2.breakdown.added_freight_usd, v2.breakdown.added_freight_usd] : undefined,
              insurance_usd: v2.breakdown.added_insurance_usd
          },
          formula_used: `V2-${incoterms}`,
          assumptions: v2.assumptions,
          sources: [], 
          missing_inputs: v2.missing_inputs,
          // Internal V2 metadata for total assembly
          v2_meta: {
              added_freight: v2.breakdown.added_freight_usd,
              added_insurance: v2.breakdown.added_insurance_usd
          }
      } as any;
  }

  private async runV2(passport: DealPassport): Promise<CalculationPackage> {
    const startTime = Date.now();

    // 1. Normalization
    const { input, notes, metadata } = this.normalizeIntake(passport);

    try {
      // DDP always requires escalation in both legacy and V2 paths
      if (input.incoterms === 'DDP') {
        throw new CustomsEscalationError('DDP incoterms requires escalation: duty paid breaks transparent base calculation');
      }

      // 2. Rule Selection (Read-only for now)
      const selectedRules: any[] = [];
      try {
          const incotermsRule = await this.ruleRepository.getIncotermsRule(input.incoterms);
          selectedRules.push({
              rule_id: `${input.incoterms}_INCOTERMS`,
              type: 'incoterms',
              version: 'v1.0.0',
              matched_by: { incoterms: input.incoterms },
              priority: 1
          });
          
          await this.ruleRepository.getInsuranceRule(input.dest_country, input.incoterms);
          selectedRules.push({
              rule_id: `INSURANCE_ALL`,
              type: 'insurance',
              version: 'v1.0.0',
              matched_by: 'global_fallback',
              priority: 0
          });
      } catch (e: any) {
          notes.push({ rule_error: e.message });
      }

      // 3. Pipeline Execution (Using legacy components for now)
      await this.currencyProvider.fetchRates();
      await this.dataCache.ensureLoaded();

      const hsResult: HSResult = {
        candidates: input.hs_code ? [{
          hs_code: input.hs_code,
          confidence: input.hs_confidence || 0.95,
          rationale: ['Provided by user'],
          risk_flags: []
        }] : [],
        requires_human_confirmation: false
      };

      const logisticsResult = await this.logisticsCalculator.calculate(
        input,
        this.dataCache,
        this.currencyProvider.converter
      );

      // --- Customs Value Phase ---
      let customsValueResult: CustomsValueResult;
      // Allow override from process.env for tests, fallback to config
      const customsImpl = process.env.V2_CUSTOMS_VALUE_IMPL || V2_CUSTOMS_VALUE_IMPL; 

      if (customsImpl === 'v2') {
          const freightVal = logisticsResult.freight_to_border_usd ? logisticsResult.freight_to_border_usd[0] : null;
          const v2Raw = await this.customsCalculatorV2.calculate(
              input as any,
              freightVal,
              this.dataCache,
              this.currencyProvider.converter
          );
          customsValueResult = this.mapCustomsV2ToContract(v2Raw, input.incoterms);
          notes.push({ customs_impl: 'v2', diff_risk: 'high' });
      } else {
          customsValueResult = this.customsCalculator.calculate(
              input,
              logisticsResult,
              this.currencyProvider.converter
          );
          notes.push({ customs_impl: 'legacy' });
      }

      const dutyVatResult = await this.dutyVatCalculator.execute(
        input,
        hsResult,
        customsValueResult
      );

      const totals = this.assembleTotals(
        input,
        logisticsResult,
        customsValueResult,
        dutyVatResult
      );

      // 4. Trace & Metadata Assembly
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

      const requiresEscalation = dutyVatResult.requires_escalation || logisticsResult.requires_escalation;
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

      const confidenceLevel = this.calculateConfidenceLevel(
        hsResult,
        allMissingInputs,
        allAssumptions,
        allEscalationReasons,
        logisticsResult.is_defaulted_origin
      );

      const goodsValueUSD = this.currencyProvider.converter.toInternal(
        input.goods_value,
        input.currency
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
          v2_metadata: {
            normalization_notes: notes,
            selected_rules: selectedRules,
            engine_versions: {
              rule_repo: 'v1.0.0'
            }
          },
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
          selected_records: allSources.map(s => ({ type: s.type, id: s.ref, version: s.version })),
          assumptions: allAssumptions,
          warnings: allEscalationReasons
        },
        inputs_normalized: {
          dest_country: input.dest_country,
          incoterms: input.incoterms,
          goods_value_usd: goodsValueUSD,
          weight_gross_kg: input.weight_gross_kg,
          hs_code: input.hs_code
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
        const queryTime = Date.now() - startTime;
        return {
          meta: {
            query_time_ms: queryTime,
            calculation_timestamp: new Date().toISOString(),
            schema_versions: {}
          },
          status: 'escalation_required',
          reason_codes: [],
          calculation_trace: { 
            rule_version: 'v1.0', 
            error: error.message,
            v2_metadata: {
                normalization_notes: notes,
                engine_versions: { rule_repo: 'v1.0.0' }
            }
          },
          inputs_normalized: {
            dest_country: input.dest_country,
            incoterms: input.incoterms,
            goods_value_usd: input.goods_value,
            weight_gross_kg: input.weight_gross_kg,
            hs_code: input.hs_code
          },
          logistics: {
            scenarios: [],
            chargeable_weight_kg: input.weight_gross_kg,
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
    const feesUsd = dutyVat.fees_usd.reduce((sum: number, fee: CustomsFee) => sum + fee.amount, 0);
    
    // Determine which logicistics components to include in Landed Cost
    // Rules:
    // - CIF/CIP: Freight to border is already in invoice. Only add last mile.
    // - EXW/FOB/FCA/DAP: Add both freight to border and last mile.
    // - DAP + invoice_includes_freight=true: freight already paid by seller, don't double-count.
    const isFreightIncludedInInvoice = ['CIF', 'CIP'].includes(passport.incoterms)
      || passport.invoice_includes_freight === true;
    
    let includedShipping: [number, number] | null = null;
    let addedBorderFreight: [number, number] | null = null;
    
    // V2 specific: if V2 already added freight to customs base, 
    // we use that for addedBorderFreight to be consistent.
    const v2Meta = (customsValue as any).v2_meta;
    const v2AddedFreight = v2Meta?.added_freight;
    
    if (v2AddedFreight !== undefined && v2AddedFreight > 0) {
        addedBorderFreight = [v2AddedFreight, v2AddedFreight];
    }

    const effectiveBorderUsd = borderUsd || (isFreightIncludedInInvoice ? [0, 0] : null);

    if (effectiveBorderUsd && !addedBorderFreight) {
       addedBorderFreight = isFreightIncludedInInvoice ? [0, 0] : effectiveBorderUsd;
    }

    if (addedBorderFreight) {
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
