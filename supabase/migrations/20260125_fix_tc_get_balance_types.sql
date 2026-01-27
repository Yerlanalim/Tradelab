drop function if exists public.tc_get_balance(uuid);

create function public.tc_get_balance(p_user_id uuid)
returns table (
  balance_total bigint,
  balance_purchased bigint,
  balance_bonus bigint,
  balance_promo bigint,
  balance_welcome bigint,
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
