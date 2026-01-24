create table if not exists public.tc_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  tx_type text not null check (tx_type in ('credit', 'debit')),
  amount integer not null check (amount > 0),
  credit_type text null check (credit_type in ('purchased', 'bonus', 'promo', 'welcome')),
  reason text null,
  ref_id text null,
  created_at timestamptz default now()
);

create unique index if not exists tc_ledger_unique_ref
  on public.tc_ledger (user_id, ref_id, tx_type)
  where ref_id is not null;

create table if not exists public.tc_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  credit_type text not null check (credit_type in ('purchased', 'bonus', 'promo', 'welcome')),
  amount_total integer not null check (amount_total > 0),
  amount_remaining integer not null check (amount_remaining >= 0),
  expires_at timestamptz null,
  created_at timestamptz default now()
);

create index if not exists tc_packs_user_expires_idx
  on public.tc_packs (user_id, expires_at);

create or replace view public.tc_balances as
select
  user_id,
  coalesce(sum(amount_remaining), 0) as balance_total,
  coalesce(sum(amount_remaining) filter (where credit_type = 'purchased'), 0) as balance_purchased,
  coalesce(sum(amount_remaining) filter (where credit_type = 'bonus'), 0) as balance_bonus,
  coalesce(sum(amount_remaining) filter (where credit_type = 'promo'), 0) as balance_promo,
  coalesce(sum(amount_remaining) filter (where credit_type = 'welcome'), 0) as balance_welcome,
  min(expires_at) filter (where amount_remaining > 0) as next_expiry
from public.tc_packs
group by user_id;

create or replace function public.tc_get_balance(p_user_id uuid)
returns table (
  balance_total integer,
  balance_purchased integer,
  balance_bonus integer,
  balance_promo integer,
  balance_welcome integer,
  next_expiry timestamptz
) as $$
begin
  return query
  select
    coalesce(b.balance_total, 0),
    coalesce(b.balance_purchased, 0),
    coalesce(b.balance_bonus, 0),
    coalesce(b.balance_promo, 0),
    coalesce(b.balance_welcome, 0),
    b.next_expiry
  from public.tc_balances b
  where b.user_id = p_user_id;
end;
$$ language plpgsql stable;

create or replace function public.tc_apply_credit(
  p_user_id uuid,
  p_amount integer,
  p_credit_type text,
  p_reason text,
  p_expires_at timestamptz,
  p_ref_id text
)
returns table (success boolean, message text, balance_total integer) as $$
declare
  current_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    return query select false, 'invalid amount', 0;
    return;
  end if;

  insert into public.tc_packs (user_id, credit_type, amount_total, amount_remaining, expires_at)
  values (p_user_id, p_credit_type, p_amount, p_amount, p_expires_at);

  insert into public.tc_ledger (user_id, tx_type, amount, credit_type, reason, ref_id)
  values (p_user_id, 'credit', p_amount, p_credit_type, p_reason, p_ref_id);

  select coalesce(sum(amount_remaining), 0) into current_balance
  from public.tc_packs
  where user_id = p_user_id;

  return query select true, 'ok', current_balance;
end;
$$ language plpgsql;

create or replace function public.tc_apply_debit(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_ref_id text
)
returns table (success boolean, message text, balance_total integer) as $$
declare
  remaining integer := p_amount;
  current_balance integer;
  pack record;
begin
  if p_amount is null or p_amount <= 0 then
    return query select false, 'invalid amount', 0;
    return;
  end if;

  if p_ref_id is not null then
    if exists (
      select 1 from public.tc_ledger
      where user_id = p_user_id and ref_id = p_ref_id and tx_type = 'debit'
    ) then
      select coalesce(sum(amount_remaining), 0) into current_balance
      from public.tc_packs
      where user_id = p_user_id;
      return query select true, 'already debited', current_balance;
      return;
    end if;
  end if;

  select coalesce(sum(amount_remaining), 0) into current_balance
  from public.tc_packs
  where user_id = p_user_id;

  if current_balance < p_amount then
    return query select false, 'insufficient balance', current_balance;
    return;
  end if;

  for pack in
    select *
    from public.tc_packs
    where user_id = p_user_id
      and amount_remaining > 0
      and (expires_at is null or expires_at > now())
    order by
      case credit_type
        when 'promo' then 1
        when 'bonus' then 2
        when 'welcome' then 3
        else 4
      end,
      expires_at nulls last,
      created_at asc
  loop
    exit when remaining <= 0;
    if pack.amount_remaining >= remaining then
      update public.tc_packs
      set amount_remaining = amount_remaining - remaining
      where id = pack.id;
      remaining := 0;
    else
      update public.tc_packs
      set amount_remaining = 0
      where id = pack.id;
      remaining := remaining - pack.amount_remaining;
    end if;
  end loop;

  if remaining > 0 then
    return query select false, 'debit failed', current_balance;
    return;
  end if;

  insert into public.tc_ledger (user_id, tx_type, amount, reason, ref_id)
  values (p_user_id, 'debit', p_amount, p_reason, p_ref_id);

  select coalesce(sum(amount_remaining), 0) into current_balance
  from public.tc_packs
  where user_id = p_user_id;

  return query select true, 'ok', current_balance;
end;
$$ language plpgsql;

alter table public.tc_ledger enable row level security;
alter table public.tc_packs enable row level security;

create policy "tc_ledger_select_own"
  on public.tc_ledger for select
  using (auth.uid() = user_id);

create policy "tc_packs_select_own"
  on public.tc_packs for select
  using (auth.uid() = user_id);
