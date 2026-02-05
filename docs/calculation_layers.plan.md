План реализации Calculation Layer для TradeLab Agent (v3)
Backend: Express (подтверждено из backend/package.json)
Internal Currency: USD (все расчёты)
Display Currency: USD (с optional dest_currency для справки)
MVP Limitations: price_basis=kg only, calculation_date=latest rate

1. State Machine и переходы
1.1 Последовательность состояний
INTAKE → CLASSIFICATION → CALCULATION → COMPLIANCE_CHECK → ASSEMBLY → ESCALATION
1.2 Переход в CALCULATION (НЕ блокируется по confidence)
typescript
if (state === 'CLASSIFICATION') {
  if (hsResult.candidates.length === 0) {
    state = 'ESCALATION';
    escalationReasons.push('HS Engine не вернул ни одного кандидата');
  } else {
    // Переход в CALCULATION с любым confidence
    state = 'CALCULATION';
    calculationPackage = await calculationLayer.execute(dealPassport, hsResult);
    
    if (calculationPackage.requires_escalation) {
      state = 'ESCALATION';
    }
  }
}
1.3 Последовательность в CALCULATION
HS lookup через HSClient (timeout/cache/circuit breaker)
Logistics calculation (для freight_to_border если EXW/FOB)
Customs value calculation (зависит от logistics)
Duty/VAT calculation
Объединение в CalculationPackage с escalation flags
2. DealPassport
2.1 TypeScript контракт
typescript
type CountryCode = 'RU' | 'KZ' | 'BY' | 'AM' | 'KG';
type CurrencyCode = 'USD' | 'EUR' | 'CNY' | 'KZT' | 'RUB' | 'AMD' | 'BYN' | 'KGS';
type Incoterms = 'EXW' | 'FOB' | 'CIF' | 'DAP' | 'DDP';
interface DealPassport {
  // Обязательные
  dest_country: CountryCode;
  incoterms: Incoterms;
  goods_value: number;           // > 0
  currency: CurrencyCode;
  weight_gross_kg: number;       // > 0
  
  // НОВОЕ: для таможенной стоимости
  invoice_includes_freight?: boolean;    // включена ли доставка в invoice
  invoice_includes_insurance?: boolean;  // включена ли страховка в invoice
  
  // Опциональные
  weight_net_kg?: number;
  hs_code?: string;
  hs_confidence?: number;
  hs_candidates?: HSCandidate[];
  
  product_name?: string;
  commercial_description?: string;
  material_composition?: string;
  function?: string;
  country_of_origin?: string;    // default: "CN"
  
  // Для специфических пошлин
  quantity?: number;
  volume_l?: number;
  area_m2?: number;
  engine_cc?: number;
  
  // Для логистики
  dimensions_cm?: {length: number; width: number; height: number};
  volume_cbm?: number;               // для price_basis=cbm (future)
  origin_city?: string;
  dest_city?: string;
  mode_preference?: 'air'|'rail'|'road'|'sea';
  packaging_type?: string;
  
  calculation_date?: string;
}
2.2 Incoterms и customs value (ИСПРАВЛЕНО)
Incoterms	Логика CustomsValueCalculator
CIF	invoice_value (freight+insurance включены)
FOB	invoice_value + freight_to_border + insurance
EXW	invoice_value + freight_to_border + insurance
DAP	Если invoice_includes_freight unknown → missing_inputs + assumption. Если true → invoice_value. Если false → invoice_value + freight_to_border
DDP	ВСЕГДА escalation (duty paid ломает прозрачность базы)
2.3 Валидация
typescript
function validateForCalculation(passport: DealPassport): ValidationResult {
  const missing: string[] = [];
  
  if (!passport.dest_country) missing.push('dest_country');
  if (!passport.incoterms) missing.push('incoterms');
  if (typeof passport.goods_value !== 'number' || passport.goods_value <= 0) {
    missing.push('goods_value (must be > 0)');
  }
  if (!passport.currency) missing.push('currency');
  if (typeof passport.weight_gross_kg !== 'number' || passport.weight_gross_kg <= 0) {
    missing.push('weight_gross_kg (must be > 0)');
  }
  
  return missing.length > 0 
    ? {valid: false, missing_inputs: missing}
    : {valid: true};
}
3. Контракты результатов
3.1 CustomsValueResult
typescript
interface CustomsValueResult {
  customs_value_usd: [number, number];       // ВСЕГДА в USD
  
