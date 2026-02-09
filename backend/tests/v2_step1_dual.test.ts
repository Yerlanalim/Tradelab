import { describe, it, expect, beforeAll, vi } from 'vitest';
import { DealPassport } from '../src/calc/types/contracts';

// Mock infrastructure
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({
            data: [{
              date: '2026-02-05',
              rates: {
                USD: 470,
                EUR: 520,
                CNY: 65,
                RUB: 5.2,
                KZT: 1
              }
            }],
            error: null
          }))
        }))
      }))
    })),
    rpc: vi.fn()
  }))
}));

vi.mock('../src/calc/hs/HSClient', () => ({
  HSClient: class {
    async getTariff() {
      return {
        import_duty_raw: '10%',
        import_duty_parsed: {
          kind: 'advalorem',
          percent: 0.10
        },
        vat_exempt: false
      };
    }
  }
}));

vi.mock('../src/calc/config/DataCacheManager', () => ({
  DataCacheManager: class {
    async ensureLoaded() { return; }
    query(table: string, filters: Record<string, any> = {}) {
      if (table === 'calc_country_tax_config') {
        return [{ country_code: filters.country_code || 'KZ', import_vat_default_rate: 0.12, active: true }];
      }
      if (table === 'calc_incoterms_rules') {
        return [{
          rule_version: 'v1.0.0',
          incoterms: filters.incoterms,
          customs_components_in_base: [],
          landed_components_in_total: [],
          critical_components: [],
          unknown_policy: 'ESCALATE'
        }];
      }
      if (table === 'calc_insurance_rules') {
        return [{
          rule_version: 'v1.0.0',
          rate_type: 'percent',
          rate_value: 0.01,
          base_type: 'invoice',
          min_premium_usd: 10,
          source_quality: 'fallback'
        }];
      }
      return [];
    }
  }
}));

vi.mock('../src/calc/logistics/LogisticsCalculator', () => ({
  LogisticsCalculator: class {
    async calculate() {
      return {
        scenarios: [],
        chargeable_weight_kg: 100,
        freight_to_border_usd: [200, 250],
        assumptions: [],
        sources: [],
        missing_inputs: [],
        requires_escalation: false,
        escalation_reasons: []
      };
    }
  }
}));

describe('V2 Step 1 - Dual Run Verification', () => {
  let CalculationOrchestrator: any;
  let orchestrator: any;

  beforeAll(async () => {
    process.env.CALC_ENGINE = 'dual';
    vi.resetModules();
    const mod = await import('../src/calc/orchestrator/CalculationOrchestrator');
    CalculationOrchestrator = mod.CalculationOrchestrator;
    orchestrator = new CalculationOrchestrator();
  });

  it('should run both engines and return 0 diffs in Step 1', async () => {
    const passport: DealPassport = {
      dest_country: 'KZ',
      incoterms: 'CIF',
      goods_value: 10000,
      currency: 'USD',
      weight_gross_kg: 100,
      hs_code: '8471300000'
    };

    const result = await orchestrator.execute(passport);

    // Verify dual mode indicator
    expect(result.calculation_trace.engine_comparison).toBeDefined();
    expect(result.calculation_trace.engine_comparison.mode).toBe('dual');
    
    // Verify 0 diffs
    const diff = result.calculation_trace.engine_comparison.diff_summary;
    expect(diff.diff_count).toBe(0);
    expect(diff.diffs).toHaveLength(0);

    // Verify V2 Trace Metadata
    // Note: v2Result is technically internal, but it's part of comparison trace or reachable?
    // Actually, comparison trace contains v2Result fields.
    expect(result.calculation_trace.engine_comparison.v2_confidence).toBeDefined();

    console.log('✅ Dual Run Verification: diff_count = 0');
  });

  it('should show V2 normalization notes in trace', async () => {
    const passport: DealPassport = {
      dest_country: 'KZ',
      incoterms: 'CIF',
      goods_value: 10000,
      currency: 'USD',
      weight_gross_kg: 100,
      hs_code: '8471300000'
      // Missing country_of_origin
    };

    const result = await orchestrator.execute(passport);

    expect(result.status).toBe('ok');
    expect(result.calculation_trace.engine_comparison.v2_metadata.normalization_notes).toContainEqual(
      expect.objectContaining({ field: 'country_of_origin', normalized: 'CN' })
    );

    console.log('✅ V2 Normalization notes verified');
  });
});
