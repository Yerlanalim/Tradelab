import { TariffInfo, DutyAST } from '../types/contracts';
import { TariffParser } from '../duty/TariffParser';
import { logger } from '../../logger';

export class HSClient {
  private baseURL: string;
  private cache = new Map<string, {data: TariffInfo; timestamp: number}>();
  private cacheTTL = 24 * 3600 * 1000; // 24 hours
  private tariffParser: TariffParser;
  private circuitBreaker = {
    failures: 0,
    lastFailureTime: 0,
    state: 'CLOSED' as 'CLOSED' | 'OPEN' | 'HALF_OPEN',
    failureThreshold: 3,
    resetTimeout: 60000, // 1 minute
    trialInFlight: false
  };
  
  constructor() {
    this.baseURL = (process.env.TNVED_SERVICE_URL || 'http://127.0.0.1:3002').replace(/\/$/, '');
    this.tariffParser = new TariffParser();
  }
  
  private isCircuitOpen(): boolean {
    const cb = this.circuitBreaker;

    if (cb.state === 'CLOSED') return false;

    if (cb.state === 'OPEN') {
      if (Date.now() - cb.lastFailureTime > cb.resetTimeout) {
        cb.state = 'HALF_OPEN';
        cb.trialInFlight = true;
        logger.warn('Circuit breaker OPEN -> HALF_OPEN, sending trial request');
        return false;
      }
      logger.warn('Circuit breaker OPEN', { failures: cb.failures });
      return true;
    }

    // HALF_OPEN: пропускаем только один пробный запрос
    if (cb.trialInFlight) {
      logger.warn('Circuit breaker HALF_OPEN, trial in flight — blocking request');
      return true;
    }
    cb.trialInFlight = true;
    return false;
  }

  private recordFailure() {
    const cb = this.circuitBreaker;
    cb.failures++;
    cb.lastFailureTime = Date.now();
    cb.trialInFlight = false;
    if (cb.state === 'HALF_OPEN' || cb.failures >= cb.failureThreshold) {
      cb.state = 'OPEN';
      logger.warn('Circuit breaker -> OPEN', { failures: cb.failures });
    }
  }

  private recordSuccess() {
    const cb = this.circuitBreaker;
    if (cb.state === 'HALF_OPEN') {
      logger.info('Circuit breaker HALF_OPEN -> CLOSED (trial succeeded)');
    }
    cb.failures = 0;
    cb.state = 'CLOSED';
    cb.trialInFlight = false;
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
