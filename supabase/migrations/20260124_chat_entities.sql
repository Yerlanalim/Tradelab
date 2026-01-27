create table if not exists public.chat_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  session_id text null,
  mode text null,
  entity_type text not null,
  entity_value jsonb not null,
  created_at timestamptz default now()
);

create index if not exists chat_entities_user_created_idx
  on public.chat_entities (user_id, created_at desc);

alter table public.chat_entities enable row level security;

create policy "chat_entities_select_own"
  on public.chat_entities for select
  using (auth.uid() = user_id);
