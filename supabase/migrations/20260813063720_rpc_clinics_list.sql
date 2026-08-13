-- One row per clinic with the fields the list view needs, including aggregate counts computed
-- server-side so the client never has to N+1. SECURITY DEFINER bypasses RLS, so the
-- is_super_admin() check is explicit inside the body, same as get_platform_overview().
create or replace function public.get_clinics_list()
returns table (
  id uuid,
  name text,
  city text,
  owner_name text,
  plan_expires_on date,
  is_active boolean,
  patients_count bigint,
  messages_sent_this_month bigint,
  whatsapp_configured boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a platform administrator can view this data';
  end if;

  return query
  select
    c.id,
    c.name,
    c.city,
    c.owner_name,
    c.plan_expires_on,
    c.is_active,
    coalesce(p.patients_count, 0) as patients_count,
    coalesce(u.messages_sent, 0)::bigint as messages_sent_this_month,
    (c.whatsapp_enabled and c.waba_phone_number_id is not null) as whatsapp_configured
  from public.clinics c
  left join (
    select clinic_id, count(*) as patients_count
    from public.patients
    where is_active
    group by clinic_id
  ) p on p.clinic_id = c.id
  left join public.clinic_usage u
    on u.clinic_id = c.id and u.month = date_trunc('month', current_date)::date
  order by c.name;
end;
$$;

revoke all on function public.get_clinics_list() from public;
grant execute on function public.get_clinics_list() to authenticated;
