import { DataCacheManager } from '../config/DataCacheManager';

export interface IncotermsRule {
  incoterms: string;
  customs_components_in_base: string[];
  landed_components_in_total: string[];
  critical_components: string[];
  unknown_policy: 'INCOMPLETE_ONLY' | 'SCENARIO_RANGE' | 'ESCALATE' | 'ASSUME_DEFAULT';
}

export interface InclusionRule {
  default_included: 'yes' | 'no' | 'unknown';
  can_override_by_user: boolean;
}

export interface InsuranceRule {
  rate_type: 'percent' | 'fixed';
  rate_value: number;
  base_type: 'invoice' | 'invoice_plus_border_freight' | 'fixed';
  min_premium_usd: number;
  source_quality: 'contract' | 'market' | 'fallback';
  border_freight_fraction: number;
}

export class RuleRepository {
  private version: string = 'v1.0.0'; // Hardcoded for MVP, ideally fetched by date

  constructor(private cache: DataCacheManager) {}

  async getIncotermsRule(incoterms: string): Promise<IncotermsRule> {
    const rules = this.cache.query<any>('calc_incoterms_rules', {
      rule_version: this.version,
      incoterms: incoterms
    });

    if (rules.length === 0) {
      throw new Error(`MISSING_RULE: No incoterms rule found for ${incoterms} (version ${this.version})`);
    }

    const rule = rules[0];
    return {
      incoterms: rule.incoterms,
      customs_components_in_base: rule.customs_components_in_base ?? [],
      landed_components_in_total: rule.landed_components_in_total ?? [],
      critical_components: rule.critical_components ?? [],
      unknown_policy: rule.unknown_policy
    };
  }

  async getInclusionRule(incoterms: string, component: string): Promise<InclusionRule> {
    const rules = this.cache.query<any>('calc_component_inclusion_rules', {
      rule_version: this.version,
      incoterms: incoterms,
      component: component
    });

    // If no specific rule exists, default to 'unknown'/true (safe fallback if DB is partial, though strict mode prefers error)
    // Per strict user reqs: "No fallback logic". So if missing -> Error/assumption.
    // However, user said "Fallback: 'unknown'" in logic pipeline. Here we implementing Repository.
    // Let's return null if not found and handle in logic.
    if (rules.length === 0) {
        // Strict adherence to plan: "Fallback: 'unknown'". The repository serves data.
        // If data missing, we return null so the engine can decide.
        return { default_included: 'unknown', can_override_by_user: true };
    }

    return {
      default_included: rules[0].default_included,
      can_override_by_user: rules[0].can_override_by_user
    };
  }

  async getInsuranceRule(countryCode?: string, incoterms?: string): Promise<InsuranceRule> {
    // Priority: Specific Country > Global Default
    // For MVP we just use the default fallback one created in migration 006 (no country/incoterms set)
    // Or we query all and filter in memory if needed. 
    // Since cache.query is simple K/V match, let's try finding global default first.
    
    // Attempt 1: Specifics (skipped for MVP 006 seed which is global)
    
    // Attempt 2: Global fallback
    const rules = this.cache.query<any>('calc_insurance_rules', {
        rule_version: this.version,
        source_quality: 'fallback'
    });

    if (rules.length === 0) {
         // Fallback hardcoded ONLY if DB is empty - critical safety net but violates strictness.
         // Let's throw to signal bad DB state.
         throw new Error(`MISSING_RULE: No insurance rules found for version ${this.version}`);
    }

    // Sort/select best match if multiple logic needed (not needed for simple V1 seed)
    const best = rules[0];
    return {
        rate_type: best.rate_type,
        rate_value: Number(best.rate_value),
        base_type: best.base_type,
        min_premium_usd: Number(best.min_premium_usd),
        source_quality: best.source_quality,
        border_freight_fraction: Number(best.border_freight_fraction ?? 0.7)
    };
  }

  getCityAliases(): Record<string, string> {
    const rows = this.cache.query<any>('calc_city_aliases', { rule_version: this.version });
    const result: Record<string, string> = {};
    for (const row of rows) {
      if (row.is_active !== false) {
        result[row.alias] = row.canonical_city;
      }
    }
    return result;
  }
}
