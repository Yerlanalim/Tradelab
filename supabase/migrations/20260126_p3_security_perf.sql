-- RLS policies for tables without explicit rules
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'supplier_entities'
      and policyname = 'supplier_entities_select_none'
  ) then
    create policy "supplier_entities_select_none"
      on public.supplier_entities for select
      using (false);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'supplier_features'
      and policyname = 'supplier_features_select_none'
  ) then
    create policy "supplier_features_select_none"
      on public.supplier_features for select
      using (false);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'supplier_matches'
      and policyname = 'supplier_matches_select_none'
  ) then
    create policy "supplier_matches_select_none"
      on public.supplier_matches for select
      using (false);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'report_jobs'
      and policyname = 'report_jobs_select_none'
  ) then
    create policy "report_jobs_select_none"
      on public.report_jobs for select
      using (false);
  end if;
end $$;

-- Foreign key covering indexes
create index if not exists api_usage_user_id_idx on public.api_usage (user_id);
create index if not exists p3_events_user_id_idx on public.p3_events (user_id);
create index if not exists payments_order_id_idx on public.payments (order_id);
create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists report_jobs_order_id_idx on public.report_jobs (order_id);
create index if not exists reports_order_id_idx on public.reports (order_id);
create index if not exists supplier_features_supplier_id_idx on public.supplier_features (supplier_id);
create index if not exists supplier_matches_supplier_id_idx on public.supplier_matches (supplier_id);
create index if not exists supplier_reports_report_id_idx on public.supplier_reports (report_id);
create index if not exists supplier_reports_search_id_idx on public.supplier_reports (search_id);
create index if not exists supplier_search_messages_user_id_idx
  on public.supplier_search_messages (user_id);
create index if not exists supplier_searches_last_report_id_idx
  on public.supplier_searches (last_report_id);

-- Harden search_path for critical functions
alter function public.set_updated_at() set search_path = public, extensions;
alter function public.tc_get_balance(uuid) set search_path = public, extensions;
alter function public.tc_apply_credit(uuid, integer, text, text, timestamptz, text)
  set search_path = public, extensions;
alter function public.tc_apply_debit(uuid, integer, text, text)
  set search_path = public, extensions;
alter function public.tc_apply_refund(uuid, integer, text, text)
  set search_path = public, extensions;
