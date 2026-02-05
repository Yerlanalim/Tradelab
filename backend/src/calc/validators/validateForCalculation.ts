import { DealPassport } from '../types/contracts';

export interface ValidationResult {
  valid: boolean;
  missing_inputs?: string[];
}

export function validateForCalculation(passport: DealPassport): ValidationResult {
  const missing: string[] = [];
  
  // Check required fields with type validation
  if (!passport.dest_country) {
    missing.push('dest_country');
  }
  
  if (!passport.incoterms) {
    missing.push('incoterms');
  }
  
  if (typeof passport.goods_value !== 'number' || passport.goods_value <= 0) {
    missing.push('goods_value (must be > 0)');
  }
  
  if (!passport.currency) {
    missing.push('currency');
  }
  
  // weight_gross_kg is optional for basic calculation structure, but required for logistics and specific duties
  // if (typeof passport.weight_gross_kg !== 'number' || passport.weight_gross_kg <= 0) {
  //   missing.push('weight_gross_kg (must be > 0)');
  // }
  
  if (missing.length > 0) {
    return { valid: false, missing_inputs: missing };
  }
  
  return { valid: true };
}
