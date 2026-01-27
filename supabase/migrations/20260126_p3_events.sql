create table if not exists public.p3_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id),
  session_id text null,
  event_type text not null,
  event_meta jsonb null,
  created_at timestamptz default now()
);

create index if not exists p3_events_created_idx
  on public.p3_events (created_at desc);

create index if not exists p3_events_type_created_idx
  on public.p3_events (event_type, created_at desc);

alter table public.p3_events enable row level security;

create policy "p3_events_select_own"
  on public.p3_events for select
  using (auth.uid() = user_id);
