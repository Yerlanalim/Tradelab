import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CurrencyProvider } from '../src/calc/currency/CurrencyProvider';
import { CalculationOrchestrator } from '../src/calc/orchestrator/CalculationOrchestrator';
import { DealPassport } from '../src/calc/types/contracts';
import { 
  MissingInputError, 
  UnsupportedTariffError, 
  EscalationRequiredError, 
  UnsupportedFeatureError, 
  ServiceUnavailableError 
} from '../src/calc/errors';

// Reset mocks between tests
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      }))
    }))
  }))
}));

describe('Coverage Recovery - Error Paths', () => {
  let provider: CurrencyProvider;
  let mockLimit: any;

  beforeEach(() => {
    provider = new CurrencyProvider();
    mockLimit = vi.fn();
    
    // Setup chained mock
    const mockOrder = { limit: mockLimit };
    const mockSelect = { order: vi.fn(() => mockOrder) };
    const mockFrom = { select: vi.fn(() => mockSelect) };
    
    (provider as any).supabase.from = vi.fn(() => mockFrom);
  });

  describe('CurrencyProvider - Error Paths', () => {
    it('should throw error when Supabase query fails', async () => {
      mockLimit.mockResolvedValue({
        data: null,
        error: { message: 'DB connection error' }
      });

      await expect(provider.fetchRates()).rejects.toThrow('Failed to load exchange rates from Supabase: DB connection error');
    });

    it('should throw error when no exchange rates found in database', async () => {
      mockLimit.mockResolvedValue({
        data: [],
        error: null
      });

      await expect(provider.fetchRates()).rejects.toThrow('No exchange rates found in database');
    });

    it('should throw error when converting before rates are loaded', () => {
      expect(() => provider.convert(100, 'USD', 'KZT')).toThrow('Exchange rates not loaded. Call fetchRates() first.');
    });

    it('should fetch rates in ensureRates if interval passed', async () => {
      mockLimit.mockResolvedValue({
        data: [{ rates: { USD: 1 }, date: '2026-01-01' }],
        error: null
      });

      // Initially lastFetch is 0, so it should fetch
      await provider.ensureRates();
      expect(mockLimit).toHaveBeenCalled();
      
      // Clear mock and call again - should NOT fetch because lastFetch is now recent
      mockLimit.mockClear();
      await provider.ensureRates();
      expect(mockLimit).not.toHaveBeenCalled();
    });
  });

  describe('Calculation Errors - Coverage', () => {
    it('should instantiate all error classes correctly', () => {
      const missingInput = new MissingInputError(['field1'], { partial: true });
      expect(missingInput.fields).toEqual(['field1']);
      expect(missingInput.partialResult).toEqual({ partial: true });
      expect(missingInput.name).toBe('MissingInputError');

      const unsupportedTariff = new UnsupportedTariffError('Unsupported tariff');
      expect(unsupportedTariff.message).toBe('Unsupported tariff');
      expect(unsupportedTariff.name).toBe('UnsupportedTariffError');

      const escalation = new EscalationRequiredError('Escalation required');
      expect(escalation.message).toBe('Escalation required');
      expect(escalation.name).toBe('EscalationRequiredError');

      const unsupportedFeature = new UnsupportedFeatureError('Feature not supported', 'multi-hs');
      expect(unsupportedFeature.feature).toBe('multi-hs');
      expect(unsupportedFeature.name).toBe('UnsupportedFeatureError');
      
      const defaultFeature = new UnsupportedFeatureError('Default feature');
      expect(defaultFeature.feature).toBe('unknown');

      const serviceUnavailable = new ServiceUnavailableError('Service down');
      expect(serviceUnavailable.message).toBe('Service down');
      expect(serviceUnavailable.name).toBe('ServiceUnavailableError');
    });
  });

  describe('Orchestrator - Edge Cases', () => {
    let orchestrator: CalculationOrchestrator;

    beforeEach(() => {
      orchestrator = new CalculationOrchestrator();
    });

    it('should handle HS lookup failure by returning escalation status', async () => {
      // Mocking internal components to trigger escalation
      // We rely on the existing orchestrator logic which catches specific errors or checks flags
      
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'CIF',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 10,
        hs_code: '1234567890'
      };

      // Mock HSClient to fail
      vi.spyOn((orchestrator as any).dutyVatCalculator, 'execute').mockResolvedValue({
        duty: { range_usd: [0, 0], breakdown: [], base_formula: '' },
        vat: { rate: 0, range_usd: [0, 0], base_formula: '' },
        fees_usd: [],
        total_range_usd: [0, 0],
        assumptions: [],
        sources: [],
        missing_inputs: [],
        requires_escalation: true,
        escalation_reasons: ['HS tariff lookup failed']
      });

      // Mock inits
      vi.spyOn((orchestrator as any).currencyProvider, 'fetchRates').mockResolvedValue(undefined as any);
      vi.spyOn((orchestrator as any).dataCache, 'ensureLoaded').mockResolvedValue(undefined as any);

      const result = await orchestrator.execute(passport);
      expect(result.status).toBe('escalation_required');
      expect(result.escalation_reasons).toContain('HS tariff lookup failed');
    });
  });
});
