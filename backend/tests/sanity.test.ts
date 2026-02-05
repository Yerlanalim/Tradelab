
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CalculationOrchestrator } from '../src/calc/orchestrator/CalculationOrchestrator';
import { DealPassport } from '../src/calc/types/contracts';

// Mock variables to control mock behavior
let mockFreightToBorder: [number, number] = [0, 0];
let mockLastMile: [number, number] = [0, 0];

vi.mock('../src/calc/hs/HSClient', () => ({
  HSClient: class {
    async getTariff() {
      return {
        import_duty_raw: '0%',
        import_duty_parsed: { kind: 'advalorem', percent: 0 },
        vat_exempt: false,
        special_conditions: []
      };
    }
  }
}));

vi.mock('../src/calc/config/DataCacheManager', () => ({
  DataCacheManager: class {
    async ensureLoaded() { return; }
    query(table: string) {
      if (table === 'calc_country_tax_config') {
        return [{ country_code: 'RU', import_vat_default_rate: 0.2, active: true }];
      }
      return [];
    }
  }
}));

vi.mock('../src/calc/currency/CurrencyProvider', () => ({
  CurrencyProvider: class {
    async fetchRates() { return; }
    converter = {
      toInternal: (val: number) => val,
      fromInternal: (val: number) => val
    };
  }
}));

vi.mock('../src/calc/logistics/LogisticsCalculator', () => ({
  LogisticsCalculator: class {
    async calculate() {
      return {
        scenarios: [],
        chargeable_weight_kg: 50,
        freight_to_border_usd: mockFreightToBorder,
        last_mile_usd: mockLastMile,
        assumptions: [],
        sources: [],
        missing_inputs: [],
        requires_escalation: false,
        escalation_reasons: []
      };
    }
  }
}));

describe('Calculation Sanity Test - Incoterms Policy', () => {
  let orchestrator: CalculationOrchestrator;

  beforeEach(() => {
    orchestrator = new CalculationOrchestrator();
    mockFreightToBorder = [0, 0];
    mockLastMile = [0, 0];
  });

  it('CIF: should ignore freight_to_border in Landed Cost', async () => {
    mockFreightToBorder = [500, 500];
    mockLastMile = [50, 50];

    const passport: DealPassport = {
      dest_country: 'RU',
      incoterms: 'CIF',
      goods_value: 1000,
      currency: 'USD',
      weight_gross_kg: 50,
      hs_code: '8471300000'
    };

    const result = await orchestrator.execute(passport);

    // Landed Cost = Invoice (1000) + Last Mile (50) + VAT (1000 * 0.2 = 200) + Duty (0) = 1250
    // Freight to border (500) MUST be excluded from totals, but present in components
    expect(result.status).toBe('ok');
    expect(result.totals.components.product_cost_usd).toBe(1000);
    expect(result.totals.components.shipping_to_border_usd![0]).toBe(500);
    expect(result.totals.components.shipping_last_mile_usd![0]).toBe(50);
    expect(result.totals.components.shipping_usd![0]).toBe(50); // ONLY Last Mile
    expect(result.totals.landed_cost_range_usd![0]).toBe(1250);
  });

  it('FOB: should include BOTH freight_to_border and last mile', async () => {
    mockFreightToBorder = [500, 500];
    mockLastMile = [50, 50];

    const passport: DealPassport = {
      dest_country: 'RU',
      incoterms: 'FOB',
      goods_value: 1000,
      currency: 'USD',
      weight_gross_kg: 50,
      hs_code: '8471300000'
    };

    const result = await orchestrator.execute(passport);

    // Landed Cost Breakdown:
    // Invoice: 1000
    // Freight: 500
    // Insurance (0.5% of 1000): 5
    // Customs Value: 1505
    // VAT (20% of 1505): 301
    // Last Mile: 50
    // Total: 1000 (prod) + 550 (ship) + 301 (vat) = 1851
    expect(result.totals.components.shipping_usd![0]).toBe(550);
    expect(result.totals.landed_cost_range_usd![0]).toBe(1851);
  });
});
