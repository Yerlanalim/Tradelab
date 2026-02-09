import { describe, it, expect, beforeAll, vi } from 'vitest';
import { CalculationOrchestrator } from '../src/calc/orchestrator/CalculationOrchestrator';
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
              rates: { USD: 470, EUR: 520, CNY: 65, RUB: 5.2, KZT: 1 }
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
        import_duty_parsed: { kind: 'advalorem', percent: 0.10 },
        vat_exempt: false
      };
    }
  }
}));

vi.mock('../src/calc/config/DataCacheManager', () => ({
  DataCacheManager: class {
    async ensureLoaded() { return; }
    query(table: string, filters: Record<string, any> = {}) {
      if (table === 'calc_country_tax_config') return [{ country_code: filters.country_code || 'KZ', import_vat_default_rate: 0.12, active: true }];
      if (table === 'calc_incoterms_rules') return [{
          rule_version: 'v1.0.0',
          incoterms: filters.incoterms,
          customs_components_in_base: ['border_freight', 'insurance'],
          landed_components_in_total: [],
          critical_components: ['border_freight'],
          unknown_policy: 'ESCALATE'
      }];
      if (table === 'calc_insurance_rules') return [{
          rule_version: 'v1.0.0',
          rate_type: 'percent',
          rate_value: 0.01,
          base_type: 'invoice',
          min_premium_usd: 10,
          source_quality: 'fallback'
      }];
      // Inclusion rules
      if (table === 'calc_component_inclusion_rules') {
         if (filters.component === 'border_freight') return [{ default_included: 'no', can_override_by_user: true }];
         if (filters.component === 'insurance') return [{ default_included: 'no', can_override_by_user: true }];
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
        freight_to_border_usd: [200, 200],
        assumptions: [],
        sources: [],
        missing_inputs: [],
        requires_escalation: false,
        escalation_reasons: []
      };
    }
  }
}));

// Force V2 Customs Impl for this test
vi.mock('../../src/config', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    CALC_ENGINE: 'dual',
    V2_CUSTOMS_VALUE_IMPL: 'v2'
  };
});

describe('V2 Step 2 - Customs V2 Implementation Check', () => {
  let orchestrator: CalculationOrchestrator;

  beforeAll(() => {
    process.env.V2_CUSTOMS_VALUE_IMPL = 'v2';
    process.env.CALC_ENGINE = 'dual';
    orchestrator = new CalculationOrchestrator();
  });

  it('should use CustomsValueCalculatorV2 when flag is set', async () => {
    const passport: DealPassport = {
      dest_country: 'KZ',
      incoterms: 'CIF',
      goods_value: 10000,
      currency: 'USD',
      weight_gross_kg: 100,
      hs_code: '8471300000',
      invoice_includes_freight: false,
      invoice_includes_insurance: false
    };

    const result = await orchestrator.execute(passport);

    // Verify V2 was used
    expect(result.calculation_trace.engine_comparison.v2_metadata.normalization_notes).toContainEqual(
      expect.objectContaining({ customs_impl: 'v2' })
    );

    // V1 CIF Logic: Invoice only (Legacy CustomsValueCalculator.ts line 33)
    // V2 CIF Logic (with our mocks): Invoice + Added Freight + Added Insurance
    // CIF IncotermsRule in mock says inclusion='border_freight', 'insurance'.
    // V2 sees user provided 'no' -> Adds them.
    // 10000 + 200 (freight) + 100 (1% of 10000) = 10300
    
    // In dual mode, we should see a diff now
    const diff = result.calculation_trace.engine_comparison.diff_summary;
    expect(diff.diff_count).toBeGreaterThan(0);
    
    // Stop-Condition Checks:
    // 1. Confine Diffs: only allow status, reason_codes, customs_value_usd and derived landed_cost
    const allowedPaths = ['status', 'reason_codes', 'customs_value_usd', 'landed_cost'];
    const invalidDiffs = diff.diffs.filter((d: any) => !allowedPaths.includes(d.path));
    expect(invalidDiffs, `Unexpected diffs found: ${JSON.stringify(invalidDiffs)}`).toHaveLength(0);

    // 2. Sign Check (Stop Condition ARC-01): No negative values, ensuring components added correctly
    expect(result.customs_value.customs_value_usd[0]).toBeGreaterThan(0);
    expect(result.customs_value.breakdown.invoice_value_usd).toBe(10000);
    
    // 3. Logic Check: VAT rate must remain identical (legacy calculator still used)
    const vatDiff = diff.diffs.find((d: any) => d.path === 'vat.rate');
    expect(vatDiff).toBeUndefined();

    // 4. Trace detail
    expect(diff.diffs).toContainEqual(expect.objectContaining({
        path: 'customs_value_usd',
        legacy: [10000, 10000],
        v2: [10300, 10300]
    }));

    console.log('✅ Customs V2 Step 2: Stop Conditions Verified');
  });
});
