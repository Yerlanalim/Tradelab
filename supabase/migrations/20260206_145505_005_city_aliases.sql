-- Create table for city aliases (normalization)
create table if not exists public.calc_city_aliases (
    id uuid primary key default gen_random_uuid(),
    rule_version text not null
    references public.calc_rule_versions(version),
    country_code text not null,
    alias text not null, -- normalized lower case input
    canonical_city text not null, -- target city name in our DB
    
    is_active boolean default true,
    created_at timestamptz default now(),
    
    unique(rule_version, country_code, alias)
);

alter table public.calc_city_aliases enable row level security;
create policy "Public read city aliases" on public.calc_city_aliases
    for select using (true);
    
-- Indexes for fast lookup
create index idx_calc_city_aliases_lookup on public.calc_city_aliases(country_code, alias);
