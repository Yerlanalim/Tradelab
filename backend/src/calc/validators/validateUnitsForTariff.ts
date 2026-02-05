import { DealPassport, TariffInfo } from '../types/contracts';

// Stub for Phase 6
export function validateUnitsForTariff(
  passport: DealPassport,
  tariff: TariffInfo
): { valid: boolean; missing_units?: string[] } {
  // TODO: Implement in Phase 6
  return { valid: true };
}
