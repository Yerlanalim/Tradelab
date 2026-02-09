import { CalculationOrchestrator } from '../src/calc/orchestrator/CalculationOrchestrator';
import { DealPassport, TariffInfo } from '../src/calc/types/contracts';
import { vi, beforeEach, describe, it, expect } from 'vitest';

// Mock Supabase client
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

// Mock HSClient
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

// Mock DataCacheManager
vi.mock('../src/calc/config/DataCacheManager', () => ({
  DataCacheManager: class {
    async ensureLoaded() {
      return undefined;
    }
    query(table: string) {
      if (table === 'calc_country_tax_config') {
        return [{
          country_code: 'KZ',
          import_vat_default_rate: 0.12,
          active: true
        }];
      }
      if (table === 'calc_incoterms_rules') {
        return [{
          incoterms: 'CIF',
          customs_components_in_base: [],
          landed_components_in_total: ['product', 'duty', 'vat'],
          critical_components: [],
          unknown_policy: 'ASSUME_DEFAULT'
        }, {
          incoterms: 'DDP',
          customs_components_in_base: ['border_freight', 'insurance'],
          landed_components_in_total: ['product', 'duty', 'vat', 'shipping'],
          critical_components: [],
          unknown_policy: 'ESCALATE'
        }];
      }
      return [];
    }
  }
}));

// Mock LogisticsCalculator
vi.mock('../src/calc/logistics/LogisticsCalculator', () => ({
  LogisticsCalculator: class {
    async calculate() {
      return {
        scenarios: [],
        chargeable_weight_kg: 100,
        freight_to_border_usd: [200, 200],
        assumptions: ['Logistics stub'],
        sources: [],
        missing_inputs: [],
        requires_escalation: false,
        escalation_reasons: []
      };
    }
  }
}));

describe('CalculationOrchestrator - Integration Test', () => {
  let orchestrator: CalculationOrchestrator;

  beforeEach(() => {
    process.env.CALC_ENGINE = 'legacy';
    orchestrator = new CalculationOrchestrator();
  });

  it('should calculate complete quote for CIF + advalorem 10% + VAT 12%', async () => {
    // Arrange: Simple CIF scenario
    const passport: DealPassport = {
      dest_country: 'KZ',
      incoterms: 'CIF',
      goods_value: 10000,
      currency: 'USD',
      weight_gross_kg: 100,
      hs_code: '8471300000'
    };

    // Act: Execute calculation
    const result = await orchestrator.execute(passport);

    // Assert: Verify structure
    expect(result.meta).toBeDefined();
    expect(result.meta.query_time_ms).toBeGreaterThan(0);
    expect(result.status).toBe('ok');

    // Verify customs value (CIF: invoice only)
    expect(result.customs_value).toBeDefined();
    expect(result.customs_value.customs_value_usd).toEqual([10000, 10000]);
    expect(result.customs_value.breakdown.invoice_value_usd).toBe(10000);
    expect(result.customs_value.formula_used).toContain('CIF');

    // Verify duty calculation (10% of 10000 = 1000)
    expect(result.duty_vat).toBeDefined();
    expect(result.duty_vat.duty.range_usd).toEqual([1000, 1000]);
    expect(result.duty_vat.duty.breakdown).toHaveLength(1);
    expect(result.duty_vat.duty.breakdown[0].type).toBe('advalorem');
    expect(result.duty_vat.duty.breakdown[0].advalorem_rate).toBe(0.10);

    // Verify VAT calculation (12% of (10000 + 1000) = 1320)
    expect(result.duty_vat.vat.rate).toBe(0.12);
    expect(result.duty_vat.vat.range_usd[0]).toBeCloseTo(1320, 1);
    expect(result.duty_vat.vat.range_usd[1]).toBeCloseTo(1320, 1);

    // Verify total (duty + vat = 1000 + 1320 = 2320)
    expect(result.duty_vat.total_range_usd[0]).toBeCloseTo(2320, 1);
    expect(result.duty_vat.total_range_usd[1]).toBeCloseTo(2320, 1);

    // Verify totals structure
    expect(result.totals).toBeDefined();
    expect(result.totals.components.product_cost_usd).toBe(10000);
    expect(result.totals.components.duty_usd).toEqual([1000, 1000]);
    expect(result.totals.components.vat_usd[0]).toBeCloseTo(1320, 1);

    // Verify logistics (stub should return minimal structure)
    expect(result.logistics).toBeDefined();
    expect(result.logistics.scenarios).toEqual([]);

    // Verify sources are tracked
    expect(result.all_sources.length).toBeGreaterThan(0);
    expect(result.confidence_level).toBeDefined();

    console.log('✅ Integration test passed: CIF calculation flow works end-to-end');
    console.log(`   Customs value: ${result.customs_value.customs_value_usd}`);
    console.log(`   Duty: ${result.duty_vat.duty.range_usd}`);
    console.log(`   VAT: ${result.duty_vat.vat.range_usd}`);
    console.log(`   Total: ${result.duty_vat.total_range_usd}`);
  });

  it('should handle DDP escalation correctly', async () => {
    const passport: DealPassport = {
      dest_country: 'KZ',
      incoterms: 'DDP',
      goods_value: 10000,
      currency: 'USD',
      weight_gross_kg: 100,
      hs_code: '8471300000'
    };

    const result = await orchestrator.execute(passport);

    // DDP should trigger escalation
    expect(result.status).toBe('escalation_required');
    expect(result.escalation_reasons.some(r => r.includes('DDP'))).toBe(true);

    console.log('✅ DDP escalation test passed');
  });

  it('should handle low HS confidence with escalation flag', async () => {
    const passport: DealPassport = {
      dest_country: 'KZ',
      incoterms: 'CIF',
      goods_value: 10000,
      currency: 'USD',
      weight_gross_kg: 100,
      hs_code: '8471300000',
      hs_confidence: 0.50 // Low confidence
    };

    const result = await orchestrator.execute(passport);

    // Should calculate but flag for escalation
    expect(result.customs_value).toBeDefined();
    expect(result.duty_vat.requires_escalation).toBe(true);
    expect(result.duty_vat.escalation_reasons.some(r => r.includes('Low HS confidence'))).toBe(true);

    console.log('✅ Low confidence escalation test passed');
  });
});
