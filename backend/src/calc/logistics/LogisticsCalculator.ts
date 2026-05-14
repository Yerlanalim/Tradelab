import { DealPassport, LogisticsResult, LogisticsScenario, Source } from '../types/contracts';
import { DataCacheManager } from '../config/DataCacheManager';
import { CurrencyConverter } from '../currency/CurrencyConverter';
import { logger } from '../../logger';

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
  private normalizeCity(city: string, aliases: Record<string, string>): string {
    return aliases[city.toLowerCase()] || city;
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

    // Normalize cities using Supabase cache
    const cityAliasList = cache.query<any>('calc_city_aliases', {});
    const cityAliases: Record<string, string> = {};
    for (const row of cityAliasList) {
      if (row.is_active !== false) cityAliases[row.alias] = row.canonical_city;
    }
    const originCity = passport.origin_city ? this.normalizeCity(passport.origin_city, cityAliases) : null;
    const destCity = passport.dest_city ? this.normalizeCity(passport.dest_city, cityAliases) : null;
    let originCountry = passport.country_of_origin;
    if (!originCountry) {
        logger.warn('No country_of_origin provided, defaulting to CN');
        originCountry = 'CN';
        result.assumptions.push('Origin country defaulted to China (CN)');
        result.is_defaulted_origin = true;
    }

    // Find matching lanes

    logger.debug('Finding lanes', { origin: `${originCountry}/${originCity}`, dest: `${passport.dest_country}/${destCity}` });

    const lanes = await this.findLanes(
      cache,
      originCountry,
      originCity,
      passport.dest_country,
      destCity
    );

    logger.debug('Lanes found', { count: lanes.length });

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
        logger.debug('Processing lane', { lane_id: lane.lane_id });
        
        let query: any = { active: true };
        let strategyLog = '';

        if (passport.mode_preference) {
          // Strategy A: Explicit mode preference -> Search by lane_id + mode
          query.lane_id = lane.lane_id;
          query.mode = passport.mode_preference;
          strategyLog = `Mode Preference: ${passport.mode_preference} (lookup by lane_id)`;
        } else {
          // Strategy B: Default behavior -> Use strictly the default rate_id from lane
          if (!(lane as any).rate_id) {
            logger.warn('Lane missing rate_id, skipping', { lane_id: lane.lane_id });
            result.escalation_reasons.push(`MISSING_RATE_ID_ON_LANE: Lane ${lane.lane_id}`);
            result.requires_escalation = true;
            continue;
          }
          query.rate_id = (lane as any).rate_id;
          strategyLog = `Default Rate: ${query.rate_id}`;
        }

        logger.debug('Rate filter', { lane_id: lane.lane_id, strategy: strategyLog, query });

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

        logger.debug('Rate cards found', { lane_id: lane.lane_id, count: rateCards.length, raw: rawRateCards.length });
        if (rateCards.length > 0) {
           logger.debug('Rate card bases', { bases: rateCards.map(rc => rc.price_basis) });
        }

        if (rateCards.length === 0) {
          if (passport.mode_preference) {
            result.assumptions.push(`MISSING_RATE_CARD_FOR_MODE: ${passport.mode_preference} on lane ${lane.lane_id}`);
          } else {
            result.assumptions.push(`No active/valid default rate card for lane ${lane.lane_id}`);
          }
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
          
          logger.debug('Selected rate card', { rate_id: rateCard.rate_id, mode: rateCard.mode, base_cost: baseCost });

          // Calculate surcharges
          const surcharges = cache.query<Surcharge>('calc_shipping_surcharges', {
            rate_id: rateCard.rate_id,
            active: true
          });

          const surchargeTotal = this.calculateSurcharges(
            surcharges,
            baseCost,
            converter,
            result
          );

          // Calculate last mile (optional)
          const lastMileRecords = cache.query<LastMile>('calc_shipping_last_mile', {
            country_code: passport.dest_country,
            active: true
          });

          const lastMileTotal = lastMileRecords.length > 0
            ? converter.toInternal(Number(lastMileRecords[0].base_rate), lastMileRecords[0].currency)
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
    converter: CurrencyConverter,
    result: LogisticsResult
  ): number {
    let total = 0;

    for (const surcharge of surcharges) {
      if (surcharge.applies_to !== 'base_cost') {
        result.assumptions.push(`UNSUPPORTED_SURCHARGE_APPLIES_TO: ${surcharge.applies_to} (id: ${surcharge.surcharge_id})`);
        continue;
      }

      const amount = Number(surcharge.amount);
      if (!Number.isFinite(amount)) {
          logger.warn('Invalid surcharge amount, skipping', { surcharge_id: surcharge.surcharge_id, amount: surcharge.amount });
          continue; 
      }

      if (surcharge.type.includes('percent')) {
        // Percent surcharge: amount is already a fraction (0.12 = 12%)
        total += baseCost * amount;
      } else {
        // Fixed surcharge: convert to USD
        const surchargeUSD = converter.toInternal(
          amount,
          surcharge.currency || 'USD'
        );
        total += surchargeUSD;
      }
    }

    return total;
  }
}
