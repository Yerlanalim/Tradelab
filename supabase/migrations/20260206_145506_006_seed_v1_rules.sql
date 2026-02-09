-- Seed Initial V1 Data

-- 1. Create Rule Version v1.0.0
insert into public.calc_rule_versions (version, active_from, description)
values ('v1.0.0', now(), 'Initial baseline logic (legacy-compatible)')
on conflict (version) do nothing;


-- 2. Incoterms Rules (V1)

insert into public.calc_incoterms_rules (
    rule_version,
    incoterms,
    customs_components_in_base,
    landed_components_in_total,
    critical_components,
    unknown_policy
)
values
-- CIF / CIP
-- Assumption: CIF and CIP are treated identically in v1 (freight + insurance embedded in invoice).
('v1.0.0', 'CIF',
 '[]'::jsonb,
 '["last_mile","duty","vat","fees"]'::jsonb,
 '[]'::jsonb,
 'INCOMPLETE_ONLY'),

('v1.0.0', 'CIP',
 '[]'::jsonb,
 '["last_mile","duty","vat","fees"]'::jsonb,
 '[]'::jsonb,
 'INCOMPLETE_ONLY'),

-- FOB / FCA
('v1.0.0', 'FOB',
 '["border_freight","insurance"]'::jsonb,
 '["border_freight","last_mile","duty","vat","fees"]'::jsonb,
 '["border_freight"]'::jsonb,
 'INCOMPLETE_ONLY'),

('v1.0.0', 'FCA',
 '["border_freight","insurance"]'::jsonb,
 '["border_freight","last_mile","duty","vat","fees"]'::jsonb,
 '["border_freight"]'::jsonb,
 'INCOMPLETE_ONLY'),

-- EXW
('v1.0.0', 'EXW',
 '["border_freight","insurance"]'::jsonb,
 '["border_freight","last_mile","duty","vat","fees"]'::jsonb,
 '["border_freight"]'::jsonb,
 'INCOMPLETE_ONLY'),

-- DAP
('v1.0.0', 'DAP',
 '["border_freight","insurance"]'::jsonb,
 '["border_freight","last_mile","duty","vat","fees"]'::jsonb,
 '[]'::jsonb,
 'SCENARIO_RANGE'),

-- DDP
('v1.0.0', 'DDP',
 '[]'::jsonb,
 '[]'::jsonb,
 '[]'::jsonb,
 'ESCALATE')
on conflict (rule_version, incoterms) do nothing;


-- 3. Component Inclusion Defaults (V1)

insert into public.calc_component_inclusion_rules (
    rule_version,
    incoterms,
    component,
    default_included,
    can_override_by_user
)
values
-- CIF / CIP
('v1.0.0', 'CIF', 'border_freight', 'yes', true),
('v1.0.0', 'CIF', 'insurance', 'yes', true),
('v1.0.0', 'CIP', 'border_freight', 'yes', true),
('v1.0.0', 'CIP', 'insurance', 'yes', true),

-- FOB / FCA / EXW
('v1.0.0', 'FOB', 'border_freight', 'no', true),
('v1.0.0', 'FOB', 'insurance', 'no', true),
('v1.0.0', 'FCA', 'border_freight', 'no', true),
('v1.0.0', 'FCA', 'insurance', 'no', true),
('v1.0.0', 'EXW', 'border_freight', 'no', true),
('v1.0.0', 'EXW', 'insurance', 'no', true),

-- DAP
('v1.0.0', 'DAP', 'border_freight', 'unknown', true),
('v1.0.0', 'DAP', 'last_mile', 'unknown', true),
('v1.0.0', 'DAP', 'insurance', 'unknown', true)
on conflict (rule_version, incoterms, component) do nothing;


-- 4. Insurance Rules (V1 Default Fallback)

insert into public.calc_insurance_rules (
    rule_version,
    rate_type,
    rate_value,
    base_type,
    source_quality
)
values
('v1.0.0', 'percent', 0.005, 'invoice', 'fallback')
on conflict do nothing;
