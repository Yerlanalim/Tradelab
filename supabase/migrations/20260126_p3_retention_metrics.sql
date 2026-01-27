-- Retention cleanup for P3 data (90 days)
create or replace function public.p3_cleanup_old_data()
returns void as $$
begin
  delete from public.supplier_search_messages
  where created_at < now() - interval '90 days';

  delete from public.supplier_reports
  where created_at < now() - interval '90 days';

  delete from public.supplier_searches
  where created_at < now() - interval '90 days';

  delete from public.p3_events
  where created_at < now() - interval '180 days';
end;
$$ language plpgsql;

-- Schedule daily cleanup when pg_cron is available
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if not exists (select 1 from cron.job where jobname = 'p3_cleanup_daily') then
      perform cron.schedule(
        'p3_cleanup_daily',
        '0 3 * * *',
        'select public.p3_cleanup_old_data();'
      );
    end if;
  end if;
end $$;
