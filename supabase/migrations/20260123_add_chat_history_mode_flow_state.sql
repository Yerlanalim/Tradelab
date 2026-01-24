alter table if exists public.chat_history
  add column if not exists mode text,
  add column if not exists flow_state jsonb;

update public.chat_history
set mode = case
  when section in ('p3') then 'supplier_search'
  when section in ('p1', 'p2', 'p4', 'reports') then 'report'
  else 'assistant'
end
where mode is null;
