import { TariffParser } from '../src/calc/duty/TariffParser';

describe('TariffParser Golden Tests', () => {
  const parser = new TariffParser();

  it('should parse "50%, но не менее 1 EUR за 1 кг"', () => {
    const raw = "50%, но не менее 1 EUR за 1 кг";
    const result = parser.parse(raw);
    
    expect(result).toEqual({
      kind: 'max',
      options: [
        { kind: 'advalorem', percent: 0.50 },
        { kind: 'specific', amount: 1, currency: 'EUR', unit: 'kg' }
      ]
    });
  });

  it('should parse "10% плюс 0.08 EUR за 1 кг"', () => {
    const raw = "10% плюс 0.08 EUR за 1 кг";
    const result = parser.parse(raw);
    
    expect(result).toEqual({
      kind: 'sum',
      advalorem: { kind: 'advalorem', percent: 0.10 },
      specific: { kind: 'specific', amount: 0.08, currency: 'EUR', unit: 'kg' }
    });
  });

  it('should parse simple advalorem "15%"', () => {
    const raw = "15%";
    const result = parser.parse(raw);
    expect(result).toEqual({ kind: 'advalorem', percent: 0.15 });
  });

  it('should parse simple specific "0.5 USD за 1 см3"', () => {
    const raw = "0.5 USD за 1 см3";
    const result = parser.parse(raw);
    expect(result).toEqual({ kind: 'specific', amount: 0.5, currency: 'USD', unit: 'cm3' });
  });

  it('should throw UnsupportedTariffError for "или"', () => {
    const raw = "5% или 2 EUR за кг";
    expect(() => parser.parse(raw)).toThrow();
  });

  it('should parse "0%"', () => {
    const raw = "0%";
    const result = parser.parse(raw);
    expect(result).toEqual({ kind: 'advalorem', percent: 0 });
  });

  it('should parse "12,5%" (with comma)', () => {
    const raw = "12,5%";
    const result = parser.parse(raw);
    expect(result).toEqual({ kind: 'advalorem', percent: 0.125 });
  });

  it('should parse "1 EUR за 1000 шт"', () => {
    const raw = "1 EUR за 1000 шт";
    const result = parser.parse(raw);
    expect(result).toEqual({ kind: 'specific', amount: 1, currency: 'EUR', unit: '1000pcs' });
  });

  it('should throw for "10% плюс 2%"', () => {
    const raw = "10% плюс 2%";
    // Multiple percents not supported
    expect(() => parser.parse(raw)).toThrow();
  });
});
