import { DealPassport, CustomsValueResult, LogisticsResult, Source } from '../types/contracts';
import { CurrencyConverter } from '../currency/CurrencyConverter';
import { loadCustomsValueRules } from '../config/loadConfig';

export class EscalationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EscalationRequiredError';
  }
}

interface CustomsValueRules {
  version: string;
  insurance_rate: number;
  border_freight_fraction: number;
  country_overrides?: Record<string, Partial<Omit<CustomsValueRules, 'version' | 'country_overrides'>>>;
}

export class CustomsValueCalculator {
  private rules: CustomsValueRules;
  
  constructor() {
    this.rules = loadCustomsValueRules();
  }
  
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
        type: 'config_file',
        ref: 'customs_value_rules.json',
        version: this.rules.version
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
  
  private getCountryRules(country: string): Omit<CustomsValueRules, 'version' | 'country_overrides'> {
    const override = this.rules.country_overrides?.[country];
    return {
      insurance_rate: override?.insurance_rate ?? this.rules.insurance_rate,
      border_freight_fraction: override?.border_freight_fraction ?? this.rules.border_freight_fraction
    };
  }
  
  private handleCIF(result: CustomsValueResult, passport: DealPassport): CustomsValueResult {
    result.formula_used = 'Invoice value (CIF includes freight+insurance)';
    return result;
  }
  
  private handleFOBorEXW(
    result: CustomsValueResult,
    passport: DealPassport,
    logisticsResult: LogisticsResult,
    countryRules: Omit<CustomsValueRules, 'version' | 'country_overrides'>
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
    if (passport.invoice_includes_insurance === true) {
      result.assumptions.push('Insurance included in invoice');
    } else {
      const insuranceUSD = invoiceUSD * countryRules.insurance_rate;
      result.breakdown.insurance_usd = insuranceUSD;
      min += insuranceUSD;
      max += insuranceUSD;
      result.assumptions.push(
        `Insurance: ${(countryRules.insurance_rate * 100).toFixed(2)}% (config v${this.rules.version})`
      );
    }
    
    result.customs_value_usd = [min, max];
    result.formula_used = `Invoice + freight_to_border + insurance (${passport.incoterms})`;
    
    return result;
  }
  
  private handleDAP(
    result: CustomsValueResult,
    passport: DealPassport,
    logisticsResult: LogisticsResult,
    countryRules: Omit<CustomsValueRules, 'version' | 'country_overrides'>
  ): CustomsValueResult {
    const invoiceUSD = result.breakdown.invoice_value_usd;
    let [min, max] = result.customs_value_usd;
    
    // Check if freight inclusion is known
    if (passport.invoice_includes_freight === undefined) {
      result.missing_inputs.push('invoice_includes_freight (unknown for DAP)');
      result.assumptions.push('DAP: unknown whether freight included in invoice');
      result.formula_used = 'Invoice value (DAP freight inclusion unknown)';
    } else if (passport.invoice_includes_freight === true) {
      // Freight included in invoice
      result.formula_used = 'Invoice value (DAP includes freight)';
    } else {
      // Freight NOT included, need to add it
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
    if (passport.invoice_includes_insurance === true) {
      result.assumptions.push('Insurance included in invoice');
    } else {
      const insuranceUSD = invoiceUSD * countryRules.insurance_rate;
      result.breakdown.insurance_usd = insuranceUSD;
      min += insuranceUSD;
      max += insuranceUSD;
      result.assumptions.push(
        `Insurance: ${(countryRules.insurance_rate * 100).toFixed(2)}% (config v${this.rules.version})`
      );
    }
    
    result.customs_value_usd = [min, max];
    return result;
  }
}
