create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists public.supplier_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  session_id text null,
  query text not null,
  status text not null default 'preview',
  source_counts jsonb null,
  stats jsonb null,
  limitations text null,
  last_report_id uuid null references public.reports(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists supplier_searches_user_created_idx
  on public.supplier_searches (user_id, created_at desc);

create index if not exists supplier_searches_session_idx
  on public.supplier_searches (session_id);

drop trigger if exists set_supplier_searches_updated_at on public.supplier_searches;
create trigger set_supplier_searches_updated_at
before update on public.supplier_searches
for each row execute function public.set_updated_at();

alter table public.supplier_searches enable row level security;
create policy "supplier_searches_select_own"
  on public.supplier_searches for select
  using (auth.uid() = user_id);

create table if not exists public.supplier_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  search_id uuid null references public.supplier_searches(id) on delete set null,
  report_id uuid null references public.reports(id) on delete set null,
  result_summary jsonb null,
  expires_at timestamptz null,
  created_at timestamptz default now()
);

create index if not exists supplier_reports_user_created_idx
  on public.supplier_reports (user_id, created_at desc);

create index if not exists supplier_reports_expires_idx
  on public.supplier_reports (expires_at);

alter table public.supplier_reports enable row level security;
create policy "supplier_reports_select_own"
  on public.supplier_reports for select
  using (auth.uid() = user_id);

create table if not exists public.supplier_search_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  search_id uuid null references public.supplier_searches(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz default now()
);

create index if not exists supplier_search_messages_search_idx
  on public.supplier_search_messages (search_id, created_at asc);

alter table public.supplier_search_messages enable row level security;
create policy "supplier_search_messages_select_own"
  on public.supplier_search_messages for select
  using (auth.uid() = user_id);

alter table public.reports
  add column if not exists expires_at timestamptz,
  add column if not exists archived_at timestamptz;