  breakdown: {
    invoice_value_usd: number;
    freight_to_border_usd?: [number, number];
    insurance_usd?: number;
  };
  
  formula_used: string;
  assumptions: string[];                     // включая коэффициенты
  sources: Source[];
  missing_inputs: string[];
}
3.2 DutyVatResult
typescript
interface DutyVatResult {
  duty: {
    range_usd: [number, number];             // ВСЕГДА в USD
    breakdown: DutyBreakdown[];
    base_formula: string;
  };
  
  vat: {
    rate: number;
    range_usd: [number, number];
    base_formula: string;
  };
  
  fees_usd: CustomsFee[];
  total_range_usd: [number, number];
  
  assumptions: string[];
  sources: Source[];
  missing_inputs: string[];
  requires_escalation: boolean;
  escalation_reasons: string[];
}
3.3 LogisticsResult
typescript
interface LogisticsResult {
  scenarios: LogisticsScenario[];            // top 3, sorted by score
  
  chargeable_weight_kg: number;
  volumetric_weight_kg?: number;
  
  freight_to_border_usd?: [number, number];  // для EXW/FOB
  
  assumptions: string[];
  sources: Source[];
  missing_inputs: string[];
}
interface LogisticsScenario {
  mode: 'air'|'rail'|'road'|'sea';
  lane_id: string;
  transit_days_range: [number, number];
  cost_usd_range: [number, number];          // конвертировано в USD
  breakdown: CostBreakdown[];
  risks: string[];
  score: number;                             // 0-1 normalized
}
3.4 CalculationPackage
typescript
interface CalculationPackage {
  summary: {
    total_landed_cost_usd_range: [number, number];  // USD - internal
    total_landed_cost_dest_range?: [number, number]; // опционально dest_currency
    display_currency: 'USD';
    dest_currency?: string;                         // для справки
    confidence_level: 'high'|'medium'|'low';        // см. раздел Guardrails
  };
  
  hs_classification: HSResult;
  customs_value: CustomsValueResult;
  duty_vat: DutyVatResult;
  logistics: LogisticsResult;
  
  all_assumptions: string[];
  all_sources: Source[];
  all_missing_inputs: string[];
  
  requires_escalation: boolean;
  escalation_reasons: string[];
  
  calculation_timestamp: string;
  config_version: string;
}
4. Guardrails и confidence_level
4.1 Вычисление confidence_level
typescript
function calculateConfidenceLevel(
  hsResult: HSResult,
  missingInputs: string[],
  assumptions: string[],
  escalationReasons: string[]
): 'high' | 'medium' | 'low' {
  const topConfidence = Math.max(...hsResult.candidates.map(c => c.confidence));
  const hasRiskFlags = hsResult.candidates.some(c => c.risk_flags.length > 0);
  const hasCriticalMissing = missingInputs.some(m => 
    m.includes('freight_to_border') || m.includes('hs_code')
  );
  const hasHeuristicAssumptions = assumptions.some(a => 
    a.includes('Insurance:') || a.includes('border_fraction')
  );
  
  // HIGH: всё подтверждено, нет рисков
  if (
    topConfidence >= 0.85 &&
    !hasRiskFlags &&
    missingInputs.length === 0 &&
    escalationReasons.length === 0 &&
    !hasHeuristicAssumptions
  ) {
    return 'high';
  }
  
  // LOW: критические проблемы
  if (
    topConfidence < 0.65 ||
    hasCriticalMissing ||
    escalationReasons.length > 0
  ) {
    return 'low';
  }
  
  // MEDIUM: всё остальное
  return 'medium';
}
5. Supabase модель данных
5.1 calc_shipping_surcharges (ИСПРАВЛЕНО)
sql
CREATE TABLE calc_shipping_surcharges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surcharge_id VARCHAR(50) UNIQUE NOT NULL,
  rate_id VARCHAR(50) REFERENCES calc_shipping_rate_cards(rate_id),
  type VARCHAR(50) NOT NULL,  -- fuel_percent|terminal_fixed|customs_clearance
  amount NUMERIC(10,4) NOT NULL,  -- для percent: 0.12 (12%), для fixed: абсолютная сумма
  currency VARCHAR(3),            -- NULL для percent, обязательна для fixed
  applies_to VARCHAR(20) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
