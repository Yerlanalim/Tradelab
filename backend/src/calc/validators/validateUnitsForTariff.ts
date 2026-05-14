import { DealPassport, DutyAST, TariffInfo } from '../types/contracts';

const UNIT_TO_PASSPORT_FIELD: Record<string, keyof DealPassport> = {
  kg:        'weight_gross_kg',
  ton:       'weight_gross_kg',
  '1000pcs': 'quantity',
  pcs:       'quantity',
  pair:      'quantity',
  l:         'volume_l',
  m2:        'area_m2',
  cm3:       'engine_cc',
};

function collectSpecificUnits(ast: DutyAST): string[] {
  switch (ast.kind) {
    case 'specific': return [ast.unit];
    case 'sum':      return [...collectSpecificUnits(ast.advalorem), ...collectSpecificUnits(ast.specific)];
    case 'max':      return ast.options.flatMap(collectSpecificUnits);
    default:         return [];
  }
}

export function validateUnitsForTariff(
  passport: DealPassport,
  tariff: TariffInfo
): { valid: boolean; missing_units?: string[] } {
  if (!tariff.import_duty_parsed) return { valid: true };

  const requiredUnits = [...new Set(collectSpecificUnits(tariff.import_duty_parsed))];
  const missing = requiredUnits.filter(unit => {
    const field = UNIT_TO_PASSPORT_FIELD[unit];
    return field !== undefined && (passport[field] === undefined || passport[field] === null);
  });

  return missing.length > 0
    ? { valid: false, missing_units: missing }
    : { valid: true };
}
