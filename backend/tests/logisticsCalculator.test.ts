import { LogisticsCalculator } from '../src/calc/logistics/LogisticsCalculator';
import { DataCacheManager } from '../src/calc/config/DataCacheManager';
import { CurrencyConverter } from '../src/calc/currency/CurrencyConverter';
import { DealPassport } from '../src/calc/types/contracts';
import { vi, beforeEach, describe, it, expect } from 'vitest';

describe('LogisticsCalculator', () => {
  let calculator: LogisticsCalculator;
  let mockCache: DataCacheManager;
  let converter: CurrencyConverter;

  beforeEach(() => {
    calculator = new LogisticsCalculator();
    
    // Setup converter
    converter = new CurrencyConverter();
    converter.setRate('KZT', 1);
    converter.setRate('USD', 470);
    converter.setRate('EUR', 520);
    converter.setRate('CNY', 65);

    // Mock cache
    mockCache = {
      query: vi.fn()
    } as any;
  });

  describe('Basic freight calculation', () => {
    it('should calculate base cost for single lane + rate card (per kg)', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 10000,
        currency: 'USD',
        weight_gross_kg: 100,
        country_of_origin: 'CN',
        origin_city: 'Shanghai',
        dest_city: 'Almaty'
      };

      // Mock lane
      (mockCache.query as any).mockImplementation((table: string) => {
        if (table === 'calc_shipping_lanes') {
          return [{
            lane_id: 'CN_SH_KZ_ALA',
            origin_country: 'CN',
            origin_city: 'Shanghai',
            dest_country: 'KZ',
            dest_city: 'Almaty',
            enabled: true
          }];
        }
        if (table === 'calc_shipping_rate_cards') {
          return [{
            rate_id: 'RATE_001',
            lane_id: 'CN_SH_KZ_ALA',
            mode: 'air',
            price_basis: 'kg',
            rate_per_unit: 2.5,
            min_charge: 100,
            currency: 'USD',
            transit_days_min: 3,
            transit_days_max: 5,
            risks: [],
            active: true,
            config_version: 'v1.0'
          }];
        }
        if (table === 'calc_shipping_surcharges') {
          return [];
        }
        if (table === 'calc_shipping_last_mile') {
          return [];
        }
        return [];
      });

      const result = await calculator.calculate(passport, mockCache, converter);

      // 100 kg * 2.5 USD/kg = 250 USD
      expect(result.freight_to_border_usd).toEqual([250, 250]);
      expect(result.requires_escalation).toBe(false);
      expect(result.assumptions).toContain('Last mile delivery not included');
    });

    it('should apply minimum charge when base cost is below minimum', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 10, // Small weight
        country_of_origin: 'CN'
      };

      (mockCache.query as any).mockImplementation((table: string) => {
        if (table === 'calc_shipping_lanes') {
          return [{
            lane_id: 'CN_KZ_DEFAULT',
            origin_country: 'CN',
            origin_city: null,
            dest_country: 'KZ',
            dest_city: null,
            enabled: true
          }];
        }
        if (table === 'calc_shipping_rate_cards') {
          return [{
            rate_id: 'RATE_002',
            lane_id: 'CN_KZ_DEFAULT',
            mode: 'sea',
            price_basis: 'kg',
            rate_per_unit: 1.0,
            min_charge: 200, // Minimum charge
            currency: 'USD',
            transit_days_min: 15,
            transit_days_max: 20,
            risks: [],
            active: true,
            config_version: 'v1.0'
          }];
        }
        if (table === 'calc_shipping_surcharges') {
          return [];
        }
        if (table === 'calc_shipping_last_mile') {
          return [];
        }
        return [];
      });

      const result = await calculator.calculate(passport, mockCache, converter);

      // 10 kg * 1 USD/kg = 10 USD, but min_charge = 200 USD
      expect(result.freight_to_border_usd).toEqual([200, 200]);
    });
  });

  describe('Surcharges', () => {
    it('should calculate percent surcharge correctly', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 10000,
        currency: 'USD',
        weight_gross_kg: 100,
        country_of_origin: 'CN'
      };

      (mockCache.query as any).mockImplementation((table: string) => {
        if (table === 'calc_shipping_lanes') {
          return [{
            lane_id: 'CN_KZ',
            origin_country: 'CN',
            origin_city: null,
            dest_country: 'KZ',
            dest_city: null,
            enabled: true
          }];
        }
        if (table === 'calc_shipping_rate_cards') {
          return [{
            rate_id: 'RATE_003',
            lane_id: 'CN_KZ',
            mode: 'air',
            price_basis: 'kg',
            rate_per_unit: 2.0,
            min_charge: 0,
            currency: 'USD',
            transit_days_min: 3,
            transit_days_max: 5,
            risks: [],
            active: true,
            config_version: 'v1.0'
          }];
        }
        if (table === 'calc_shipping_surcharges') {
          return [{
            surcharge_id: 'FUEL_001',
            rate_id: 'RATE_003',
            type: 'fuel_percent',
            amount: 0.15, // 15%
            currency: null,
            applies_to: 'base_cost',
            active: true
          }];
        }
        if (table === 'calc_shipping_last_mile') {
          return [];
        }
        return [];
      });

      const result = await calculator.calculate(passport, mockCache, converter);

      // Base: 100 kg * 2 USD/kg = 200 USD
      // Surcharge: 200 * 0.15 = 30 USD
      // Total: 230 USD
      expect(result.freight_to_border_usd).toEqual([230, 230]);
    });

    it('should calculate fixed surcharge with currency conversion', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 10000,
        currency: 'USD',
        weight_gross_kg: 100,
        country_of_origin: 'CN'
      };

      (mockCache.query as any).mockImplementation((table: string) => {
        if (table === 'calc_shipping_lanes') {
          return [{
            lane_id: 'CN_KZ',
            origin_country: 'CN',
            origin_city: null,
            dest_country: 'KZ',
            dest_city: null,
            enabled: true
          }];
        }
        if (table === 'calc_shipping_rate_cards') {
          return [{
            rate_id: 'RATE_004',
            lane_id: 'CN_KZ',
            mode: 'rail',
            price_basis: 'kg',
            rate_per_unit: 1.5,
            min_charge: 0,
            currency: 'USD',
            transit_days_min: 10,
            transit_days_max: 12,
            risks: [],
            active: true,
            config_version: 'v1.0'
          }];
        }
        if (table === 'calc_shipping_surcharges') {
          return [{
            surcharge_id: 'TERMINAL_001',
            rate_id: 'RATE_004',
            type: 'terminal_fixed',
            amount: 5000, // 5000 KZT
            currency: 'KZT',
            applies_to: 'base_cost',
            active: true
          }];
        }
        if (table === 'calc_shipping_last_mile') {
          return [];
        }
        return [];
      });

      const result = await calculator.calculate(passport, mockCache, converter);

      // Base: 100 kg * 1.5 USD/kg = 150 USD
      // Surcharge: 5000 KZT = 5000/470 ≈ 10.64 USD
      // Total: ≈ 160.64 USD
      expect(result.freight_to_border_usd![0]).toBeCloseTo(160.64, 1);
    });
  });

  describe('Multiple lanes and escalation', () => {
    it('should aggregate ranges from multiple lanes and set escalation flag', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 10000,
        currency: 'USD',
        weight_gross_kg: 100,
        country_of_origin: 'CN'
      };

      (mockCache.query as any).mockImplementation((table: string, filters: any) => {
        if (table === 'calc_shipping_lanes') {
          return [
            {
              lane_id: 'CN_KZ_AIR',
              origin_country: 'CN',
              origin_city: null,
              dest_country: 'KZ',
              dest_city: null,
              enabled: true
            },
            {
              lane_id: 'CN_KZ_SEA',
              origin_country: 'CN',
              origin_city: null,
              dest_country: 'KZ',
              dest_city: null,
              enabled: true
            }
          ];
        }
        if (table === 'calc_shipping_rate_cards') {
          if (filters.lane_id === 'CN_KZ_AIR') {
            return [{
              rate_id: 'RATE_AIR',
              lane_id: 'CN_KZ_AIR',
              mode: 'air',
              price_basis: 'kg',
              rate_per_unit: 3.0,
              min_charge: 0,
              currency: 'USD',
              transit_days_min: 3,
              transit_days_max: 5,
              risks: [],
              active: true,
              config_version: 'v1.0'
            }];
          }
          if (filters.lane_id === 'CN_KZ_SEA') {
            return [{
              rate_id: 'RATE_SEA',
              lane_id: 'CN_KZ_SEA',
              mode: 'sea',
              price_basis: 'kg',
              rate_per_unit: 1.0,
              min_charge: 0,
              currency: 'USD',
              transit_days_min: 20,
              transit_days_max: 25,
              risks: [],
              active: true,
              config_version: 'v1.0'
            }];
          }
        }
        if (table === 'calc_shipping_surcharges') {
          return [];
        }
        if (table === 'calc_shipping_last_mile') {
          return [];
        }
        return [];
      });

      const result = await calculator.calculate(passport, mockCache, converter);

      // Air: 100 * 3 = 300 USD
      // Sea: 100 * 1 = 100 USD
      // Range: [100, 300]
      expect(result.freight_to_border_usd).toEqual([100, 300]);
      expect(result.requires_escalation).toBe(true);
      expect(result.escalation_reasons).toContain('Multiple lanes found (2)');
    });
  });

  describe('Missing data and escalation', () => {
    it('should escalate when weight is missing for per_kg rate', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 10000,
        currency: 'USD',
        weight_gross_kg: 0, // Missing weight
        country_of_origin: 'CN'
      };

      (mockCache.query as any).mockImplementation((table: string) => {
        if (table === 'calc_shipping_lanes') {
          return [{
            lane_id: 'CN_KZ',
            origin_country: 'CN',
            origin_city: null,
            dest_country: 'KZ',
            dest_city: null,
            enabled: true
          }];
        }
        if (table === 'calc_shipping_rate_cards') {
          return [{
            rate_id: 'RATE_005',
            lane_id: 'CN_KZ',
            mode: 'air',
            price_basis: 'kg',
            rate_per_unit: 2.0,
            min_charge: 0,
            currency: 'USD',
            transit_days_min: 3,
            transit_days_max: 5,
            risks: [],
            active: true,
            config_version: 'v1.0'
          }];
        }
        return [];
      });

      const result = await calculator.calculate(passport, mockCache, converter);

      expect(result.requires_escalation).toBe(false);
      expect(result.missing_inputs).toContain('weight_gross_kg');
      expect(result.freight_to_border_usd).toBeUndefined();
    });

    it('should escalate when no lane is found', async () => {
      const passport: DealPassport = {
        dest_country: 'AM', // Armenia - no lane
        incoterms: 'FOB',
        goods_value: 10000,
        currency: 'USD',
        weight_gross_kg: 100,
        country_of_origin: 'CN'
      };

      (mockCache.query as any).mockReturnValue([]);

      const result = await calculator.calculate(passport, mockCache, converter);

      expect(result.requires_escalation).toBe(false);
      expect(result.escalation_reasons).toContain('No shipping lane found for route');
      expect(result.missing_inputs).toContain('shipping_lane');
      expect(result.freight_to_border_usd).toBeUndefined();
    });
  });

  describe('Currency conversion', () => {
    it('should convert rate card currency to USD', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 10000,
        currency: 'USD',
        weight_gross_kg: 100,
        country_of_origin: 'CN'
      };

      (mockCache.query as any).mockImplementation((table: string) => {
        if (table === 'calc_shipping_lanes') {
          return [{
            lane_id: 'CN_KZ',
            origin_country: 'CN',
            origin_city: null,
            dest_country: 'KZ',
            dest_city: null,
            enabled: true
          }];
        }
        if (table === 'calc_shipping_rate_cards') {
          return [{
            rate_id: 'RATE_KZT',
            lane_id: 'CN_KZ',
            mode: 'rail',
            price_basis: 'kg',
            rate_per_unit: 1000, // 1000 KZT per kg
            min_charge: 0,
            currency: 'KZT',
            transit_days_min: 10,
            transit_days_max: 12,
            risks: [],
            active: true,
            config_version: 'v1.0'
          }];
        }
        if (table === 'calc_shipping_surcharges') {
          return [];
        }
        if (table === 'calc_shipping_last_mile') {
          return [];
        }
        return [];
      });

      const result = await calculator.calculate(passport, mockCache, converter);

      // 100 kg * 1000 KZT/kg = 100,000 KZT
      // 100,000 KZT / 470 = ~212.77 USD
      expect(result.freight_to_border_usd![0]).toBeCloseTo(212.77, 1);
    });
  });

  describe('City normalization', () => {
    it('should normalize city names using aliases', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 10000,
        currency: 'USD',
        weight_gross_kg: 100,
        country_of_origin: 'CN',
        origin_city: 'Shanghai',
        dest_city: 'Алматы' // Cyrillic name
      };

      (mockCache.query as any).mockImplementation((table: string, filters: any) => {
        if (table === 'calc_shipping_lanes') {
          // Should match normalized "Almaty"
          if (filters.dest_city === 'Almaty') {
            return [{
              lane_id: 'CN_SH_KZ_ALA',
              origin_country: 'CN',
              origin_city: 'Shanghai',
              dest_country: 'KZ',
              dest_city: 'Almaty',
              enabled: true
            }];
          }
        }
        if (table === 'calc_shipping_rate_cards') {
          return [{
            rate_id: 'RATE_006',
            lane_id: 'CN_SH_KZ_ALA',
            mode: 'air',
            price_basis: 'kg',
            rate_per_unit: 2.5,
            min_charge: 0,
            currency: 'USD',
            transit_days_min: 3,
            transit_days_max: 5,
            risks: [],
            active: true,
            config_version: 'v1.0'
          }];
        }
        if (table === 'calc_shipping_surcharges') {
          return [];
        }
        if (table === 'calc_shipping_last_mile') {
          return [];
        }
        return [];
      });

      const result = await calculator.calculate(passport, mockCache, converter);

      expect(result.freight_to_border_usd).toBeDefined();
      expect(result.requires_escalation).toBe(false);
    });
  });

  describe('Freight to border validation', () => {
    it('should ensure freight_to_border excludes last mile', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'DAP',
        goods_value: 10000,
        currency: 'USD',
        weight_gross_kg: 100,
        country_of_origin: 'CN'
      };

      (mockCache.query as any).mockImplementation((table: string) => {
        if (table === 'calc_shipping_lanes') {
          return [{
            lane_id: 'CN_KZ',
            origin_country: 'CN',
            origin_city: null,
            dest_country: 'KZ',
            dest_city: null,
            enabled: true
          }];
        }
        if (table === 'calc_shipping_rate_cards') {
          return [{
            rate_id: 'RATE_007',
            lane_id: 'CN_KZ',
            mode: 'air',
            price_basis: 'kg',
            rate_per_unit: 2.0,
            min_charge: 0,
            currency: 'USD',
            transit_days_min: 3,
            transit_days_max: 5,
            risks: [],
            active: true,
            config_version: 'v1.0'
          }];
        }
        if (table === 'calc_shipping_surcharges') {
          return [];
        }
        if (table === 'calc_shipping_last_mile') {
          return [{
            country_code: 'KZ',
            city: null,
            service_provider: 'Local Courier',
            base_rate: 5000, // 5000 KZT
            currency: 'KZT',
            active: true
          }];
        }
        return [];
      });

      const result = await calculator.calculate(passport, mockCache, converter);

      // Base: 100 * 2 = 200 USD
      // Last mile: 5000 KZT ≈ 10.64 USD (not included in freight_to_border)
      // freight_to_border should be 200 USD (without last mile)
      expect(result.freight_to_border_usd).toEqual([200, 200]);
    });
  });
});
