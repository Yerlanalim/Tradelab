import { TariffInfo, DutyAST } from '../types/contracts';
import { TariffParser } from '../duty/TariffParser';

export class HSClient {
  private baseURL: string;
  private cache = new Map<string, {data: TariffInfo; timestamp: number}>();
  private cacheTTL = 24 * 3600 * 1000; // 24 hours
  private tariffParser: TariffParser;
  private circuitBreaker = {
    failures: 0,
    lastFailureTime: 0,
    state: 'CLOSED' as 'CLOSED' | 'OPEN',
    failureThreshold: 3,
    resetTimeout: 60000 // 1 minute
  };
  
  constructor() {
    this.baseURL = (process.env.TNVED_SERVICE_URL || 'http://127.0.0.1:3002').replace(/\/$/, '');
    this.tariffParser = new TariffParser();
  }
  
  private isCircuitOpen(): boolean {
    if (this.circuitBreaker.state === 'OPEN') {
      if (Date.now() - this.circuitBreaker.lastFailureTime > this.circuitBreaker.resetTimeout) {
        // TODO: add HALF_OPEN trial request instead of direct transition to CLOSED
        // Current implementation immediately transitions OPEN -> CLOSED without testing
        console.warn('[HSClient] Circuit breaker transitioning OPEN -> CLOSED (no HALF_OPEN state)');
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failures = 0;
        return false;
      }
      console.warn(`[HSClient] Circuit breaker is OPEN (failures: ${this.circuitBreaker.failures})`);
      return true;
    }
    return false;
  }

  private recordFailure() {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();
    if (this.circuitBreaker.failures >= this.circuitBreaker.failureThreshold) {
      this.circuitBreaker.state = 'OPEN';
    }
  }

  private recordSuccess() {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.state = 'CLOSED';
  }

  async getTariff(hsCode: string): Promise<TariffInfo> {
    // 1. Check cache
    const cached = this.cache.get(hsCode);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    
    // 2. Circuit breaker check
    if (this.isCircuitOpen()) {
      throw new Error(`HS Engine circuit breaker is OPEN for ${hsCode}`);
    }
    
    try {
      // 3. Fetch with timeout (3s)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${this.baseURL}/hs/code/${hsCode}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        this.recordFailure();
        throw new Error(`HS Engine error: ${response.status} ${response.statusText}`);
      }
      
      const tariffResponse = await response.json();
      const tariff = tariffResponse.exact || {};
      
      const data: TariffInfo = {
        import_duty_raw: tariff.tariff_raw || '',
        import_duty_parsed: this.tariffParser.parse(tariff.tariff_raw || ''),
        vat_exempt: tariff.vat_exempt || false,
        special_conditions: tariff.special_conditions || []
      };
      
      // 5. Cache and success
      this.cache.set(hsCode, {data, timestamp: Date.now()});
      this.recordSuccess();
      
      return data;
    } catch (error: any) {
      this.recordFailure();
      if (error.name === 'AbortError') {
        throw new Error(`HS Engine timeout for ${hsCode}`);
      }
      throw error;
    }
  }
}
