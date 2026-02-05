
export type CountryCode = 'RU' | 'KZ' | 'BY' | 'AM' | 'KG' | 'UZ' | 'TJ' | 'AZ' | 'GE';
export type CurrencyCode = 'USD' | 'EUR' | 'CNY' | 'KZT' | 'RUB' | 'AMD' | 'BYN' | 'KGS' | 'UZS' | 'TJS' | 'AZN' | 'GEL';
export type Incoterms = 'EXW' | 'FOB' | 'CIF' | 'DAP' | 'DDP';

export interface DealPassport {
  dest_country: CountryCode;
  incoterms: Incoterms;
  goods_value: number;
  currency: CurrencyCode;
  weight_gross_kg: number;
  hs_code?: string;
  origin_city?: string;
  dest_city?: string;
}

export interface CalculationPackage {
  status: 'ok' | 'incomplete' | 'escalation_required';
  confidence_level: 'high' | 'medium' | 'low';
  requires_escalation: boolean;
  escalation_reasons: string[];
  all_missing_inputs: string[];
  all_assumptions: string[];
  
  totals: {
    landed_cost_range_usd: [number, number] | null;
    components: {
      product_cost_usd: number;
      shipping_usd: [number, number] | null;
      shipping_to_border_usd: [number, number] | null;
      shipping_last_mile_usd: [number, number] | null;
      duty_usd: [number, number] | null;
      vat_usd: [number, number] | null;
      fees_usd: number;
    };
  };
  
  logistics: {
    scenarios: any[];
    chargeable_weight_kg: number;
  };

  duty_vat: {
    duty: { range_usd: [number, number]; base_formula: string };
    vat: { rate: number; range_usd: [number, number] };
    total_range_usd: [number, number];
  };

  customs_value: {
    customs_value_usd: [number, number];
    assumptions: string[];
  };
}

/**
 * Ensures a range value is strictly [number, number] or null
 */
function normalizeRange(val: any): [number, number] | null {
  if (Array.isArray(val) && val.length === 2 && typeof val[0] === 'number' && typeof val[1] === 'number') {
    return [val[0], val[1]];
  }
  return null;
}

export async function calculateLandedCost(passport: DealPassport): Promise<CalculationPackage> {
  // Use NEXT_PUBLIC_LOCAL_BACKEND_URL to match .env convention
  const baseURL = process.env.NEXT_PUBLIC_LOCAL_BACKEND_URL || 'http://localhost:3001';
  
  const response = await fetch(`${baseURL}/api/calc/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(passport),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown API error' }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  
  // Validation/Normalization of critical range fields
  if (data.totals) {
    data.totals.landed_cost_range_usd = normalizeRange(data.totals.landed_cost_range_usd);
    if (data.totals.components) {
      data.totals.components.shipping_usd = normalizeRange(data.totals.components.shipping_usd);
      data.totals.components.shipping_to_border_usd = normalizeRange(data.totals.components.shipping_to_border_usd);
      data.totals.components.shipping_last_mile_usd = normalizeRange(data.totals.components.shipping_last_mile_usd);
      data.totals.components.duty_usd = normalizeRange(data.totals.components.duty_usd);
      data.totals.components.vat_usd = normalizeRange(data.totals.components.vat_usd);
    }
  }

  if (data.duty_vat) {
    data.duty_vat.duty.range_usd = normalizeRange(data.duty_vat.duty.range_usd);
    data.duty_vat.vat.range_usd = normalizeRange(data.duty_vat.vat.range_usd);
    data.duty_vat.total_range_usd = normalizeRange(data.duty_vat.total_range_usd);
  }

  if (data.logistics && data.logistics.scenarios) {
    data.logistics.scenarios.forEach((s: any) => {
      s.transit_days_range = normalizeRange(s.transit_days_range);
      s.cost_usd_range = normalizeRange(s.cost_usd_range);
    });
  }

  return data as CalculationPackage;
}
