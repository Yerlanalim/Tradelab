
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CalculationOrchestrator } from '../src/calc/orchestrator/CalculationOrchestrator';
import { DealPassport } from '../src/calc/types/contracts';

vi.mock('../src/calc/hs/HSClient', () => ({
  HSClient: class {
    async getTariff() {
      return {
        import_duty_raw: '5%',
        import_duty_parsed: { kind: 'advalorem', percent: 0.05 },
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
        // ONLY RU/KZ configured
        return [
          { country_code: 'RU', import_vat_default_rate: 0.2, active: true },
          { country_code: 'KZ', import_vat_default_rate: 0.12, active: true }
        ];
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
        freight_to_border_usd: [100, 100],
        last_mile_usd: [0, 0],
        assumptions: [],
        sources: [],
        missing_inputs: [],
        requires_escalation: false,
        escalation_reasons: []
      };
    }
  }
}));

describe('Unsupported Country Handling', () => {
  let orchestrator: CalculationOrchestrator;

  beforeEach(() => {
    orchestrator = new CalculationOrchestrator();
  });

  it('should return escalation_required for Uzbekistan (UZ) if VAT config is missing', async () => {
    const passport: DealPassport = {
      dest_country: 'UZ', // New country
      incoterms: 'CIF',
      goods_value: 1000,
      currency: 'USD',
      weight_gross_kg: 50,
      hs_code: '8471300000'
    };

    const result = await orchestrator.execute(passport);

    expect(result.status).toBe('escalation_required');
    expect(result.requires_escalation).toBe(true);
    expect(result.escalation_reasons).toContain('VAT config missing for country UZ');
  });
});
