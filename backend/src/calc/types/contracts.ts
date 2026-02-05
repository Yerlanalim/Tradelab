// Strict enums
export type CountryCode = 'RU' | 'KZ' | 'BY' | 'AM' | 'KG' | 'UZ' | 'TJ' | 'AZ' | 'GE';
export type CurrencyCode = 'USD' | 'EUR' | 'CNY' | 'KZT' | 'RUB' | 'AMD' | 'BYN' | 'KGS' | 'UZS' | 'TJS' | 'AZN' | 'GEL';
export type Incoterms = 'EXW' | 'FOB' | 'CIF' | 'DAP' | 'DDP';

// DealPassport
export interface DealPassport {
  // Required
  dest_country: CountryCode;
  incoterms: Incoterms;
  goods_value: number;           // > 0, in passport.currency
  currency: CurrencyCode;
  weight_gross_kg: number;       // > 0, required for logistics
  
  // For customs value
  invoice_includes_freight?: boolean;
  invoice_includes_insurance?: boolean;
  
  // Optional
  weight_net_kg?: number;
  hs_code?: string;              // 10 digits
  hs_confidence?: number;        // 0-1
  hs_candidates?: HSCandidate[];
  
  product_name?: string;
  commercial_description?: string;
  material_composition?: string;
  function?: string;
  country_of_origin?: string;    // default: "CN"
  
  // For specific duties
  quantity?: number;
  volume_l?: number;
  area_m2?: number;
  engine_cc?: number;
  
  // For logistics
  dimensions_cm?: {length: number; width: number; height: number};
  volume_cbm?: number;           // for price_basis=cbm (future)
  origin_city?: string;
  dest_city?: string;
  mode_preference?: 'air'|'rail'|'road'|'sea';
  packaging_type?: string;
  
  calculation_date?: string;     // ISO date
}

// HS Engine types
export interface HSCandidate {
  hs_code: string;
  confidence: number;
  rationale: string[];
  risk_flags: string[];
  tariff?: TariffInfo;
}

export interface HSResult {
  candidates: HSCandidate[];
  requires_human_confirmation: boolean;
  query_id?: string;
}

export interface TariffInfo {
  import_duty_raw: string;
  import_duty_parsed?: DutyAST;
  vat_exempt: boolean;
  special_conditions?: string[];
}

// Tariff AST
export type DutyAST = 
  | {kind: 'advalorem'; percent: number}
  | {kind: 'specific'; amount: number; currency: string; unit: string}
  | {kind: 'sum'; advalorem: DutyAST; specific: DutyAST}
  | {kind: 'max'; options: DutyAST[]};

export interface Token {
  type: 'percent' | 'specific' | 'operator';
  value?: number;
  amount?: number;
  currency?: string;
  unit?: string;
  operator?: string;
  escalation?: boolean;
}

// CustomsValueResult
export interface CustomsValueResult {
  customs_value_usd: [number, number];
  
  breakdown: {
    invoice_value_usd: number;
    freight_to_border_usd?: [number, number];
    insurance_usd?: number;
  };
  
  formula_used: string;
  assumptions: string[];
  sources: Source[];
  missing_inputs: string[];
}

// DutyVatResult
export interface DutyVatResult {
  duty: {
    range_usd: [number, number];
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

export interface DutyBreakdown {
  hs_code: string;
  type: 'advalorem'|'specific'|'sum'|'max';
  advalorem_rate?: number;
  specific_rate?: {amount: number; currency: string; unit: string};
  calculated_amount: [number, number];
}

export interface CustomsFee {
  name: string;
  amount: number;
  currency: string;
  source_ref: string;
}

// LogisticsResult
export interface LogisticsResult {
  scenarios: LogisticsScenario[];
  
  chargeable_weight_kg: number;
  volumetric_weight_kg?: number;
  
  freight_to_border_usd?: [number, number];
  last_mile_usd?: [number, number];
  
  assumptions: string[];
  sources: Source[];
  missing_inputs: string[];
  requires_escalation: boolean;
  escalation_reasons: string[];
}

export interface LogisticsScenario {
  mode: 'air'|'rail'|'road'|'sea';
  lane_id: string;
  transit_days_range: [number, number];
  cost_usd_range: [number, number];
  breakdown: CostBreakdown[];
  risks: string[];
  score: number;
}

export interface CostBreakdown {
  component: 'freight'|'fuel_surcharge'|'terminal'|'last_mile';
  amount_range: [number, number];
  currency: string;
}

// CalculationPackage
export interface CalculationPackage {
  meta: {
    request_id?: string;
    query_time_ms: number;
    calculation_timestamp: string;
    schema_versions: {
      exchange_rates_date?: string;
      customs_value_rules_version?: string;
      config_version?: string;
    };
  };
  
  status: 'ok' | 'incomplete' | 'escalation_required';
  
  inputs_normalized: {
    dest_country: string;
    incoterms: string;
    goods_value_usd: number;
    weight_gross_kg: number;
    hs_code?: string;
  };
  
  hs_classification?: HSResult;
  logistics: LogisticsResult;
  customs_value: CustomsValueResult;
  duty_vat: DutyVatResult;
  
  totals: {
    landed_cost_range_usd: [number, number] | null;
    components: {
      product_cost_usd: number;
      shipping_usd: [number, number] | null; // Total included in landed cost
      shipping_to_border_usd: [number, number] | null;
      shipping_last_mile_usd: [number, number] | null;
      duty_usd: [number, number];
      vat_usd: [number, number];
      fees_usd: number;
    };
  };
  
  all_assumptions: string[];
  all_sources: Source[];
  all_missing_inputs: string[];
  
  requires_escalation: boolean;
  escalation_reasons: string[];
  
  confidence_level: 'high' | 'medium' | 'low';
}

// Source
export interface Source {
  type: 'hs_engine'|'supabase_table'|'nbrk_rate'|'config_file';
  ref: string;
  version?: string;
  date?: string;
}
