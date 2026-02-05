import { vi, describe, it, expect } from 'vitest';
import { validateForCalculation } from '../src/calc/validators/validateForCalculation';
import { DealPassport } from '../src/calc/types/contracts';

describe('validateForCalculation', () => {
  it('should return invalid for empty passport', () => {
    const passport = {} as DealPassport;
    const result = validateForCalculation(passport);
    
    expect(result.valid).toBe(false);
    expect(result.missing_inputs).toBeDefined();
    expect(result.missing_inputs!.length).toBeGreaterThan(0);
    expect(result.missing_inputs).toContain('dest_country');
    expect(result.missing_inputs).toContain('incoterms');
    expect(result.missing_inputs).toContain('goods_value (must be > 0)');
    expect(result.missing_inputs).toContain('currency');
  });
  
  it('should return valid for minimal valid passport without weight', () => {
    const passport: DealPassport = {
      dest_country: 'KZ',
      incoterms: 'CIF',
      goods_value: 1000,
      currency: 'USD',
      // weight_gross_kg: missing
    } as any;
    
    const result = validateForCalculation(passport);
    
    expect(result.valid).toBe(true);
  });
  
  it('should return invalid for goods_value <= 0', () => {
    const passport: DealPassport = {
      dest_country: 'KZ',
      incoterms: 'CIF',
      goods_value: 0,
      currency: 'USD',
      weight_gross_kg: 50
    };
    
    const result = validateForCalculation(passport);
    
    expect(result.valid).toBe(false);
    expect(result.missing_inputs).toContain('goods_value (must be > 0)');
  });
});