5.2 Остальные таблицы
sql
-- Без изменений:
-- calc_exchange_rates
-- calc_country_tax_config (с config_version)
-- calc_customs_fees_config (с calculation_rule JSONB)
-- calc_shipping_lanes
-- calc_shipping_rate_cards
-- calc_shipping_last_mile
-- calc_config_versions (с snapshot_checksum)
5. Конфигурационные файлы (НОВОЕ)
5.1 data/calculator/customs_value_rules.json
json
{
  "version": "1.0",
  "insurance_rate": 0.005,
  "border_freight_fraction": 0.7,
  "country_overrides": {
    "KZ": {"insurance_rate": 0.006},
    "RU": {"border_freight_fraction": 0.65}
  }
}
5.2 data/calculator/cities_aliases.json
json
{
  "Алматы": "Almaty",
  "Alma-Ata": "Almaty",
  "Москва": "Moscow",
  "Moskva": "Moscow"
}
5.3 Обновить 
tariff_parser_rules.json
json
{
  "units": [
    {"pattern": "кг|kg", "normalized": "kg"},
    {"pattern": "1\\s*000\\s*шт|1000\\s*pcs", "normalized": "1000pcs"},
    {"pattern": "л|l|литр", "normalized": "l"},
    {"pattern": "м2|m2|кв\\.?м", "normalized": "m2"},
    {"pattern": "см3|cm3|мл|ml", "normalized": "cm3"},
    {"pattern": "т|ton|тонн", "normalized": "ton"},
    {"pattern": "пар|pair", "normalized": "pair"}
  ],
  "currencies": ["EUR", "USD", "KZT", "RUB", "BYN", "AMD", "KGS"],
  "operators": [
    {"pattern": "но не менее|not less than", "type": "max"},
    {"pattern": "плюс|plus|\\+", "type": "sum"},
    {"pattern": "или|or", "type": "or", "escalation": true}
  ]
}
6. Unified Currency Strategy
typescript
const INTERNAL_CURRENCY = 'USD';
const DISPLAY_CURRENCY = 'USD';
class CurrencyConverter {
  private kztRates: Map<string, number> = new Map();
  
  setRate(currency: string, kztPerUnit: number) {
    this.kztRates.set(currency, kztPerUnit);
  }
  
  // A -> KZT -> B через pivot
  convert(amount: number, from: string, to: string): number {
    if (from === to) return amount;
    
    if (from === 'KZT') {
      return amount / this.kztRates.get(to)!;
    }
    if (to === 'KZT') {
      return amount * this.kztRates.get(from)!;
    }
    
    const amountInKZT = amount * this.kztRates.get(from)!;
    return amountInKZT / this.kztRates.get(to)!;
  }
  
  // Вспомогательный: всегда в USD
  toInternal(amount: number, from: string): number {
    return this.convert(amount, from, INTERNAL_CURRENCY);
  }
}
Правило: Все intermediate calculations в USD. В конце опционально добавить dest_currency derived field.

7. CustomsValueCalculator (ИСПРАВЛЕНО)
typescript
interface CustomsValueRules {
  version: string;
  insurance_rate: number;
  border_freight_fraction: number;
  country_overrides?: Record<string, Partial<CustomsValueRules>>;
}
class CustomsValueCalculator {
  private rules: CustomsValueRules;
  
  constructor() {
    this.rules = loadJSON('data/calculator/customs_value_rules.json');
  }
  
