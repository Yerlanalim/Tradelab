create or replace function public.tc_apply_refund(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
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

  if p_ref_id is not null then
    if exists (
      select 1 from public.tc_ledger
      where user_id = p_user_id and ref_id = p_ref_id and tx_type = 'credit'
    ) then
      select coalesce(sum(amount_remaining), 0) into current_balance
      from public.tc_packs
      where user_id = p_user_id;
      return query select true, 'already refunded', current_balance;
      return;
    end if;
  end if;

  insert into public.tc_packs (user_id, credit_type, amount_total, amount_remaining, expires_at)
  values (p_user_id, 'purchased', p_amount, p_amount, null);

  insert into public.tc_ledger (user_id, tx_type, amount, credit_type, reason, ref_id)
  values (p_user_id, 'credit', p_amount, 'purchased', coalesce(p_reason, 'refund'), p_ref_id);

  select coalesce(sum(amount_remaining), 0) into current_balance
  from public.tc_packs
  where user_id = p_user_id;

  return query select true, 'ok', current_balance;
end;
$$ language plpgsql;
