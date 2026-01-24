create or replace function public.handle_new_user_tc_bonus()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if exists (
    select 1
    from public.tc_ledger
    where user_id = new.id and reason = 'welcome_bonus'
  ) then
    return new;
  end if;

  perform public.tc_apply_credit(
    new.id,
    250,
    'welcome',
    'welcome_bonus',
    now() + interval '3 months',
    concat('welcome:', new.id)
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_tc on auth.users;

create trigger on_auth_user_created_tc
after insert on auth.users
for each row execute function public.handle_new_user_tc_bonus();
