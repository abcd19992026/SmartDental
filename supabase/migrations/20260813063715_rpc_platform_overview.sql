-- Overview page aggregates in a single round-trip. SECURITY DEFINER bypasses RLS entirely, so
-- the is_super_admin() check has to be explicit inside the function body -- there is no RLS
-- policy backstopping this the way there is for direct table access.
create or replace function public.get_platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a platform administrator can view this data';
  end if;

  select jsonb_build_object(
    'total_clinics', (select count(*) from public.clinics),
    'active_clinics', (
      select count(*) from public.clinics
      where is_active and (plan_expires_on is null or plan_expires_on >= current_date)
    ),
    'suspended_clinics', (select count(*) from public.clinics where not is_active),
    'expiring_within_30_days', (
      select count(*) from public.clinics
      where is_active
        and plan_expires_on is not null
        and plan_expires_on >= current_date
        and plan_expires_on <= current_date + interval '30 days'
    ),
    'messages_sent_this_month', (
      select coalesce(sum(messages_sent), 0) from public.clinic_usage
      where month = date_trunc('month', current_date)::date
    ),
    'payments_this_month', (
      select coalesce(sum(amount), 0) from public.payments
      where date_trunc('month', paid_on) = date_trunc('month', current_date)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_platform_overview() from public;
grant execute on function public.get_platform_overview() to authenticated;
