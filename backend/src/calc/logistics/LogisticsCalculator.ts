import { DealPassport, LogisticsResult, CostBreakdown, Source } from '../types/contracts';
import { DataCacheManager } from '../config/DataCacheManager';
import { CurrencyConverter } from '../currency/CurrencyConverter';
import { loadCityAliases } from '../config/loadConfig';

interface ShippingLane {
  lane_id: string;
  origin_country: string;
  origin_city: string | null;
  dest_country: string;
  dest_city: string | null;
  enabled: boolean;
}

interface RateCard {
  rate_id: string;
  lane_id: string;
  mode: 'air' | 'rail' | 'road' | 'sea';
  price_basis: string;
  rate_per_unit: number;
  min_charge: number;
  currency: string;
  transit_days_min: number;
  transit_days_max: number;
  risks: string[];
  active: boolean;
  config_version: string;
}

interface Surcharge {
  surcharge_id: string;
  rate_id: string;
  type: string;
  amount: number;
  currency: string | null;
  applies_to: string;
  active: boolean;
}

interface LastMile {
  country_code: string;
  city: string | null;
  service_provider: string;
  base_rate: number;
  currency: string;
  active: boolean;
}

export class LogisticsCalculator {
  private cityAliases: Record<string, string>;
  
  constructor() {
    this.cityAliases = loadCityAliases();
  }
  
  private normalizeCity(city?: string): string | null {
    if (!city) return null;
    return this.cityAliases[city] || city;
  }
  
  async calculate(
    passport: DealPassport,
    cache: DataCacheManager,
    converter: CurrencyConverter
  ): Promise<LogisticsResult> {
    const result: LogisticsResult = {
      scenarios: [],
      chargeable_weight_kg: passport.weight_gross_kg,
      assumptions: [],
      sources: [],
      missing_inputs: [],
      requires_escalation: false,
      escalation_reasons: []
    };

    // Normalize cities
    const originCity = this.normalizeCity(passport.origin_city);
    const destCity = this.normalizeCity(passport.dest_city);
    const originCountry = passport.country_of_origin || 'CN';

    // Find matching lanes
    const lanes = await this.findLanes(
      cache,
      originCountry,
      originCity,
      passport.dest_country,
      destCity
    );

    if (lanes.length === 0) {
      result.escalation_reasons.push('No shipping lane found for route');
      result.missing_inputs.push('shipping_lane');
      return result;
    }

    if (lanes.length > 1) {
      result.requires_escalation = true;
      result.escalation_reasons.push(`Multiple lanes found (${lanes.length})`);
    }

    // Calculate freight for each lane
    const freightRanges: Array<{
      min: number;
      max: number;
      baseCost: number;
      surcharges: number;
      lastMile: number;
      laneId: string;
      rateId: string;
    }> = [];

    for (const lane of lanes) {
      try {
        const rateCards = cache.query<RateCard>('calc_shipping_rate_cards', {
          lane_id: lane.lane_id,
          active: true
        });

        if (rateCards.length === 0) {
          result.assumptions.push(`No active rate cards for lane ${lane.lane_id}`);
          continue;
        }

        for (const rateCard of rateCards) {
          // Check if we have required data
          if (rateCard.price_basis === 'kg' && !passport.weight_gross_kg) {
            result.missing_inputs.push('weight_gross_kg');
            continue;
          }

          // Calculate base cost
          const baseCost = this.calculateBaseCost(rateCard, passport, converter);

          // Calculate surcharges
          const surcharges = cache.query<Surcharge>('calc_shipping_surcharges', {
            rate_id: rateCard.rate_id,
            active: true
          });

          const surchargeTotal = this.calculateSurcharges(
            surcharges,
            baseCost,
            converter
          );

          // Calculate last mile (optional)
          const lastMileRecords = cache.query<LastMile>('calc_shipping_last_mile', {
            country_code: passport.dest_country,
            active: true
          });

          const lastMileTotal = lastMileRecords.length > 0
            ? converter.toInternal(lastMileRecords[0].base_rate, lastMileRecords[0].currency)
            : 0;

          if (lastMileRecords.length === 0) {
            result.assumptions.push('Last mile delivery not included');
          }

          const totalMin = baseCost + surchargeTotal + lastMileTotal;
          const totalMax = baseCost + surchargeTotal + lastMileTotal;
          const borderMin = baseCost + surchargeTotal;
          const borderMax = baseCost + surchargeTotal;

          freightRanges.push({
            min: borderMin,
            max: borderMax,
            baseCost,
            surcharges: surchargeTotal,
            lastMile: lastMileTotal,
            laneId: lane.lane_id,
            rateId: rateCard.rate_id
          });

          result.sources.push({
            type: 'supabase_table',
            ref: 'calc_shipping_rate_cards',
            version: rateCard.config_version
          });
        }
      } catch (error: any) {
        result.requires_escalation = true;
        result.escalation_reasons.push(`Lane ${lane.lane_id} calculation failed: ${error.message}`);
      }
    }

    if (freightRanges.length === 0) {
      if (result.missing_inputs.length === 0) {
        result.requires_escalation = true;
        result.escalation_reasons.push('No valid freight calculations available');
      }
      return result;
    }

    // Aggregate ranges
    const borderMin = Math.min(...freightRanges.map(r => r.min));
    const borderMax = Math.max(...freightRanges.map(r => r.max));
    const lastMileMin = Math.min(...freightRanges.map(r => r.lastMile));
    const lastMileMax = Math.max(...freightRanges.map(r => r.lastMile));

    result.freight_to_border_usd = [borderMin, borderMax];
    result.last_mile_usd = [lastMileMin, lastMileMax];

    // Add breakdown info
    result.assumptions.push(
      `Freight calculated from ${freightRanges.length} rate card(s)`
    );

    return result;
  }

