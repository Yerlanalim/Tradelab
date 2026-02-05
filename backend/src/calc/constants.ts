export const INTERNAL_CURRENCY = 'USD';
export const DISPLAY_CURRENCY = 'USD';

export const SUPPORTED_PRICE_BASIS = ['kg'] as const;
export type SupportedPriceBasis = typeof SUPPORTED_PRICE_BASIS[number];

export const DEFAULT_SCORING_WEIGHTS = {
  cost: 0.5,
  time: 0.3,
  reliability: 0.2
};

export const DEFAULT_COUNTRY_CURRENCY_MAP: Record<string, string> = {
  'RU': 'RUB',
  'KZ': 'KZT',
  'BY': 'BYN',
  'AM': 'AMD',
  'KG': 'KGS',
  'UZ': 'UZS',
  'TJ': 'TJS',
  'AZ': 'AZN',
  'GE': 'GEL'
};

export const HS_CONFIDENCE_THRESHOLD_WARNING = 0.75;
export const MAX_HS_CANDIDATES_FOR_AUTO = 3;
