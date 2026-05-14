import { DutyVatCalculator } from '../src/calc/duty/DutyVatCalculator';
import { HSClient } from '../src/calc/hs/HSClient';
import { DataCacheManager } from '../src/calc/config/DataCacheManager';
import { CurrencyConverter } from '../src/calc/currency/CurrencyConverter';
import { DealPassport, HSResult, CustomsValueResult, TariffInfo } from '../src/calc/types/contracts';
import { UnsupportedTariffError } from '../src/calc/errors';
import { ReasonCode, ReasonCodeMapper } from '../src/calc/orchestrator/ReasonCodeMapper';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('DutyVatCalculator', () => {
  let calculator: DutyVatCalculator;
  let mockHSClient: HSClient;
  let mockCache: DataCacheManager;
  let converter: CurrencyConverter;

  beforeEach(() => {
    // Setup converter
    converter = new CurrencyConverter();
    converter.setRate('USD', 1);
    converter.setRate('KZT', 470); // Rates relative to internal (USD)? Wait.
    // In CurrencyConverter.ts: amountInKZT = amount * fromRate; return amountInKZT / toRate;
    // So setRate set KZT per unit. If internal is USD, then setRate('USD', 1) is correct.
    // And setRate('EUR', 1.1) means 1.1 KZT per EUR? No, that's not right.
    // Actually, CurrencyConverter.ts uses KZT as pivot.
    converter.setRate('KZT', 1);
    converter.setRate('USD', 470);
    converter.setRate('EUR', 520);

    // Mock HSClient
    mockHSClient = {
      getTariff: vi.fn()
    } as any;

    // Mock DataCacheManager (default: empty — each test sets VAT config via mockReturnValueOnce)
    mockCache = {
      query: vi.fn().mockReturnValue([])
    } as any;

    calculator = new DutyVatCalculator(mockHSClient, mockCache, converter);
  });

  describe('Advalorem Duty', () => {
    it('should calculate advalorem duty correctly', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 50
      };

      const hsResult: HSResult = {
        candidates: [{
          hs_code: '8471300000',
          confidence: 0.9,
          rationale: [],
          risk_flags: []
        }],
        requires_human_confirmation: false
      };

      const customsValue: CustomsValueResult = {
        customs_value_usd: [1000, 1200],
        breakdown: { invoice_value_usd: 1000 },
        formula_used: 'test',
        assumptions: [],
        sources: [],
        missing_inputs: []
      };

      const tariffInfo: TariffInfo = {
        import_duty_raw: '10%',
        import_duty_parsed: {
          kind: 'advalorem',
          percent: 0.10
        },
        vat_exempt: false
      };

      (mockHSClient.getTariff as any).mockResolvedValue(tariffInfo);
      (mockCache.query as any).mockReturnValueOnce([{
        country_code: 'KZ',
        import_vat_default_rate: 0.12,
        active: true
      }]);

      const result = await calculator.execute(passport, hsResult, customsValue);

      expect(result.duty.range_usd).toEqual([100, 120]); // 10% of [1000, 1200]
      expect(result.duty.breakdown).toHaveLength(1);
      expect(result.duty.breakdown[0].type).toBe('advalorem');
      expect(result.duty.breakdown[0].advalorem_rate).toBe(0.10);
    });
  });

  describe('Specific Duty (kg)', () => {
    it('should calculate specific duty in kg correctly', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 10
      };

      const hsResult: HSResult = {
        candidates: [{
          hs_code: '1234567890',
          confidence: 0.85,
          rationale: [],
          risk_flags: []
        }],
        requires_human_confirmation: false
      };

      const customsValue: CustomsValueResult = {
        customs_value_usd: [1000, 1000],
        breakdown: { invoice_value_usd: 1000 },
        formula_used: 'test',
        assumptions: [],
        sources: [],
        missing_inputs: []
      };

      const tariffInfo: TariffInfo = {
        import_duty_raw: '2 USD за 1 кг',
        import_duty_parsed: {
          kind: 'specific',
          amount: 2,
          currency: 'USD',
          unit: 'kg'
        },
        vat_exempt: false
      };

      (mockHSClient.getTariff as any).mockResolvedValue(tariffInfo);
      (mockCache.query as any).mockReturnValueOnce([{
        country_code: 'KZ',
        import_vat_default_rate: 0.12,
        active: true
      }]);

      const result = await calculator.execute(passport, hsResult, customsValue);

      expect(result.duty.range_usd).toEqual([20, 20]); // 2 USD/kg * 10 kg
      expect(result.duty.breakdown[0].type).toBe('specific');
      expect(result.duty.breakdown[0].specific_rate).toEqual({
        amount: 2,
        currency: 'USD',
        unit: 'kg'
      });
    });
  });

  describe('Sum Duty (advalorem + specific)', () => {
    it('should calculate sum duty correctly', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 10
      };

      const hsResult: HSResult = {
        candidates: [{
          hs_code: '1234567890',
          confidence: 0.85,
          rationale: [],
          risk_flags: []
        }],
        requires_human_confirmation: false
      };

      const customsValue: CustomsValueResult = {
        customs_value_usd: [1000, 1000],
        breakdown: { invoice_value_usd: 1000 },
        formula_used: 'test',
        assumptions: [],
        sources: [],
        missing_inputs: []
      };

      const tariffInfo: TariffInfo = {
        import_duty_raw: '10% плюс 1 USD за 1 кг',
        import_duty_parsed: {
          kind: 'sum',
          advalorem: { kind: 'advalorem', percent: 0.10 },
          specific: { kind: 'specific', amount: 1, currency: 'USD', unit: 'kg' }
        },
        vat_exempt: false
      };

      (mockHSClient.getTariff as any).mockResolvedValue(tariffInfo);
      (mockCache.query as any).mockReturnValueOnce([{
        country_code: 'KZ',
        import_vat_default_rate: 0.12,
        active: true
      }]);

      const result = await calculator.execute(passport, hsResult, customsValue);

      // 10% of 1000 = 100, 1 USD/kg * 10 kg = 10, total = 110
      expect(result.duty.range_usd).toEqual([110, 110]);
      expect(result.duty.breakdown[0].type).toBe('sum');
    });
  });

  describe('Max Duty (advalorem vs specific)', () => {
    it('should calculate max duty correctly', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 1
      };

      const hsResult: HSResult = {
        candidates: [{
          hs_code: '1234567890',
          confidence: 0.85,
          rationale: [],
          risk_flags: []
        }],
        requires_human_confirmation: false
      };

      const customsValue: CustomsValueResult = {
        customs_value_usd: [1000, 1200],
        breakdown: { invoice_value_usd: 1000 },
        formula_used: 'test',
        assumptions: [],
        sources: [],
        missing_inputs: []
      };

      const tariffInfo: TariffInfo = {
        import_duty_raw: '10%, но не менее 50 USD за 1 кг',
        import_duty_parsed: {
          kind: 'max',
          options: [
            { kind: 'advalorem', percent: 0.10 },
            { kind: 'specific', amount: 50, currency: 'USD', unit: 'kg' }
          ]
        },
        vat_exempt: false
      };

      (mockHSClient.getTariff as any).mockResolvedValue(tariffInfo);
      (mockCache.query as any).mockReturnValueOnce([{
        country_code: 'KZ',
        import_vat_default_rate: 0.12,
        active: true
      }]);

      const result = await calculator.execute(passport, hsResult, customsValue);

      // advalorem: [100, 120], specific: [50, 50], max: [100, 120]
      expect(result.duty.range_usd).toEqual([100, 120]);
    });
  });

  describe('Multiple HS Candidates', () => {
    it('should aggregate duty ranges from multiple candidates', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 10
      };

      const hsResult: HSResult = {
        candidates: [
          { hs_code: '1111111111', confidence: 0.6, rationale: [], risk_flags: [] },
          { hs_code: '2222222222', confidence: 0.5, rationale: [], risk_flags: [] }
        ],
        requires_human_confirmation: true
      };

      const customsValue: CustomsValueResult = {
        customs_value_usd: [1000, 1200],
        breakdown: { invoice_value_usd: 1000 },
        formula_used: 'test',
        assumptions: [],
        sources: [],
        missing_inputs: []
      };

      (mockHSClient.getTariff as any)
        .mockResolvedValueOnce({
          import_duty_raw: '10%',
          import_duty_parsed: { kind: 'advalorem', percent: 0.10 },
          vat_exempt: false
        })
        .mockResolvedValueOnce({
          import_duty_raw: '20%',
          import_duty_parsed: { kind: 'advalorem', percent: 0.20 },
          vat_exempt: false
        });

      (mockCache.query as any).mockReturnValueOnce([{
        country_code: 'KZ',
        import_vat_default_rate: 0.12,
        active: true
      }]);

      const result = await calculator.execute(passport, hsResult, customsValue);

      // Candidate 1: [100, 120], Candidate 2: [200, 240]
      // Aggregated: [min(100,200), max(120,240)] = [100, 240]
      expect(result.duty.range_usd).toEqual([100, 240]);
      expect(result.duty.breakdown).toHaveLength(2);
      expect(result.requires_escalation).toBe(true);
      expect(result.escalation_reasons).toContain('Multiple HS candidates (2)');
    });
  });

  describe('VAT Calculation', () => {
    it('should calculate VAT on customs value + duty', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 10
      };

      const hsResult: HSResult = {
        candidates: [{
          hs_code: '1234567890',
          confidence: 0.85,
          rationale: [],
          risk_flags: []
        }],
        requires_human_confirmation: false
      };

      const customsValue: CustomsValueResult = {
        customs_value_usd: [1000, 1200],
        breakdown: { invoice_value_usd: 1000 },
        formula_used: 'test',
        assumptions: [],
        sources: [],
        missing_inputs: []
      };

      const tariffInfo: TariffInfo = {
        import_duty_raw: '10%',
        import_duty_parsed: { kind: 'advalorem', percent: 0.10 },
        vat_exempt: false
      };

      (mockHSClient.getTariff as any).mockResolvedValue(tariffInfo);
      (mockCache.query as any).mockReturnValueOnce([{
        country_code: 'KZ',
        import_vat_default_rate: 0.12,
        active: true
      }]);

      const result = await calculator.execute(passport, hsResult, customsValue);

      // duty: [100, 120]
      // vat_base: [1000+100, 1200+120] = [1100, 1320]
      // vat: [1100*0.12, 1320*0.12] = [132, 158.4]
      expect(result.vat.rate).toBe(0.12);
      expect(result.vat.range_usd[0]).toBeCloseTo(132, 1);
      expect(result.vat.range_usd[1]).toBeCloseTo(158.4, 1);
      expect(result.vat.base_formula).toBe('(customs_value + duty) * vat_rate');
    });

    it('should handle VAT exempt products', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 10
      };

      const hsResult: HSResult = {
        candidates: [{
          hs_code: '1234567890',
          confidence: 0.85,
          rationale: [],
          risk_flags: []
        }],
        requires_human_confirmation: false
      };

      const customsValue: CustomsValueResult = {
        customs_value_usd: [1000, 1000],
        breakdown: { invoice_value_usd: 1000 },
        formula_used: 'test',
        assumptions: [],
        sources: [],
        missing_inputs: []
      };

      const tariffInfo: TariffInfo = {
        import_duty_raw: '10%',
        import_duty_parsed: { kind: 'advalorem', percent: 0.10 },
        vat_exempt: true
      };

      (mockHSClient.getTariff as any).mockResolvedValue(tariffInfo);
      // VAT exempt: calculateVAT returns early without querying cache; no mockReturnValueOnce needed

      const result = await calculator.execute(passport, hsResult, customsValue);

      expect(result.vat.range_usd).toEqual([0, 0]);
      expect(result.vat.base_formula).toBe('VAT exempt');
      expect(result.assumptions).toContain('VAT exempt for this HS code');
    });
  });

  describe('Escalation Scenarios', () => {
    it('should escalate for unsupported unit', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 10
      };

      const hsResult: HSResult = {
        candidates: [{
          hs_code: '1234567890',
          confidence: 0.85,
          rationale: [],
          risk_flags: []
        }],
        requires_human_confirmation: false
      };

      const customsValue: CustomsValueResult = {
        customs_value_usd: [1000, 1000],
        breakdown: { invoice_value_usd: 1000 },
        formula_used: 'test',
        assumptions: [],
        sources: [],
        missing_inputs: []
      };

      const tariffInfo: TariffInfo = {
        import_duty_raw: '1 EUR за 1000 шт',
        import_duty_parsed: {
          kind: 'specific',
          amount: 1,
          currency: 'EUR',
          unit: '1000pcs'
        },
        vat_exempt: false
      };

      (mockHSClient.getTariff as any).mockResolvedValue(tariffInfo);
      (mockCache.query as any).mockReturnValueOnce([{
        country_code: 'KZ',
        import_vat_default_rate: 0.12,
        active: true
      }]);

      const result = await calculator.execute(passport, hsResult, customsValue);

      expect(result.requires_escalation).toBe(true);
      const codes = ReasonCodeMapper.map([], result.escalation_reasons);
      expect(codes).toContain(ReasonCode.TARIFF_NOT_SUPPORTED);
    });

    it('should escalate when HS lookup fails', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 10
      };

      (mockHSClient.getTariff as any).mockRejectedValue(new Error('Network error'));
      (mockCache.query as any).mockReturnValueOnce([{
        country_code: 'KZ',
        import_vat_default_rate: 0.12,
        active: true
      }]);

      const hsResult: HSResult = {
        candidates: [{
          hs_code: '1234567890',
          confidence: 0.85,
          rationale: [],
          risk_flags: []
        }],
        requires_human_confirmation: false
      };

      const customsValue: CustomsValueResult = {
        customs_value_usd: [1000, 1000],
        breakdown: { invoice_value_usd: 1000 },
        formula_used: 'test',
        assumptions: [],
        sources: [],
        missing_inputs: []
      };

      const result = await calculator.execute(passport, hsResult, customsValue);

      expect(result.requires_escalation).toBe(true);
      const codes = ReasonCodeMapper.map([], result.escalation_reasons);
      expect(codes).toContain(ReasonCode.TARIFF_NOT_SUPPORTED);
    });

    it('should escalate when VAT config is missing', async () => {
      const passport: DealPassport = {
        dest_country: 'AM',
        incoterms: 'FOB',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 10
      };

      const hsResult: HSResult = {
        candidates: [{
          hs_code: '1234567890',
          confidence: 0.85,
          rationale: [],
          risk_flags: []
        }],
        requires_human_confirmation: false
      };

      const customsValue: CustomsValueResult = {
        customs_value_usd: [1000, 1000],
        breakdown: { invoice_value_usd: 1000 },
        formula_used: 'test',
        assumptions: [],
        sources: [],
        missing_inputs: []
      };

      const tariffInfo: TariffInfo = {
        import_duty_raw: '10%',
        import_duty_parsed: { kind: 'advalorem', percent: 0.10 },
        vat_exempt: false
      };

      (mockHSClient.getTariff as any).mockResolvedValue(tariffInfo);
      (mockCache.query as any).mockReturnValue([]); // No VAT config

      const result = await calculator.execute(passport, hsResult, customsValue);

      expect(result.requires_escalation).toBe(true);
      const codes = ReasonCodeMapper.map([], result.escalation_reasons);
      expect(codes).toContain(ReasonCode.VAT_CONFIG_NOT_FOUND);
    });

    it('should escalate for low HS confidence', async () => {
      const passport: DealPassport = {
        dest_country: 'KZ',
        incoterms: 'FOB',
        goods_value: 1000,
        currency: 'USD',
        weight_gross_kg: 10
      };

      const hsResult: HSResult = {
        candidates: [{
          hs_code: '1234567890',
          confidence: 0.5, // Low confidence
          rationale: [],
          risk_flags: []
        }],
        requires_human_confirmation: true
      };

      const customsValue: CustomsValueResult = {
        customs_value_usd: [1000, 1000],
        breakdown: { invoice_value_usd: 1000 },
        formula_used: 'test',
        assumptions: [],
        sources: [],
        missing_inputs: []
      };

      const tariffInfo: TariffInfo = {
        import_duty_raw: '10%',
        import_duty_parsed: { kind: 'advalorem', percent: 0.10 },
        vat_exempt: false
      };

      (mockHSClient.getTariff as any).mockResolvedValue(tariffInfo);
      (mockCache.query as any).mockReturnValueOnce([{
        country_code: 'KZ',
        import_vat_default_rate: 0.12,
        active: true
      }]);

      const result = await calculator.execute(passport, hsResult, customsValue);

      expect(result.requires_escalation).toBe(true);
      const codes = ReasonCodeMapper.map([], result.escalation_reasons);
      expect(codes).toContain(ReasonCode.HS_CONFIDENCE_LOW);
    });
  });
});
