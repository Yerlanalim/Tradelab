import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
} from '../../config.js';
import { logger } from '../../logger';

export class DataCacheManager {
  private supabase: SupabaseClient;
  private cache: Map<string, any[]> = new Map();
  private lastRefresh: number = 0;
  private refreshInterval: number = 3600 * 1000; // 1 hour

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  async refreshAll(): Promise<void> {
    const tables = [
      'calc_country_tax_config',
      'calc_customs_fees_config',
      'calc_shipping_lanes',
      'calc_shipping_rate_cards',
      'calc_shipping_surcharges',
      'calc_shipping_last_mile',
      'calc_rule_versions',
      'calc_incoterms_rules',
      'calc_component_inclusion_rules',
      'calc_insurance_rules'
    ];

    // Critical tables that must load successfully
    const criticalTables = [
      'calc_country_tax_config',
      'calc_shipping_rate_cards',
      'calc_shipping_surcharges'
    ];

    const errors: string[] = [];

    for (const table of tables) {
      const { data, error } = await this.supabase
        .from(table)
        .select('*');
      
      if (error) {
        const errorMsg = `Error refreshing cache for ${table}: ${error.message}`;
        logger.error(errorMsg);
        
        if (criticalTables.includes(table)) {
          errors.push(errorMsg);
        }
        continue;
      }

      this.cache.set(table, data || []);
    }

    if (errors.length > 0) {
      throw new Error(`Failed to load critical tables: ${errors.join('; ')}`);
    }

    this.lastRefresh = Date.now();
    logger.info('Cache refreshed', { at: new Date().toISOString() });
  }

  query<T = any>(table: string, filters: Record<string, any> = {}): T[] {
    const data = this.cache.get(table) || [];
    
    return data.filter(item => {
      for (const [key, value] of Object.entries(filters)) {
        if (value && typeof value === 'object' && 'in' in value) {
          if (!value.in.includes(item[key])) return false;
        } else if (item[key] !== value) {
          return false;
        }
      }
      return true;
    }) as T[];
  }

  // Helper for single result
  findOne<T = any>(table: string, filters: Record<string, any> = {}): T | undefined {
    return this.query<T>(table, filters)[0];
  }

  async ensureLoaded(): Promise<void> {
    if (this.cache.size === 0 || Date.now() - this.lastRefresh > this.refreshInterval) {
      await this.refreshAll();
    }
  }
}

// Singleton instance
export const cacheManager = new DataCacheManager();
