import { describe, it, expect } from 'vitest';
import { validateForCalculation } from '../src/calc/validators/validateForCalculation';
import { DealPassport } from '../src/calc/types/contracts';

describe('API Validation Tests', () => {
  describe('validateForCalculation - Input Validation', () => {
    it('should fail validation for empty object', () => {
      const passport = {} as any;
      const result = validateForCalculation(passport);

      expect(result.valid).toBe(false);
      expect(result.missing_inputs).toBeDefined();
      expect(result.missing_inputs!.length).toBeGreaterThan(0);
    });

    it('should fail validation for missing required fields', () => {
      const passport = {
        dest_country: 'KZ'
        // Missing: incoterms, currency, weight_gross_kg
      } as any;

      const result = validateForCalculation(passport);

      expect(result.valid).toBe(false);
      expect(result.missing_inputs).toContain('incoterms');
      expect(result.missing_inputs).toContain('currency');
      // weight_gross_kg is no longer a validation error
    });

    it('should pass validation when all required fields are present', () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'CIF',
        goods_value: 10000,
        currency: 'USD',
        weight_gross_kg: 100
      };

      const result = validateForCalculation(passport);

      expect(result.valid).toBe(true);
    });

    it('should accept optional hs_code field', () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'CIF',
        goods_value: 10000,
        currency: 'USD',
        weight_gross_kg: 100,
        hs_code: '8471300000'
      };

      const result = validateForCalculation(passport);

      expect(result.valid).toBe(true);
    });

    it('should fail validation for missing dest_country', () => {
      const passport = {
        incoterms: 'CIF',
        goods_value: 10000,
        currency: 'USD',
        weight_gross_kg: 100
      } as any;

      const result = validateForCalculation(passport);

      expect(result.valid).toBe(false);
      expect(result.missing_inputs).toContain('dest_country');
    });
  });
});
