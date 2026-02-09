import { describe, it, beforeAll, vi } from 'vitest';
import { CalculationOrchestrator } from '../../src/calc/orchestrator/CalculationOrchestrator';
import { goldenRequests } from '../../test/fixtures/golden_requests';

// Reuse the mocking infrastructure for consistent results in dev
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({
            data: [{
              date: '2026-02-05',
              rates: { USD: 470, EUR: 520, CNY: 65, RUB: 5.2, KZT: 1 }
            }],
            error: null
          }))
        }))
      }))
    })),
    rpc: vi.fn()
  }))
}));

vi.mock('../../src/calc/hs/HSClient', () => ({
  HSClient: class {
    async getTariff() {
      return {
        import_duty_raw: '10%',
        import_duty_parsed: { kind: 'advalorem', percent: 0.10 },
        vat_exempt: false
      };
    }
  }
}));

vi.mock('../../src/calc/config/DataCacheManager', () => ({
  DataCacheManager: class {
    async ensureLoaded() { return; }
    query(table: string, filters: Record<string, any> = {}) {
      if (table === 'calc_country_tax_config') return [{ country_code: filters.country_code || 'KZ', import_vat_default_rate: 0.12, active: true }];
      if (table === 'calc_incoterms_rules') return [{
          rule_version: 'v1.0.0',
          incoterms: filters.incoterms,
          customs_components_in_base: ['border_freight', 'insurance'],
          landed_components_in_total: [],
          critical_components: ['border_freight'],
          unknown_policy: filters.incoterms === 'DAP' ? 'ESCALATE' : 'ASSUME_DEFAULT'
      }];
      if (table === 'calc_insurance_rules') return [{
          rule_version: 'v1.0.0',
          rate_type: 'percent',
          rate_value: 0.01,
          base_type: 'invoice',
          min_premium_usd: 10,
          source_quality: 'fallback'
      }];
      if (table === 'calc_component_inclusion_rules') {
         const defaultInc = filters.incoterms === 'DAP' ? 'unknown' : 'no';
         if (filters.component === 'border_freight') return [{ default_included: defaultInc, can_override_by_user: true }];
         if (filters.component === 'insurance') return [{ default_included: defaultInc, can_override_by_user: true }];
      }
      return [];
    }
  }
}));

vi.mock('../../src/calc/logistics/LogisticsCalculator', () => ({
  LogisticsCalculator: class {
    async calculate() {
      return {
        scenarios: [],
        chargeable_weight_kg: 100,
        freight_to_border_usd: [200, 200],
        assumptions: [],
        sources: [],
        missing_inputs: [],
        requires_escalation: false,
        escalation_reasons: []
      };
    }
  }
}));

describe('Golden Divergence Reporter', () => {
  let orchestrator: CalculationOrchestrator;
  const report: any[] = [];

  beforeAll(() => {
    process.env.CALC_ENGINE = 'dual';
    process.env.V2_CUSTOMS_VALUE_IMPL = 'v2';
    orchestrator = new CalculationOrchestrator();
  });

  it('Generates detailed divergence report', async () => {
    for (const req of goldenRequests) {
      const result = await orchestrator.execute(req as any);
      const comparison = result.calculation_trace.engine_comparison;
      
      report.push({
        case: req.id,
        diff_count: comparison.diff_summary.diff_count,
        diffs: comparison.diff_summary.diffs,
        v2_selected_rules: comparison.v2_metadata?.selected_rules || [],
        v2_customs_impl: comparison.v2_metadata?.normalization_notes?.find((n: any) => n.customs_impl)?.customs_impl || 'unknown',
        status_legacy: result.status,
        status_v2: comparison.v2_status
      });
    }

    // Print final report as JSON block
    console.log('\n=== GOLDEN DIVERGENCE REPORT ===\n');
    console.log(JSON.stringify(report, null, 2));
    console.log('\n================================\n');
  });
});
