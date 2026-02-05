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
    async ensureLoaded() {
      return undefined;
    }
    query() {
      return [{
        country_code: 'KZ',
        import_vat_default_rate: 0.12,
        active: true
      }];
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

describe('Golden Test Suite', () => {
  let orchestrator: CalculationOrchestrator;

  beforeAll(() => {
    orchestrator = new CalculationOrchestrator();
  });

  it('Golden: CIF + Advalorem 10% + VAT 12%', async () => {
    const passport: DealPassport = {
      dest_country: 'KZ',
      incoterms: 'CIF',
      goods_value: 10000,
      currency: 'USD',
      weight_gross_kg: 100,
      hs_code: '8471300000'
    };

    const result = await orchestrator.execute(passport);

    expect(result.status).toBe('ok');
    expect(result.customs_value.customs_value_usd).toEqual([10000, 10000]);
    expect(result.duty_vat.duty.range_usd).toEqual([1000, 1000]);
    expect(result.duty_vat.vat.range_usd[0]).toBeCloseTo(1320, 1);
    expect(result.confidence_level).toBe('high');
    expect(result.all_missing_inputs).toEqual([]);

    console.log('✅ Golden test passed: CIF + Advalorem 10% + VAT 12%');
  });

  it('Golden: DDP requires escalation', async () => {
    const passport: DealPassport = {
      dest_country: 'KZ',
      incoterms: 'DDP',
      goods_value: 15000,
      currency: 'USD',
      weight_gross_kg: 150,
      hs_code: '8471300000'
    };

    const result = await orchestrator.execute(passport);

    expect(result.status).toBe('escalation_required');
    expect(result.escalation_reasons.some(r => r.includes('DDP'))).toBe(true);
    expect(result.confidence_level).toBe('low');

    console.log('✅ Golden test passed: DDP requires escalation');
  });

  it('Golden: Low HS confidence triggers escalation', async () => {
    const passport: DealPassport = {
      dest_country: 'KZ',
      incoterms: 'CIF',
      goods_value: 7000,
      currency: 'USD',
      weight_gross_kg: 70,
      hs_code: '8471300000',
      hs_confidence: 0.50
    };

    const result = await orchestrator.execute(passport);

    // Low confidence triggers escalation
    expect(result.status).toBe('escalation_required');
    expect(result.requires_escalation).toBe(true);
    expect(result.escalation_reasons.some(r => r.includes('Low HS confidence'))).toBe(true);
    expect(result.confidence_level).toBe('low');

    console.log('✅ Golden test passed: Low HS confidence triggers escalation');
  });

  it('Golden: Currency conversion EUR to USD', async () => {
    const passport: DealPassport = {
      dest_country: 'KZ',
      incoterms: 'CIF',
      goods_value: 5000,
      currency: 'EUR',
      weight_gross_kg: 50,
      hs_code: '8471300000'
    };

    const result = await orchestrator.execute(passport);

    expect(result.status).toBe('ok');
    // 5000 EUR * (520/470) ≈ 5532 USD
    expect(result.inputs_normalized.goods_value_usd).toBeGreaterThan(5000);

    console.log('✅ Golden test passed: Currency conversion EUR to USD');
  });
});
