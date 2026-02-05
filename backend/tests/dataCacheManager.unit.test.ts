
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DataCacheManager } from '../src/calc/config/DataCacheManager';

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation(() => Promise.resolve({ data: [], error: null }))
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

  // Regression 1.2: calc_shipping_lanes.enabled instead of active
  it('should use enabled=true for calc_shipping_lanes and active=true for others', async () => {
    await cacheManager.refreshAll();

    // Check calls to .eq()
    // Tables are: 
    // 'calc_country_tax_config',
    // 'calc_customs_fees_config',
    // 'calc_shipping_lanes',
    // 'calc_shipping_rate_cards',
    // 'calc_shipping_surcharges',
    // 'calc_shipping_last_mile'
    
    // Find call for calc_shipping_lanes
    const lanesCall = mockSupabase.from.mock.calls.findIndex(call => call[0] === 'calc_shipping_lanes');
    expect(lanesCall).toBeGreaterThan(-1);
    expect(mockSupabase.eq).toHaveBeenNthCalledWith(lanesCall + 1, 'enabled', true);

    // Find call for calc_shipping_rate_cards
    const rateCardsCall = mockSupabase.from.mock.calls.findIndex(call => call[0] === 'calc_shipping_rate_cards');
    expect(rateCardsCall).toBeGreaterThan(-1);
    expect(mockSupabase.eq).toHaveBeenNthCalledWith(rateCardsCall + 1, 'active', true);
  });
});
