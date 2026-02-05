import { CurrencyConverter } from './CurrencyConverter';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  SUPABASE_URL, 
  SUPABASE_SERVICE_ROLE_KEY 
} from '../../config.js';

export class CurrencyProvider {
  public converter: CurrencyConverter;
  private supabase: SupabaseClient;
  private lastFetch: number = 0;
  private fetchInterval: number = 12 * 3600 * 1000; // 12 hours
  private ratesLoaded: boolean = false;

  constructor() {
    this.converter = new CurrencyConverter();
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    
    // Always include KZT to itself
    this.converter.setRate('KZT', 1.0);
  }

  async fetchRates(): Promise<void> {
    // 1. Try to fetch latest rates from Supabase
    const { data, error } = await this.supabase
      .from('calc_exchange_rates')
      .select('*')
      .order('date', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Failed to load exchange rates from Supabase: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error('No exchange rates found in database');
    }

    const { rates } = data[0];
    for (const [currency, rate] of Object.entries(rates)) {
      this.converter.setRate(currency, rate as number);
    }
    
    this.lastFetch = Date.now();
    this.ratesLoaded = true;
    console.log(`[CurrencyProvider] Rates loaded from Supabase (date: ${data[0].date})`);
  }

  async ensureRates(): Promise<void> {
    if (Date.now() - this.lastFetch > this.fetchInterval) {
      await this.fetchRates();
    }
  }

  ensureRatesLoaded(): void {
    if (!this.ratesLoaded) {
      throw new Error('Exchange rates not loaded. Call fetchRates() first.');
    }
  }

  convert(amount: number, from: string, to: string): number {
    this.ensureRatesLoaded();
    return this.converter.convert(amount, from, to);
  }

  toInternal(amount: number, from: string): number {
    this.ensureRatesLoaded();
    return this.converter.toInternal(amount, from);
  }
}

// Singleton instance
export const currencyProvider = new CurrencyProvider();
