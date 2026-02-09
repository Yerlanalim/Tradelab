-- Create table for storing rule versions
create table if not exists public.calc_rule_versions (
    version text primary key,
    active_from timestamptz not null,
    active_to timestamptz,
    description text,
    created_at timestamptz default now()
);

-- Enable RLS (read-only for public if needed, or service_role only)
alter table public.calc_rule_versions enable row level security;
create policy "Public read rule versions" on public.calc_rule_versions
    for select using (true);
