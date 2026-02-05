import { INTERNAL_CURRENCY } from '../constants';

export class CurrencyConverter {
  private kztRates: Map<string, number> = new Map();
  
  setRate(currency: string, kztPerUnit: number): void {
    this.kztRates.set(currency, kztPerUnit);
  }
  
  // A -> KZT -> B via pivot
  convert(amount: number, from: string, to: string): number {
    if (from === to) return amount;
    
    if (from === 'KZT') {
      const toRate = this.kztRates.get(to);
      if (!toRate) throw new Error(`No rate for ${to}`);
      return amount / toRate;
    }
    
    if (to === 'KZT') {
      const fromRate = this.kztRates.get(from);
      if (!fromRate) throw new Error(`No rate for ${from}`);
      return amount * fromRate;
    }
    
    // A -> KZT -> B
    const fromRate = this.kztRates.get(from);
    const toRate = this.kztRates.get(to);
    
    if (!fromRate) throw new Error(`No rate for ${from}`);
    if (!toRate) throw new Error(`No rate for ${to}`);
    
    const amountInKZT = amount * fromRate;
    return amountInKZT / toRate;
  }
  
  // Helper: always convert to USD
  toInternal(amount: number, from: string): number {
    return this.convert(amount, from, INTERNAL_CURRENCY);
  }
}