  async calculate(
    passport: DealPassport,
    logisticsResult: LogisticsResult,
    converter: CurrencyConverter
  ): Promise<CustomsValueResult> {
    
    const invoiceUSD = converter.toInternal(passport.goods_value, passport.currency);
    const breakdown = {invoice_value_usd: invoiceUSD};
    const assumptions: string[] = [];
    const missing: string[] = [];
    
    let minUSD = invoiceUSD;
    let maxUSD = invoiceUSD;
    let formula = '';
    
    // Получить правила по стране
    const countryRules = this.rules.country_overrides?.[passport.dest_country] || this.rules;
    
    switch (passport.incoterms) {
      case 'CIF':
        formula = 'Invoice value (CIF includes freight+insurance)';
        break;
      
      case 'DDP':
        // DDP всегда требует escalation (не missing_inputs)
        throw new EscalationRequiredError('DDP requires human review - duty paid structure unclear');
        break;
      
      case 'DAP':
        if (passport.invoice_includes_freight === undefined) {
          missing.push('invoice_includes_freight (unknown для DAP)');
          assumptions.push('DAP: неизвестно, включена ли доставка в invoice');
          formula = 'Invoice value (freight inclusion UNKNOWN)';
        } else if (passport.invoice_includes_freight) {
          formula = 'Invoice value (DAP includes freight)';
        } else {
          // DAP без freight - нужна оценка до границы
          if (!logisticsResult.freight_to_border_usd) {
            missing.push('freight_to_border для DAP');
          } else {
            const [fMin, fMax] = logisticsResult.freight_to_border_usd;
            minUSD += fMin;
            maxUSD += fMax;
            breakdown.freight_to_border_usd = [fMin, fMax];
            formula = 'Invoice + freight to border (DAP without freight)';
          }
        }
        
        // Insurance обработка
        if (passport.invoice_includes_insurance) {
          assumptions.push('Insurance included in invoice');
        } else {
          const insuranceUSD = invoiceUSD * countryRules.insurance_rate;
          minUSD += insuranceUSD;
          maxUSD += insuranceUSD;
          breakdown.insurance_usd = insuranceUSD;
          assumptions.push(
            `Insurance: ${(countryRules.insurance_rate * 100).toFixed(2)}% ` +
            `(config v${this.rules.version})`
          );
        }
        break;
      
      case 'EXW':
      case 'FOB':
        if (!logisticsResult.freight_to_border_usd) {
          missing.push('freight_to_border для EXW/FOB');
        } else {
          const [fMin, fMax] = logisticsResult.freight_to_border_usd;
          minUSD += fMin;
          maxUSD += fMax;
          breakdown.freight_to_border_usd = [fMin, fMax];
          formula = 'Invoice + freight to border';
        }
        
        // Insurance: только если не включена в invoice
        if (passport.invoice_includes_insurance) {
          assumptions.push('Insurance included in invoice (unusual for EXW/FOB)');
        } else {
          const insuranceUSD = invoiceUSD * countryRules.insurance_rate;
          minUSD += insuranceUSD;
          maxUSD += insuranceUSD;
          breakdown.insurance_usd = insuranceUSD;
          assumptions.push(
            `Insurance: ${(countryRules.insurance_rate * 100).toFixed(2)}% ` +
            `(config v${this.rules.version})`
          );
        }
        break;
    }
    
    return {
      customs_value_usd: [minUSD, maxUSD],
      breakdown,
      formula_used: formula,
      assumptions,
      sources: [
        {type: 'config_file', ref: 'customs_value_rules.json', version: this.rules.version}
      ],
      missing_inputs: missing
    };
  }
}
8. TariffParser (УЛУЧШЕНО)
typescript
// Полноценный lexer
class TariffLexer {
  private rules: ParserRules;
  
