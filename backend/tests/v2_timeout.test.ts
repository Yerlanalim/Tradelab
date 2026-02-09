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
              rates: { USD: 1, KZT: 1 }
            }],
            error: null
          }))
        }))
      }))
    })),
    rpc: vi.fn()
  }))
}));

vi.mock('../src/calc/hs/HSClient', () => ({ HSClient: class { async getTariff() { return { import_duty_raw: '0%' }; } } }));
vi.mock('../src/calc/config/DataCacheManager', () => ({
  DataCacheManager: class {
    async ensureLoaded() { return; }
    query(table: string) {
        if (table === 'calc_country_tax_config') return [{ country_code: 'KZ', import_vat_default_rate: 0.12, active: true }];
        return [];
    }
  }
}));

describe('V2 Timeout Verification', () => {
  let orchestrator: CalculationOrchestrator;

  beforeAll(() => {
    process.env.CALC_ENGINE = 'dual';
    orchestrator = new CalculationOrchestrator();
  });

  it('should handle V2 timeout by flagging it in trace', async () => {
    // Mock runV2 to be slow
    const spy = vi.spyOn(orchestrator as any, 'runV2').mockImplementation(() => {
        return new Promise(resolve => setTimeout(() => resolve({ status: 'ok' } as any), 2000));
    });

    const passport: DealPassport = {
      dest_country: 'KZ',
      incoterms: 'CIF',
      goods_value: 1000,
      currency: 'USD',
      weight_gross_kg: 10,
      hs_code: '123'
    };

    const result = await orchestrator.execute(passport);

    expect(result.calculation_trace.engine_comparison.v2_timeout).toBe(true);
    expect(result.calculation_trace.engine_comparison.v2_status).toBe('timeout');
    expect(result.calculation_trace.engine_comparison.diff_summary.diff_count).toBeNull();

    console.log('✅ V2 Timeout handled correctly (Dual Mode)');
    spy.mockRestore();
  });

  it('should NOT throw in V2-only mode on timeout, but return incomplete + V2_TIMEOUT', async () => {
    process.env.CALC_ENGINE = 'v2';
    // Mock runV2 to be very slow (exceeding 5s)
    const spy = vi.spyOn(orchestrator as any, 'runV2').mockImplementation(() => {
        return new Promise(resolve => setTimeout(() => resolve({ status: 'ok' } as any), 6000));
    });

    const passport: DealPassport = {
      dest_country: 'KZ',
      incoterms: 'CIF',
      goods_value: 1000,
      currency: 'USD',
      weight_gross_kg: 10,
      hs_code: '123'
    };

    const result = await orchestrator.execute(passport);

    expect(result.status).toBe('incomplete');
    expect(result.reason_codes).toContain('V2_TIMEOUT');
    expect(result.calculation_trace.v2_timeout).toBe(true);

    console.log('✅ V2-only Timeout handled via contractual fallback');
    spy.mockRestore();
  }, 10000);
});
