import { DealPassport, CustomsValueResult, LogisticsResult } from '../types/contracts';
import { CurrencyConverter } from '../currency/CurrencyConverter';
import { DataCacheManager } from '../config/DataCacheManager';
import { logger } from '../../logger';

export class EscalationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EscalationRequiredError';
  }
}

interface CountryRules {
  insurance_rate: number;
  border_freight_fraction: number;
}

const RULES_VERSION = 'v1.0.0';

export class CustomsValueCalculator {
  constructor(private dataCache: DataCacheManager) {}

  calculate(
    passport: DealPassport,
    logisticsResult: LogisticsResult,
    converter: CurrencyConverter
  ): CustomsValueResult {
    const invoiceUSD = converter.toInternal(passport.goods_value, passport.currency);
    const countryRules = this.getCountryRules(passport.dest_country);

    const result: CustomsValueResult = {
      customs_value_usd: [invoiceUSD, invoiceUSD],
      breakdown: {
        invoice_value_usd: invoiceUSD
      },
      formula_used: '',
      assumptions: [],
      sources: [{
        type: 'supabase_table',
        ref: 'calc_insurance_rules',
        version: RULES_VERSION
      }],
      missing_inputs: []
    };

    switch (passport.incoterms) {
      case 'CIF':
        return this.handleCIF(result, passport);

      case 'FOB':
      case 'EXW':
        return this.handleFOBorEXW(result, passport, logisticsResult, countryRules);

      case 'DAP':
        return this.handleDAP(result, passport, logisticsResult, countryRules);

      case 'DDP':
        throw new EscalationRequiredError('DDP incoterms requires escalation: duty paid breaks transparent base calculation');

      default:
        throw new Error(`Unsupported incoterms: ${passport.incoterms}`);
    }
  }

  private getCountryRules(country: string): CountryRules {
    // Try country-specific first
    const countryRows = this.dataCache.query<any>('calc_insurance_rules', {
      rule_version: RULES_VERSION,
      country_code: country
    });
    if (countryRows.length > 0) {
      return {
        insurance_rate: Number(countryRows[0].rate_value),
        border_freight_fraction: Number(countryRows[0].border_freight_fraction ?? 0.7)
      };
    }

    // Global fallback
    const fallbackRows = this.dataCache.query<any>('calc_insurance_rules', {
      rule_version: RULES_VERSION,
      source_quality: 'fallback'
    });
    if (fallbackRows.length > 0) {
      return {
        insurance_rate: Number(fallbackRows[0].rate_value),
        border_freight_fraction: Number(fallbackRows[0].border_freight_fraction ?? 0.7)
      };
    }

    // Hard fallback if DB empty
    return { insurance_rate: 0.005, border_freight_fraction: 0.7 };
  }

  private handleCIF(result: CustomsValueResult, _passport: DealPassport): CustomsValueResult {
    result.formula_used = 'Invoice value (CIF includes freight+insurance)';
    return result;
  }

  private handleFOBorEXW(
    result: CustomsValueResult,
    passport: DealPassport,
    logisticsResult: LogisticsResult,
    countryRules: CountryRules
  ): CustomsValueResult {
    const invoiceUSD = result.breakdown.invoice_value_usd;
    let [min, max] = result.customs_value_usd;

    // Freight
    if (logisticsResult.freight_to_border_usd) {
      const [freightMin, freightMax] = logisticsResult.freight_to_border_usd;
      result.breakdown.freight_to_border_usd = [freightMin, freightMax];
      min += freightMin;
      max += freightMax;
    } else {
      result.missing_inputs.push(`freight_to_border for ${passport.incoterms}`);
    }

    // Insurance
    if (passport.invoice_includes_insurance === 'yes') {
      result.assumptions.push('Insurance included in invoice');
    } else {
      const insuranceUSD = invoiceUSD * countryRules.insurance_rate;
      result.breakdown.insurance_usd = insuranceUSD;
      min += insuranceUSD;
      max += insuranceUSD;
      result.assumptions.push(
        `Insurance: ${(countryRules.insurance_rate * 100).toFixed(2)}% (rules ${RULES_VERSION})`
      );
      logger.debug('CustomsCalc insurance', { insurance_usd: insuranceUSD, rate: countryRules.insurance_rate, invoice_usd: invoiceUSD });
    }

    result.customs_value_usd = [min, max];
    result.formula_used = `Invoice + freight_to_border + insurance (${passport.incoterms})`;

    return result;
  }

  private handleDAP(
    result: CustomsValueResult,
    passport: DealPassport,
    logisticsResult: LogisticsResult,
    countryRules: CountryRules
  ): CustomsValueResult {
    const invoiceUSD = result.breakdown.invoice_value_usd;
    let [min, max] = result.customs_value_usd;

    const freightInclusion = passport.invoice_includes_freight ?? 'unknown';
    if (freightInclusion === 'unknown') {
      result.missing_inputs.push('invoice_includes_freight (unknown for DAP)');
      result.assumptions.push('DAP: unknown whether freight included in invoice');
      result.formula_used = 'Invoice value (DAP freight inclusion unknown)';
    } else if (freightInclusion === 'yes') {
      result.formula_used = 'Invoice value (DAP includes freight)';
    } else {
      if (logisticsResult.freight_to_border_usd) {
        const [freightMin, freightMax] = logisticsResult.freight_to_border_usd;
        result.breakdown.freight_to_border_usd = [freightMin, freightMax];
        min += freightMin;
        max += freightMax;
        result.formula_used = 'Invoice + freight_to_border (DAP freight not in invoice)';
      } else {
        result.missing_inputs.push('freight_to_border for DAP');
        result.formula_used = 'Invoice value (DAP freight not in invoice, missing freight data)';
      }
    }

    // Insurance
    if (passport.invoice_includes_insurance === 'yes') {
      result.assumptions.push('Insurance included in invoice');
    } else {
      const insuranceUSD = invoiceUSD * countryRules.insurance_rate;
      result.breakdown.insurance_usd = insuranceUSD;
      min += insuranceUSD;
      max += insuranceUSD;
      result.assumptions.push(
        `Insurance: ${(countryRules.insurance_rate * 100).toFixed(2)}% (rules ${RULES_VERSION})`
      );
    }

    result.customs_value_usd = [min, max];
    return result;
  }
}
