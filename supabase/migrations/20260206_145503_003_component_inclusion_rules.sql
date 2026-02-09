-- Create table for default inclusion rules
-- Enum для component.
create type public.calc_component_code as enum (
  'border_freight',
  'last_mile',
  'insurance',
  'duty',
  'vat',
  'fees'
);

create type public.calc_inclusion_status as enum ('yes', 'no', 'unknown');

create table if not exists public.calc_component_inclusion_rules (
    id uuid primary key default gen_random_uuid(),
    rule_version text references public.calc_rule_versions(version) not null,
    incoterms text not null,
    component public.calc_component_code not null,
    
    default_included public.calc_inclusion_status not null default 'unknown',
    can_override_by_user boolean not null default true,
    
    created_at timestamptz default now(),
    
    unique(rule_version, incoterms, component)
);

alter table public.calc_component_inclusion_rules enable row level security;
create policy "Public read inclusion rules" on public.calc_component_inclusion_rules
    for select using (true);
