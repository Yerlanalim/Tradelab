import { Source } from '../types/contracts';

/**
 * Aggregates and deduplicates sources from multiple calculation results
 */
export function aggregateSources(sourcesArrays: Source[][]): Source[] {
  const seen = new Set<string>();
  const result: Source[] = [];
  
  for (const sources of sourcesArrays) {
    for (const source of sources) {
      const key = `${source.type}:${source.ref}:${source.version || ''}:${source.date || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(source);
      }
    }
  }
  
  return result;
}

/**
 * Aggregates and deduplicates assumptions from multiple calculation results
 */
export function aggregateAssumptions(assumptionsArrays: string[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  
  for (const assumptions of assumptionsArrays) {
    for (const assumption of assumptions) {
      if (!seen.has(assumption)) {
        seen.add(assumption);
        result.push(assumption);
      }
    }
  }
  
  return result;
}

/**
 * Aggregates and deduplicates missing inputs from multiple calculation results
 */
export function aggregateMissingInputs(missingInputsArrays: string[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  
  for (const missingInputs of missingInputsArrays) {
    for (const input of missingInputs) {
      if (!seen.has(input)) {
        seen.add(input);
        result.push(input);
      }
    }
  }
  
  return result;
}

/**
 * Aggregates escalation reasons from multiple calculation results
 */
export function aggregateEscalationReasons(reasonsArrays: string[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  
  for (const reasons of reasonsArrays) {
    for (const reason of reasons) {
      if (!seen.has(reason)) {
        seen.add(reason);
        result.push(reason);
      }
    }
  }
  
  return result;
}