  private async findLanes(
    cache: DataCacheManager,
    originCountry: string,
    originCity: string | null,
    destCountry: string,
    destCity: string | null
  ): Promise<ShippingLane[]> {
    // Strategy 1: Exact city match
    let lanes = cache.query<ShippingLane>('calc_shipping_lanes', {
      origin_country: originCountry,
      origin_city: originCity,
      dest_country: destCountry,
      dest_city: destCity,
      enabled: true
    });

    if (lanes.length > 0) return lanes;

    // Strategy 2: Country-level fallback (null cities)
    lanes = cache.query<ShippingLane>('calc_shipping_lanes', {
      origin_country: originCountry,
      origin_city: null,
      dest_country: destCountry,
      dest_city: null,
      enabled: true
    });

    if (lanes.length > 0) return lanes;

    // Strategy 3: Destination city only
    if (destCity) {
      lanes = cache.query<ShippingLane>('calc_shipping_lanes', {
        origin_country: originCountry,
        dest_country: destCountry,
        dest_city: destCity,
        enabled: true
      });
    }

    return lanes;
  }

  private calculateBaseCost(
    rateCard: RateCard,
    passport: DealPassport,
    converter: CurrencyConverter
  ): number {
    let cost = 0;

    if (rateCard.price_basis === 'kg') {
      cost = rateCard.rate_per_unit * passport.weight_gross_kg;
    } else if (rateCard.price_basis === 'cbm' && passport.volume_cbm) {
      cost = rateCard.rate_per_unit * passport.volume_cbm;
    } else {
      throw new Error(`Unsupported price_basis: ${rateCard.price_basis}`);
    }

    // Apply minimum charge
    cost = Math.max(cost, rateCard.min_charge);

    // Convert to USD
    return converter.toInternal(cost, rateCard.currency);
  }

  private calculateSurcharges(
    surcharges: Surcharge[],
    baseCost: number,
    converter: CurrencyConverter
  ): number {
    let total = 0;

    for (const surcharge of surcharges) {
      if (surcharge.type.includes('percent')) {
        // Percent surcharge: amount is already a fraction (0.12 = 12%)
        total += baseCost * surcharge.amount;
      } else {
        // Fixed surcharge: convert to USD
        const surchargeUSD = converter.toInternal(
          surcharge.amount,
          surcharge.currency || 'USD'
        );
        total += surchargeUSD;
      }
    }

    return total;
  }
}
