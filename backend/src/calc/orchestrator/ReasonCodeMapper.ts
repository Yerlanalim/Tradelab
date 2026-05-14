export enum ReasonCode {
  // Missing Inputs
  MISSING_DEST_COUNTRY = 'MISSING_DEST_COUNTRY',
  MISSING_INCOTERMS = 'MISSING_INCOTERMS',
  MISSING_GOODS_VALUE = 'MISSING_GOODS_VALUE',
  MISSING_CURRENCY = 'MISSING_CURRENCY',
  MISSING_WEIGHT_GROSS = 'MISSING_WEIGHT_GROSS',
  MISSING_HS_CODE = 'MISSING_HS_CODE',
  MISSING_LOGISTICS_RATES = 'MISSING_LOGISTICS_RATES', // for freight_to_border, weight, etc.
  
  // VAT Config
  VAT_CONFIG_NOT_FOUND = 'VAT_CONFIG_NOT_FOUND',
  VAT_CONFIG_INACTIVE = 'VAT_CONFIG_INACTIVE',
  VAT_CONFIG_OUT_OF_DATE = 'VAT_CONFIG_OUT_OF_DATE',
  
  // Logistics Escalations
  LOGISTICS_LANE_NOT_FOUND = 'LOGISTICS_LANE_NOT_FOUND',
  LOGISTICS_MULTIPLE_LANES = 'LOGISTICS_MULTIPLE_LANES',
  LOGISTICS_RATE_MISSING = 'LOGISTICS_RATE_MISSING',
  LOGISTICS_CALCULATION_FAILED = 'LOGISTICS_CALCULATION_FAILED',
  LOGISTICS_NO_VALID_RATES = 'LOGISTICS_NO_VALID_RATES',
  
  // HS / Tariff Errors
  HS_CONFIDENCE_LOW = 'HS_CONFIDENCE_LOW',
  HS_MULTIPLE_CANDIDATES = 'HS_MULTIPLE_CANDIDATES',
  HS_DUTY_PARSE_ERROR = 'HS_DUTY_PARSE_ERROR',
  TARIFF_NOT_SUPPORTED = 'TARIFF_NOT_SUPPORTED',
  TNVED_LOOKUP_FAILED = 'TNVED_LOOKUP_FAILED',
  
  // Incoterms / Support
  INCOTERMS_NOT_SUPPORTED = 'INCOTERMS_NOT_SUPPORTED',
  INCOTERMS_DDP_NOT_SUPPORTED = 'INCOTERMS_DDP_NOT_SUPPORTED',
  
  // Unknowns
  UNKNOWN_INCLUSION = 'UNKNOWN_INCLUSION', // generic for inclusion rules
  ASSUMPTION_INCLUSION = 'ASSUMPTION_INCLUSION',
  
  // Fallback
  ESCALATION_REQUIRED = 'ESCALATION_REQUIRED',
  MISSING_INPUT = 'MISSING_INPUT'
}

export class ReasonCodeMapper {
  static map(
    missingInputs: string[],
    escalationReasons: string[]
  ): string[] {
    const codes = new Set<string>();

    // Map missing inputs
    for (const input of missingInputs) {
      if (input.includes('ASSUMPTION_')) codes.add(ReasonCode.ASSUMPTION_INCLUSION);
      else if (input.includes('dest_country')) codes.add(ReasonCode.MISSING_DEST_COUNTRY);
      else if (input.includes('incoterms')) codes.add(ReasonCode.MISSING_INCOTERMS);
      else if (input.includes('goods_value')) codes.add(ReasonCode.MISSING_GOODS_VALUE);
      else if (input.includes('currency')) codes.add(ReasonCode.MISSING_CURRENCY);
      else if (input.includes('weight')) codes.add(ReasonCode.MISSING_WEIGHT_GROSS);
      else if (input.includes('hs_code')) codes.add(ReasonCode.MISSING_HS_CODE);
      else if (input.includes('freight_to_border')) codes.add(ReasonCode.MISSING_LOGISTICS_RATES);
      else codes.add(ReasonCode.MISSING_INPUT);
    }

    // Map escalation reasons
    for (const reason of escalationReasons) {
      // VAT
      if (reason.includes('VAT_CONFIG_NOT_FOUND') || reason.includes('VAT config missing')) codes.add(ReasonCode.VAT_CONFIG_NOT_FOUND);
      else if (reason.includes('VAT_CONFIG_INACTIVE')) codes.add(ReasonCode.VAT_CONFIG_INACTIVE);
      else if (reason.includes('VAT_CONFIG_OUT_OF_DATE')) codes.add(ReasonCode.VAT_CONFIG_OUT_OF_DATE);
      
      // Logistics
      else if (reason.includes('No shipping lane found')) codes.add(ReasonCode.LOGISTICS_LANE_NOT_FOUND);
      else if (reason.includes('Multiple lanes found')) codes.add(ReasonCode.LOGISTICS_MULTIPLE_LANES);
      else if (reason.includes('MISSING_RATE_ID_ON_LANE')) codes.add(ReasonCode.LOGISTICS_RATE_MISSING);
      else if (reason.includes('Lane calculation failed') || reason.includes('calculation failed')) codes.add(ReasonCode.LOGISTICS_CALCULATION_FAILED);
      else if (reason.includes('No valid freight calculations') || reason.includes('No active/valid default rate')) codes.add(ReasonCode.LOGISTICS_NO_VALID_RATES);
      
      // HS
      else if (reason.includes('Low HS confidence')) codes.add(ReasonCode.HS_CONFIDENCE_LOW);
      else if (reason.includes('Multiple HS candidates')) codes.add(ReasonCode.HS_MULTIPLE_CANDIDATES);
      else if (reason.includes('No parsed duty')) codes.add(ReasonCode.HS_DUTY_PARSE_ERROR);
      else if (reason.includes('UNSUPPORTED_UNIT:') || reason.includes('Unsupported tariff') || reason.includes('tariff lookup failed')) codes.add(ReasonCode.TARIFF_NOT_SUPPORTED);
      else if (reason.includes('MISSING_INPUT:')) codes.add(ReasonCode.MISSING_INPUT);
      else if (reason.includes('TNVED service error') || reason.includes('TNVED lookup failed')) codes.add(ReasonCode.TNVED_LOOKUP_FAILED);
      
      // Customs/Incoterms
      else if (reason.includes('DDP incoterms requires escalation')) codes.add(ReasonCode.INCOTERMS_DDP_NOT_SUPPORTED);
      else if (reason.includes('Unsupported incoterms')) codes.add(ReasonCode.INCOTERMS_NOT_SUPPORTED);
      
      // Fallback
      else codes.add(ReasonCode.ESCALATION_REQUIRED);
    }

    const resultArray = Array.from(codes);
    // Sort to ensure deterministic output if needed, or just return
    return resultArray.sort();
  }
}