  tokenize(text: string): Token[] {
    const normalized = text
      .replace(/\u00A0/g, ' ')
      .replace(/(\d),(\d)/g, '$1.$2')
      .trim();
    
    const tokens: Token[] = [];
    let pos = 0;
    
    while (pos < normalized.length) {
      // Percent: ищем все вхождения
      const percentMatch = normalized.substring(pos).match(/^(\d+(\.\d+)?)\s*%/);
      if (percentMatch) {
        tokens.push({type: 'percent', value: parseFloat(percentMatch[1]) / 100});
        pos += percentMatch[0].length;
        continue;
      }
      
      // Specific rate
      const specificPattern = new RegExp(
        `^(\\d+(\\.\\d+)?)\\s*(${this.rules.currencies.join('|')})` +
        `\\s*(за|per|/)\\s*1?\\s*(\\d+\\s*)?(${this.rules.units.map(u => u.pattern).join('|')})`
      );
      const specificMatch = normalized.substring(pos).match(specificPattern);
      if (specificMatch) {
        tokens.push({
          type: 'specific',
          amount: parseFloat(specificMatch[1]),
          currency: specificMatch[3],
          unit: this.normalizeUnit(specificMatch[6])
        });
        pos += specificMatch[0].length;
        continue;
      }
      
      // Operators
      let operatorFound = false;
      for (const op of this.rules.operators) {
        const opMatch = normalized.substring(pos).match(new RegExp(`^(${op.pattern})`, 'i'));
        if (opMatch) {
          tokens.push({
            type: 'operator',
            operator: op.type,
            escalation: op.escalation || false
          });
          pos += opMatch[0].length;
          operatorFound = true;
          break;
        }
      }
      if (operatorFound) continue;
      
      // Пропуск whitespace/знаков препинания
      if (/\s|,|;/.test(normalized[pos])) {
        pos++;
        continue;
      }
      
      // Неизвестный символ - можно пропустить или ошибку
      pos++;
    }
    
    return tokens;
  }
}
class TariffParser {
  private lexer: TariffLexer;
  private examples: Array<{raw: string; expect: DutyAST}>;
  
  parse(raw: string): DutyAST {
    const tokens = this.lexer.tokenize(raw);
    
    // Проверка на unsupported patterns
    const hasEscalationOp = tokens.some(t => t.type === 'operator' && t.escalation);
    if (hasEscalationOp) {
      throw new UnsupportedTariffError('Operator "or" requires escalation');
    }
    
    return this.parseExpression(tokens);
  }
  
  private parseExpression(tokens: Token[]): DutyAST {
    const percents = tokens.filter(t => t.type === 'percent');
    const specifics = tokens.filter(t => t.type === 'specific');
    const operators = tokens.filter(t => t.type === 'operator');
    
    // Multiple specifics - не поддерживается в MVP
    if (specifics.length > 1) {
      throw new UnsupportedTariffError('Multiple specific rates not supported');
    }
    
    const opType = operators[0]?.operator;
    
    if (opType === 'max' && percents.length > 0 && specifics.length > 0) {
      return {
        kind: 'max',
        options: [
          {kind: 'advalorem', percent: percents[0].value},
          {kind: 'specific', ...specifics[0]}
        ]
      };
    }
    
    if (opType === 'sum' && percents.length > 0 && specifics.length > 0) {
      return {
        kind: 'sum',
        advalorem: {kind: 'advalorem', percent: percents[0].value},
        specific: {kind: 'specific', ...specifics[0]}
      };
    }
    
    if (percents.length > 0 && specifics.length === 0) {
      return {kind: 'advalorem', percent: percents[0].value};
    }
    
    throw new Error(`Unable to parse tokens: ${JSON.stringify(tokens)}`);
  }
  
