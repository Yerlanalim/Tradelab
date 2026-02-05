
export const SUPPORTED_COUNTRIES = [
  { code: 'RU', name: 'Россия', flag: '🇷🇺' },
  { code: 'KZ', name: 'Казахстан', flag: '🇰🇿' },
  { code: 'BY', name: 'Беларусь', flag: '🇧🇾' },
  { code: 'AM', name: 'Армения', flag: '🇦🇲' },
  { code: 'KG', name: 'Кыргызстан', flag: '🇰🇬' },
  { code: 'UZ', name: 'Узбекистан', flag: '🇺🇿' },
  { code: 'TJ', name: 'Таджикистан', flag: '🇹🇯' },
  { code: 'AZ', name: 'Азербайджан', flag: '🇦🇿' },
  { code: 'GE', name: 'Грузия', flag: '🇬🇪' },
] as const;

export type CountryCode = typeof SUPPORTED_COUNTRIES[number]['code'];
