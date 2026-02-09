
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
    query(table: string, filters: Record<string, any> = {}) {
      let data: any[] = [];
      if (table === 'calc_country_tax_config') {
        data = [
          { country_code: 'RU', import_vat_default_rate: 0.22, active: true },
          { country_code: 'KZ', import_vat_default_rate: 0.16, active: true }
        ];
      } else if (table === 'calc_shipping_rate_cards') {
        data = [{ 
          rate_id: 'R1', 
          lane_id: 'L1', 
          mode: 'road',
          price_basis: 'kg', 
          active: true, 
          rate_per_unit: 5, 
          min_charge: 0, 
          currency: 'USD',
          transit_days_min: 1,
          transit_days_max: 5,
          risks: [],
          config_version: '1.0'
        }];
      } else if (table === 'calc_shipping_lanes') {
        data = [
          { lane_id: 'L1', origin_country: 'CN', origin_city: null, dest_country: 'RU', dest_city: null, rate_id: 'R1', enabled: true },
          { lane_id: 'L2', origin_country: 'CN', origin_city: null, dest_country: 'KZ', dest_city: null, rate_id: 'R1', enabled: true }
        ];
      }

      return data.filter(item => {
        for (const [key, value] of Object.entries(filters)) {
          if (item[key] !== value) return false;
        }
        return true;
      });
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

  // Regression: VAT should be calculated even without HS code
  it('should calculate VAT for KZ even without HS code (Test #1)', async () => {
    const passport: DealPassport = {
      dest_country: 'KZ',
      incoterms: 'CIF',
      goods_value: 1000,
      currency: 'USD',
      weight_gross_kg: 10,
    } as any;

    const result = await orchestrator.execute(passport);

    expect(result.duty_vat.vat.rate).toBe(0.16);
    expect(result.duty_vat.vat.base_formula).not.toBe('');
    expect(result.reason_codes).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/^VAT_CONFIG_/)
    ]));
    // Should be incomplete because HS is missing, but VAT should be there
    expect(result.status).toBe('incomplete');
    expect(result.duty_vat.duty.range_usd).toEqual([0, 0]);
  });

  it('should calculate VAT for RU even without HS code (Test #2)', async () => {
    const passport: DealPassport = {
      dest_country: 'RU',
      incoterms: 'FOB',
      goods_value: 1000,
      currency: 'USD',
      weight_gross_kg: 10,
    } as any;

    const result = await orchestrator.execute(passport);

    expect(result.duty_vat.vat.rate).toBe(0.22);
    expect(result.duty_vat.vat.base_formula).not.toBe('');
    expect(result.status).toBe('incomplete');
  });
});
