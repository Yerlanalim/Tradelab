import { DealPassport, LogisticsResult, LogisticsScenario, Source } from '../types/contracts';
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
  rate_id?: string;
}

interface RateCard {
  rate_id: string;
  lane_id?: string;
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
  valid_from?: string;
  valid_to?: string;
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
    let originCountry = passport.country_of_origin;
    if (!originCountry) {
        console.warn('[LogisticsCalculator] WARNING: No country_of_origin provided. Defaulting to CN.');
        originCountry = 'CN';
        result.assumptions.push('Origin country defaulted to China (CN)');
        result.is_defaulted_origin = true;
    }

    // Find matching lanes

    console.log(`[Logistics] Finding lanes for Origin: ${originCountry}/${originCity}, Dest: ${passport.dest_country}/${destCity}`);

    const lanes = await this.findLanes(
      cache,
      originCountry,
      originCity,
      passport.dest_country,
      destCity
    );

    console.log(`[Logistics] Found ${lanes.length} lanes`);

    if (lanes.length === 0) {
      result.escalation_reasons.push('No shipping lane found for route');
      // result.missing_inputs.push('shipping_lane'); // Removed to avoid blocking
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
        console.log(`[Logistics] Processing lane: ${lane.lane_id}`);
        
        const searchKey = (lane as any).rate_id ? 'rate_id' : 'lane_id';
        const searchValue = (lane as any).rate_id || lane.lane_id;

        const query: any = {
          [searchKey]: searchValue,
          active: true
        };

        if (passport.mode_preference) {
          query.mode = passport.mode_preference;
        }

        console.log(`[Logistics] Rate filter for lane ${lane.lane_id} (Strategy: ${searchKey}=${searchValue}):`, JSON.stringify(query));

        const rawRateCards = cache.query<RateCard>('calc_shipping_rate_cards', query);

        // Filter by date validity
        const now = new Date();
        const rateCards = rawRateCards.filter(rc => {
            const from = rc.valid_from ? new Date(rc.valid_from) : null;
            const to = rc.valid_to ? new Date(rc.valid_to) : null;
            if (from && now < from) return false;
            if (to && now > to) return false;
            return true;
        });

        console.log(`[Logistics] Found ${rateCards.length} active/valid rate cards for lane ${lane.lane_id} (Raw: ${rawRateCards.length})`);
        if (rateCards.length > 0) {
           console.log(`[Logistics] Rate card bases: ${rateCards.map(rc => rc.price_basis).join(', ')}`);
        }

        if (rateCards.length === 0) {
          result.assumptions.push(`No active/valid rate cards for lane ${lane.lane_id}`);
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
          
          console.log(`[Logistics] Selected rate_id: ${rateCard.rate_id} (Mode: ${rateCard.mode}, BaseCost: ${baseCost})`);

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

          // Sanitize transit days
          const transitRange: { min?: number; max?: number } = {};
          if (rateCard.transit_days_min > 0) transitRange.min = rateCard.transit_days_min;
          if (rateCard.transit_days_max > 0) transitRange.max = rateCard.transit_days_max;

          // Populate scenario for response
          result.scenarios.push({
            mode: rateCard.mode,
            lane_id: lane.lane_id,
            transit_days_range: transitRange,
            cost_usd_range: { 
                min: Math.min(totalMin, totalMax), 
                max: Math.max(totalMin, totalMax) 
            },
            breakdown: {
                freight_usd: Math.max(0, baseCost),
                surcharges_usd: surchargeTotal > 0.01 ? surchargeTotal : undefined,
                last_mile_usd: lastMileTotal > 0.01 ? lastMileTotal : undefined
            },
            risks: rateCard.risks || [],
            score: 100
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
        // CIF/CIP: Missing freight is not critical for basic landed cost (since Invoice includes it)
        // But for FOB/EXW/FCA it is critical for Customs Value 
        const isCritical = !['CIF', 'CIP'].includes(passport.incoterms);

        if (isCritical) {
          result.requires_escalation = true;
          result.escalation_reasons.push('No valid freight calculations available (required for ' + passport.incoterms + ')');
        } else {
           result.assumptions.push('No freight calculated (skipping logistics costs)');
        }
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
    
    // Validate numeric inputs from Source
    const rate = Number(rateCard.rate_per_unit);
    const minCharge = Number(rateCard.min_charge);

    if (!Number.isFinite(rate) || !Number.isFinite(minCharge)) {
        throw new Error(`Invalid numeric data in rate card ${rateCard.rate_id}: rate=${rateCard.rate_per_unit}, min=${rateCard.min_charge}`);
    }

    const basis = rateCard.price_basis.toLowerCase();

    // 1. Per Kg (with aliases)
    if (['per_kg', 'kg', 'perkg'].includes(basis)) {
        if (!passport.weight_gross_kg || passport.weight_gross_kg <= 0) {
            throw new Error(`Weight required for price_basis '${basis}'`);
        }
        cost = rate * passport.weight_gross_kg;
    } 
    // 2. Per CBM
    else if (basis === 'cbm' || basis === 'per_cbm') {
        if (!passport.volume_cbm || passport.volume_cbm <= 0) {
            // Note: In MVP calculate() might block this earlier, or assume 0
            throw new Error(`Volume required for price_basis '${basis}'`);
        }
        cost = rate * passport.volume_cbm;
    } 
    else {
      throw new Error(`Unsupported price_basis: '${rateCard.price_basis}'. Supported: per_kg, kg, cbm`);
    }

    // Apply minimum charge
    cost = Math.max(cost, minCharge);

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
