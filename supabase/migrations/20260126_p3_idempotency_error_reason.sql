alter table public.orders
  add column if not exists idempotency_key text,
  add column if not exists error_reason text;

alter table public.reports
  add column if not exists idempotency_key text,
  add column if not exists error_reason text;

create unique index if not exists orders_user_idempotency_idx
  on public.orders (user_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists reports_user_idempotency_idx
  on public.reports (user_id, idempotency_key)
  where idempotency_key is not null;
