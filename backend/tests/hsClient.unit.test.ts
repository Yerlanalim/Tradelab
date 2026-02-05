
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { HSClient } from '../src/calc/hs/HSClient';

describe('HSClient Unit Tests', () => {
  let hsClient: HSClient;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TNVED_SERVICE_URL = 'http://127.0.0.1:3002'; // Ensure no trailing slash
    hsClient = new HSClient();
  });

  // Regression 1.1: URL construction
  it('should construct URL correctly without double slashes', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ exact: { tariff_raw: '10%' } })
      } as Response)
    );

    await hsClient.getTariff('1234');
    
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^http:\/\/127\.0\.0\.1:3002\/hs\/code\/1234$/),
      expect.any(Object)
    );
    
    // Test with trailing slash in baseURL
    fetchSpy.mockClear();
    vi.stubEnv('TNVED_SERVICE_URL', 'http://127.0.0.1:3002/');
    hsClient = new HSClient();
    await hsClient.getTariff('5678');
    
    // It should NOT have double slashes like http://127.0.0.1:3002//hs/code/5678
    const callUrl = fetchSpy.mock.calls[0][0] as string;
    expect(callUrl).not.toContain('3002//hs');
    expect(callUrl).toBe('http://127.0.0.1:3002/hs/code/5678');
  });

  it('should handle 404/422 as errors (which orchestrator converts to escalation)', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => 
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response)
    );

    await expect(hsClient.getTariff('9999')).rejects.toThrow('HS Engine error: 404 Not Found');
  });
});