  validate(): boolean {
    for (const example of this.examples) {
      try {
        const parsed = this.parse(example.raw);
        if (!deepEqual(parsed, example.expect)) {
          console.error(`Parse mismatch: ${example.raw}`);
          return false;
        }
      } catch (error) {
        console.error(`Parse error for: ${example.raw}`, error);
        return false;
      }
    }
    return true;
  }
}
9. HSClient (с env config)
typescript
class HSClient {
  private baseURL: string;
  private cache = new Map<string, {data: TariffInfo; timestamp: number}>();
  private cacheTTL = 24 * 3600 * 1000;
  private circuitBreaker = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 60000
  });
  
  constructor() {
    this.baseURL = process.env.TNVED_SERVICE_URL || 'http://localhost:3002';
  }
  
  async getTariff(hsCode: string): Promise<TariffInfo> {
    const cached = this.cache.get(hsCode);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    
    if (this.circuitBreaker.isOpen()) {
      throw new Error('HS Engine circuit breaker is OPEN');
    }
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${this.baseURL}/api/tnved/${hsCode}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        this.circuitBreaker.recordFailure();
        throw new Error(`HS Engine returned ${response.status}`);
      }
      
      const tariff = await response.json();
      const data: TariffInfo = {
        import_duty_raw: tariff.duty_rate_text,
        import_duty_parsed: tariffParser.parse(tariff.duty_rate_text),
        vat_exempt: tariff.vat_exempt || false
      };
      
      this.cache.set(hsCode, {data, timestamp: Date.now()});
      this.circuitBreaker.recordSuccess();
      
      return data;
    } catch (error) {
      this.circuitBreaker.recordFailure();
      throw error;
    }
  }
}
// Circuit Breaker (простая версия, risk: immediate retry после timeout)
class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private state: 'CLOSED' | 'OPEN' = 'CLOSED';
  
  constructor(private config: {failureThreshold: number; resetTimeout: number}) {}
  
  isOpen(): boolean {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailTime > this.config.resetTimeout) {
        // RISK: сразу переходим в CLOSED без HALF_OPEN
        // В production: добавить HALF_OPEN state с 1 пробным запросом
        this.state = 'CLOSED';
        this.failures = 0;
        return false;
      }
      return true;
    }
    return false;
  }
  
  recordFailure() {
    this.failures++;
    this.lastFailTime = Date.now();
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }
  
  recordSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }
}
10. Logistics Calculator
10.1 Lane matching с city aliases
typescript
class LogisticsCalculator {
  private cityAliases: Record<string, string>;
  
  constructor() {
    this.cityAliases = loadJSON('data/calculator/cities_aliases.json');
  }
  
  private normalizeCity(city?: string): string | null {
    if (!city) return null;
    return this.cityAliases[city] || city;
  }
  
  async extractLanesAndRates(passport: DealPassport): Promise<ExtractedData> {
    const originCountry = passport.country_of_origin || 'CN';
    const destCountry = passport.dest_country;
    
    // Strategy 1: exact city match
    let lanes = await cache.query('calc_shipping_lanes', {
      origin_country: originCountry,
      origin_city: this.normalizeCity(passport.origin_city),
      dest_country: destCountry,
      dest_city: this.normalizeCity(passport.dest_city),
      enabled: true
    });
    
    // Strategy 2: country-level fallback
    if (lanes.length === 0) {
      lanes = await cache.query('calc_shipping_lanes', {
        origin_country: originCountry,
        dest_country: destCountry,
        origin_city: null,
        dest_city: null,
        enabled: true
      });
    }
    
    // Strategy 3: default hub
    if (lanes.length === 0) {
      const defaultHub = getDefaultHub(destCountry);
      lanes = await cache.query('calc_shipping_lanes', {
        origin_country: originCountry,
        dest_city: defaultHub,
        enabled: true
      });
    }
    
    // Load related data
    const rateCards = await cache.query('calc_shipping_rate_cards', {
      lane_id: {in: lanes.map(l => l.lane_id)},
      active: true
    });
    
    const surcharges = await cache.query('calc_shipping_surcharges', {
      rate_id: {in: rateCards.map(r => r.rate_id)},
      active: true
    });
    
    return {lanes, rateCards, surcharges};
  }
  
  // Конвертация всех costs в USD (ИСПРАВЛЕНО)
  buildScenarios(
    rateCards: RateCard[],
    surcharges: Surcharge[],
    chargeableWeight: number,
    converter: CurrencyConverter
  ): LogisticsScenario[] {
    return rateCards.map(card => {
      // MVP: только price_basis=kg
      if (card.price_basis !== 'kg') {
        throw new UnsupportedFeatureError(
          `price_basis=${card.price_basis} not supported in MVP (only kg)`
        );
      }
      
      let baseCost = chargeableWeight * card.rate_per_unit;
      baseCost = Math.max(baseCost, card.min_charge);
      
      // Конвертация в USD
      const baseCostUSD = converter.toInternal(baseCost, card.currency);
      
      let minUSD = baseCostUSD;
      let maxUSD = baseCostUSD;
      
      // Surcharges (ИСПРАВЛЕНО)
      const cardSurcharges = surcharges.filter(s => s.rate_id === card.rate_id);
      for (const surcharge of cardSurcharges) {
        if (surcharge.type.includes('percent')) {
          // Percent: amount уже в долях (0.12 = 12%)
          minUSD += baseCostUSD * surcharge.amount;
          maxUSD += baseCostUSD * surcharge.amount;
        } else {
          // Fixed: конвертируем из валюты
          const surchargeUSD = converter.toInternal(surcharge.amount, surcharge.currency);
          minUSD += surchargeUSD;
          maxUSD += surchargeUSD;
        }
      }
      
      return {
        mode: card.mode,
        lane_id: card.lane_id,
        transit_days_range: [card.transit_days_min, card.transit_days_max],
        cost_usd_range: [minUSD, maxUSD],
        breakdown: [],  // детали
        risks: card.risks || [],
        score: 0  // будет заполнено в scoreScenarios
      };
    });
  }
  
