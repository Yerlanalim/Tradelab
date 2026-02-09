
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DataCacheManager } from '../src/calc/config/DataCacheManager';

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockImplementation(() => Promise.resolve({ 
      data: [
        { id: 1, name: 'Test 1', active: true, enabled: true },
        { id: 2, name: 'Test 2', active: false, enabled: false }
      ], 
      error: null 
    })),
  }
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase
}));

describe('DataCacheManager Unit Tests', () => {
  let cacheManager: DataCacheManager;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheManager = new DataCacheManager();
  });

  it('should load all tables into cache and allow querying', async () => {
    await cacheManager.refreshAll();

    // Verify all requested tables were loaded
    const tables = [
      'calc_country_tax_config',
      'calc_shipping_lanes',
      'calc_shipping_rate_cards'
    ];
    
    for (const table of tables) {
      const results = cacheManager.query(table);
      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('name', 'Test 1');
    }
  });

  it('should filter data correctly in query()', async () => {
    await cacheManager.refreshAll();

    // Test simple filter
    const activeOnly = cacheManager.query('calc_shipping_rate_cards', { active: true });
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0].id).toBe(1);

    // Test enabled filter (for lanes)
    const enabledOnly = cacheManager.query('calc_shipping_lanes', { enabled: true });
    expect(enabledOnly).toHaveLength(1);
    expect(enabledOnly[0].id).toBe(1);
    
    // Test multiple filters
    const matched = cacheManager.query('calc_shipping_rate_cards', { id: 1, active: true });
    expect(matched).toHaveLength(1);
    
    const unmatched = cacheManager.query('calc_shipping_rate_cards', { id: 1, active: false });
    expect(unmatched).toHaveLength(0);
  });
});
