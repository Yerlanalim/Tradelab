// Contract compilation test - ensures all types are valid
import {
  CountryCode,
  CurrencyCode,
  Incoterms,
  DealPassport,
  HSCandidate,
  HSResult,
  TariffInfo,
  DutyAST,
  Token,
  CustomsValueResult,
  DutyVatResult,
  DutyBreakdown,
  CustomsFee,
  LogisticsResult,
  LogisticsScenario,
  CostBreakdown,
  CalculationPackage,
  Source
} from '../src/calc/types/contracts';

import {
  INTERNAL_CURRENCY,
  DISPLAY_CURRENCY,
  SUPPORTED_PRICE_BASIS,
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_COUNTRY_CURRENCY_MAP
} from '../src/calc/constants';

describe('Contracts Compilation', () => {
  it('should compile all contract types', () => {
    // This test passes if TypeScript compiles successfully
    expect(true).toBe(true);
  });
  
  it('should have correct constant values', () => {
    expect(INTERNAL_CURRENCY).toBe('USD');
    expect(DISPLAY_CURRENCY).toBe('USD');
    expect(SUPPORTED_PRICE_BASIS).toEqual(['kg']);
    expect(DEFAULT_SCORING_WEIGHTS.cost).toBe(0.5);
  });
});