  scoreScenarios(scenarios: LogisticsScenario[], weights: ScoringWeights): LogisticsScenario[] {
    if (scenarios.length === 0) return [];
    
    const costs = scenarios.map(s => s.cost_usd_range[0]);
    const times = scenarios.map(s => s.transit_days_range[0]);
    
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    scenarios.forEach(s => {
      const costNorm = maxCost > minCost 
        ? (maxCost - s.cost_usd_range[0]) / (maxCost - minCost)
        : 1.0;
      
      const timeNorm = maxTime > minTime
        ? (maxTime - s.transit_days_range[0]) / (maxTime - minTime)
        : 1.0;
      
      const reliabilityNorm = s.risks.length === 0 ? 1.0 : 0.5;
      
      s.score = 
        costNorm * weights.cost +
        timeNorm * weights.time +
        reliabilityNorm * weights.reliability;
    });
    
    return scenarios.sort((a, b) => b.score - a.score).slice(0, 3);
  }
  
  extractFreightToBorder(
    scenarios: LogisticsScenario[],
    incoterms: Incoterms,
    rules: CustomsValueRules,
    invoiceIncludesFreight?: boolean
  ): [number, number] | undefined {
    // Нужно для: EXW, FOB, DAP (если invoice без freight)
    const needsEstimate = 
      incoterms === 'EXW' ||
      incoterms === 'FOB' ||
      (incoterms === 'DAP' && invoiceIncludesFreight === false);
    
    if (!needsEstimate) {
      return undefined;
    }
    
    const cheapest = scenarios.reduce((min, s) => 
      s.cost_usd_range[0] < min.cost_usd_range[0] ? s : min
    );
    
    const fraction = rules.border_freight_fraction;
    return [
      cheapest.cost_usd_range[0] * fraction,
      cheapest.cost_usd_range[1] * fraction
    ];
  }
}
11. API Integration (Express)
Backend stack подтверждён: Express (см. 
backend/package.json
)

Файл: backend/src/calc-routes.ts

typescript
import express from 'express';
import { CalculationOrchestrator } from './calculators/CalculationOrchestrator';
const router = express.Router();
const orchestrator = new CalculationOrchestrator();
router.post('/calc/quote', async (req, res) => {
  const startTime = Date.now();
  const passport: DealPassport = req.body;
  
  const validation = validateForCalculation(passport);
  if (!validation.valid) {
    return res.status(200).json({
      status: 'incomplete',
      missing_inputs: validation.missing_inputs
    });
  }
  
  try {
    const calculationPackage = await orchestrator.execute(passport);
    
    logger.info('calculation_completed', {
      total_ms: Date.now() - startTime,
      dest_country: passport.dest_country,
      requires_escalation: calculationPackage.requires_escalation,
      confidence_level: calculationPackage.summary.confidence_level,
      config_version: calculationPackage.config_version
    });
    
    res.json(calculationPackage);
  } catch (error) {
    if (error instanceof MissingInputError) {
      res.status(200).json({
        status: 'incomplete',
        missing_inputs: error.fields
      });
    } else if (error instanceof EscalationRequiredError) {
      // DDP, unsupported tariffs, etc.
      res.status(200).json({
        status: 'escalation_required',
        reason: error.message
      });
    } else if (error instanceof UnsupportedFeatureError) {
      // price_basis != kg, etc.
      res.status(200).json({
        status: 'escalation_required',
        reason: error.message,
        feature: error.feature
      });
    } else {
      res.status(500).json({error: error.message});
    }
  }
});
export default router;
Интеграция в 
backend/src/server.ts
:

