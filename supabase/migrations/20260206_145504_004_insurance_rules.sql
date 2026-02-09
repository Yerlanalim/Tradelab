-- Insurance calculation rules

create type public.calc_insurance_rate_type as enum (
    'percent',
    'fixed'
);

create type public.calc_insurance_base_type as enum (
    'invoice',
    'invoice_plus_border_freight',
    'fixed'
);

create type public.calc_source_quality as enum (
    'contract',
    'market',
    'fallback'
);

create table if not exists public.calc_insurance_rules (
    id uuid primary key default gen_random_uuid(),
    rule_version text not null
        references public.calc_rule_versions(version),

    country_code text,
    incoterms text,

    rate_type public.calc_insurance_rate_type not null default 'percent',
    rate_value numeric not null,

    base_type public.calc_insurance_base_type not null default 'invoice',
    min_premium_usd numeric not null default 0,

    source_quality public.calc_source_quality not null default 'fallback',

    created_at timestamptz not null default now()
);

alter table public.calc_insurance_rules enable row level security;

create policy "Public read insurance rules"
    on public.calc_insurance_rules
    for select
    using (true);
