
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CalculationOrchestrator } from '../src/calc/orchestrator/CalculationOrchestrator';
import { DealPassport } from '../src/calc/types/contracts';

// 1.1 & 1.4: HSClient endpoint and Orchestrator logic
// Mocking the HSClient to test orchestrator behavior on missing HS
vi.mock('../src/calc/hs/HSClient', () => ({
  HSClient: class {
    async getTariff(hsCode: string) {
      if (hsCode === 'MISSING') {
        throw new Error('HS Engine error: 404 Not Found');
      }
      return {
        import_duty_raw: '10%',
        import_duty_parsed: { kind: 'advalorem', percent: 0.1 },
        vat_exempt: false,
        special_conditions: []
      };
    }
  }
}));

// Mock DataCacheManager to avoid Supabase calls
vi.mock('../src/calc/config/DataCacheManager', () => ({
  DataCacheManager: class {
    async ensureLoaded() { return; }
    query(table: string) {
      if (table === 'calc_country_tax_config') {
        return [{ country_code: 'RU', import_vat_default_rate: 0.2, active: true }];
      }
      if (table === 'calc_shipping_rate_cards') {
        return [{ rate_id: 'R1', lane_id: 'L1', price_basis: 'kg', active: true, rate_per_unit: 5, currency: 'USD' }];
      }
      if (table === 'calc_shipping_lanes') {
        return [{ lane_id: 'L1', origin_country: 'CN', dest_country: 'RU', enabled: true }];
      }
      return [];
    }
  }
}));

// Mock CurrencyProvider
vi.mock('../src/calc/currency/CurrencyProvider', () => ({
  CurrencyProvider: class {
    async fetchRates() { return; }
    converter = {
      toInternal: (val: number) => val,
      fromInternal: (val: number) => val
    };
  }
}));

describe('Backend Regressions', () => {
  let orchestrator: CalculationOrchestrator;

  beforeEach(() => {
    orchestrator = new CalculationOrchestrator();
  });

  // Regression 1.4: Orchestrator status incomplete instead of escalation for missing HS (not provided)
  it('should return status incomplete when HS code is not provided', async () => {
    const passport: DealPassport = {
      dest_country: 'RU',
      incoterms: 'CIF',
      goods_value: 1000,
      currency: 'USD',
      weight_gross_kg: 10,
      // hs_code: missing
    } as any;

    const result = await orchestrator.execute(passport);

    expect(result.status).toBe('incomplete');
    expect(result.requires_escalation).toBe(false);
  });

  // Regression 1.3: Validation: weight is not mandatory for status 200/incomplete
  it('should return status incomplete and missing_inputs when weight is missing', async () => {
    const passport: DealPassport = {
      dest_country: 'RU',
      incoterms: 'CIF',
      goods_value: 1000,
      currency: 'USD',
      // weight_gross_kg: missing
    } as any;

    const result = await orchestrator.execute(passport);

    expect(result.status).toBe('incomplete');
    expect(result.all_missing_inputs).toContain('weight_gross_kg');
  });

  // Regression 1.1: HSClient 404 handling (via orchestrator)
  // User explicitly provides a code that fails lookup
  it('should treat HS 404/Invalid as escalation_required', async () => {
     const passport: DealPassport = {
      dest_country: 'RU',
      incoterms: 'CIF',
      goods_value: 1000,
      currency: 'USD',
      weight_gross_kg: 10,
      hs_code: 'MISSING'
    };

    const result = await orchestrator.execute(passport);
    expect(result.status).toBe('escalation_required');
    expect(result.escalation_reasons).toContain('HS tariff lookup failed for MISSING');
  });
});