typescript
import calcRoutes from './calc-routes';
app.use('/api', calcRoutes);
12. План разработки
✅ Этап 1: Модели + конфиги (2-3 дня) - ЗАВЕРШЕНО
TypeScript interfaces (strict types)
CustomsValueResult, DutyVatResult, LogisticsResult
Config files: customs_value_rules.json, cities_aliases.json
Guardrails не блокируют по confidence

✅ Этап 2: Supabase schema (1-2 дня) - ЗАВЕРШЕНО
7 миграций созданы и применены
Seed с версионированием
calc_country_tax_config, calc_customs_fees_config, calc_shipping_* tables

✅ Этап 3: Cache + Currency + HSClient (3-4 дня) - ЗАВЕРШЕНО
DataCacheManager с ensureLoaded()
CurrencyConverter с KZT pivot (toInternal для USD)
HSClient (env URL, timeout 3s, cache 24h, circuit breaker)

✅ Этап 4: TariffParser (3-4 дня) - ЗАВЕРШЕНО
Полный lexer (все токены: percent, specific, operators)
Поддержка advalorem, specific, sum, max
UnsupportedTariffError для unsupported patterns
Golden tests (9 тестов проходят)

✅ Этап 5: CustomsValueCalculator (2-3 дня) - ЗАВЕРШЕНО
Правила из customs_value_rules.json
invoice_includes_freight/insurance поля обработаны
DDP → EscalationRequiredError
DAP → missing_inputs если unknown
CIF/FOB/EXW логика реализована
9 comprehensive тестов проходят

✅ Этап 6: DutyVatCalculator (3-4 дня) - ЗАВЕРШЕНО
AST evaluation: advalorem/specific/sum/max
Multiple HS candidates → aggregated duty range
VAT calculation: (customs_value + duty) * vat_rate
VAT exemption поддержка
Escalation handling (low confidence, unsupported units, missing config)
11 comprehensive тестов проходят
Интеграция с HSClient и DataCacheManager

✅ Этап 7: LogisticsCalculator (3-4 дня) - ЗАВЕРШЕНО
Lane matching 3-level (exact city → country → DEFAULT)
City aliases из cities_aliases.json
Rate cards: per_kg support (MVP)
Surcharges: percent + fixed с currency conversion
Multiple lanes → aggregated range + escalation
freight_to_border_usd excludes last mile
Missing data → escalation + null freight
10 comprehensive тестов проходят
Интеграция с Orchestrator

✅ Этап 8: Orchestration + API (2-3 дня) - ЗАВЕРШЕНО
CalculationPackage с полной структурой (meta, status, totals)
Aggregation utilities (sources, assumptions, missing_inputs, escalation_reasons)
assembleTotals с правильной логикой (landed_cost только если все компоненты есть)
calculateConfidenceLevel (high/medium/low)
API /calc/quote с правильными статусами (ok/incomplete/escalation_required)
Error handling: 200 для escalation, 400 для validation, 500 для bugs
Интеграция всех калькуляторов в единый flow
3 integration тестов проходят

✅ Этап 9: Тесты + QA + Документация (3-4 дня) - ЗАВЕРШЕНО
Golden test suite (4 тестов): CIF, DDP, low confidence, currency conversion
API validation tests (5 тестов): presence checks, invalid inputs
README обновлён с Calculation Layer секцией
npm scripts: test, test:watch, test:ci, typecheck
57/57 тестов проходят ✅
typecheck проходит ✅

Прогресс: 9/9 этапов завершено (100%) ✅
Milestone 1: Infrastructure (7-9 дней) - ✅ ЗАВЕРШЕНО
Milestone 2: Calculators (11-15 дней) - ✅ ЗАВЕРШЕНО
Milestone 3: API + Tests (5-7 дней) - ✅ ЗАВЕРШЕНО

🎉 ПРОЕКТ CALCULATION LAYER ПОЛНОСТЬЮ ЗАВЕРШЁН! 🎉