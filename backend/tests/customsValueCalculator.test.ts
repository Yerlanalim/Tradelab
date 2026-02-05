import { CustomsValueCalculator, EscalationRequiredError } from '../src/calc/customs/CustomsValueCalculator';
import { CurrencyConverter } from '../src/calc/currency/CurrencyConverter';
import { DealPassport, LogisticsResult } from '../src/calc/types/contracts';

describe('CustomsValueCalculator', () => {
  let calculator: CustomsValueCalculator;
  let converter: CurrencyConverter;

  beforeEach(() => {
    calculator = new CustomsValueCalculator();
    converter = new CurrencyConverter('USD');
    // Set USD rate to 1 for simplicity
    converter.setRate('USD', 1);
  });

  describe('CIF Incoterms', () => {
    it('should calculate customs value for CIF (freight+insurance included)', () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'CIF',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 50
      };

      const logistics: LogisticsResult = {
        scenarios: []
      };

      const result = calculator.calculate(passport, logistics, converter);

      expect(result.customs_value_usd).toEqual([1000, 1000]);
      expect(result.breakdown.invoice_value_usd).toBe(1000);
      expect(result.missing_inputs).toEqual([]);
      expect(result.formula_used).toBe('Invoice value (CIF includes freight+insurance)');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].type).toBe('config_file');
    });
  });

  describe('FOB Incoterms', () => {
    it('should return missing_inputs when freight_to_border is unavailable', () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 50,
        invoice_includes_insurance: false
      };

      const logistics: LogisticsResult = {
        scenarios: []
        // freight_to_border_usd is undefined
      };

      const result = calculator.calculate(passport, logistics, converter);

      expect(result.customs_value_usd[0]).toBeGreaterThan(1000); // insurance added
      expect(result.missing_inputs).toContain('freight_to_border for FOB');
      expect(result.assumptions.some(a => a.includes('Insurance'))).toBe(true);
    });

    it('should calculate customs value with freight_to_border and insurance', () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 50,
        invoice_includes_insurance: false
      };

      const logistics: LogisticsResult = {
        scenarios: [],
        freight_to_border_usd: [100, 200]
      };

      const result = calculator.calculate(passport, logistics, converter);

      // KZ has insurance_rate override: 0.006
      const insuranceUSD = 1000 * 0.006; // 6
      expect(result.customs_value_usd).toEqual([1100 + insuranceUSD, 1200 + insuranceUSD]);
      expect(result.breakdown.invoice_value_usd).toBe(1000);
      expect(result.breakdown.freight_to_border_usd).toEqual([100, 200]);
      expect(result.breakdown.insurance_usd).toBe(insuranceUSD);
      expect(result.missing_inputs).toEqual([]);
      expect(result.assumptions.some(a => a.includes('0.60%'))).toBe(true); // KZ override
    });

    it('should not add insurance if invoice_includes_insurance is true', () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 50,
        invoice_includes_insurance: true
      };

      const logistics: LogisticsResult = {
        scenarios: [],
        freight_to_border_usd: [100, 200]
      };

      const result = calculator.calculate(passport, logistics, converter);

      expect(result.customs_value_usd).toEqual([1100, 1200]);
      expect(result.breakdown.insurance_usd).toBeUndefined();
      expect(result.assumptions).toContain('Insurance included in invoice');
    });
  });

  describe('EXW Incoterms', () => {
    it('should handle EXW same as FOB', () => {
      const passport: DealPassport = {
        dest_country: 'RU',
        incoterms: 'EXW',
        goods_value: 2000,
        currency: 'USD',
        weight_gross_kg: 100,
        invoice_includes_insurance: false
      };

      const logistics: LogisticsResult = {
        scenarios: [],
        freight_to_border_usd: [150, 250]
      };

      const result = calculator.calculate(passport, logistics, converter);

      // RU has default insurance_rate: 0.005
      const insuranceUSD = 2000 * 0.005; // 10
      expect(result.customs_value_usd).toEqual([2150 + insuranceUSD, 2250 + insuranceUSD]);
      expect(result.formula_used).toBe('Invoice + freight_to_border + insurance (EXW)');
    });
  });

  describe('DAP Incoterms', () => {
    it('should return missing_inputs when invoice_includes_freight is unknown', () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'DAP',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 50
        // invoice_includes_freight is undefined
      };

      const logistics: LogisticsResult = {
        scenarios: []
      };

      const result = calculator.calculate(passport, logistics, converter);

      expect(result.missing_inputs).toContain('invoice_includes_freight (unknown for DAP)');
      expect(result.assumptions).toContain('DAP: unknown whether freight included in invoice');
      expect(result.formula_used).toBe('Invoice value (DAP freight inclusion unknown)');
    });

    it('should calculate correctly when invoice_includes_freight is true', () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'DAP',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 50,
        invoice_includes_freight: true,
        invoice_includes_insurance: false
      };

      const logistics: LogisticsResult = {
        scenarios: []
      };

      const result = calculator.calculate(passport, logistics, converter);

      const insuranceUSD = 1000 * 0.006; // KZ override
      expect(result.customs_value_usd).toEqual([1000 + insuranceUSD, 1000 + insuranceUSD]);
      expect(result.breakdown.freight_to_border_usd).toBeUndefined();
      expect(result.formula_used).toBe('Invoice value (DAP includes freight)');
    });

    it('should require freight_to_border when invoice_includes_freight is false', () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'DAP',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 50,
        invoice_includes_freight: false,
        invoice_includes_insurance: false
      };

      const logistics: LogisticsResult = {
        scenarios: []
        // freight_to_border_usd is undefined
      };

      const result = calculator.calculate(passport, logistics, converter);

      expect(result.missing_inputs).toContain('freight_to_border for DAP');
    });
  });

  describe('DDP Incoterms', () => {
    it('should throw EscalationRequiredError for DDP', () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'DDP',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 50
      };

      const logistics: LogisticsResult = {
        scenarios: []
      };

      expect(() => {
        calculator.calculate(passport, logistics, converter);
      }).toThrow(EscalationRequiredError);
    });
  });
});
