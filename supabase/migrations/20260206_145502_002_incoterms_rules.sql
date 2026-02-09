-- Create table for Incoterms calculation rules
create type public.calc_unknown_policy as enum ('INCOMPLETE_ONLY', 'SCENARIO_RANGE', 'ESCALATE');

create table if not exists public.calc_incoterms_rules (
    id uuid primary key default gen_random_uuid(),
    rule_version text references public.calc_rule_versions(version) not null,
    incoterms text not null, -- 'CIF', 'FOB', 'DAP', etc.
    
    -- Structure of components
    customs_components_in_base jsonb not null default '[]'::jsonb, -- e.g. ['border_freight', 'insurance']
    landed_components_in_total jsonb not null default '[]'::jsonb, -- e.g. ['border_freight', 'last_mile', 'duty', 'vat', 'fees']
    critical_components jsonb not null default '[]'::jsonb, -- e.g. ['border_freight'] for EXW
    
    unknown_policy public.calc_unknown_policy not null default 'INCOMPLETE_ONLY',
    
    created_at timestamptz default now(),
    
    unique(rule_version, incoterms)
);

alter table public.calc_incoterms_rules enable row level security;
create policy "Public read incoterms rules" on public.calc_incoterms_rules
    for select using (true);
