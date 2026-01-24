alter table public.chat_history
  add column if not exists tool_calls jsonb,
  add column if not exists entities jsonb,
  add column if not exists summary text;
