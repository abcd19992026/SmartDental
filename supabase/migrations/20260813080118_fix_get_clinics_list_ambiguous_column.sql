-- Fix: get_clinics_list() threw "column reference is_active is ambiguous" when called live.
-- Root cause is NOT a join collision -- it's a plpgsql RETURNS TABLE gotcha: every column in
-- `returns table (..., is_active boolean, ...)` is auto-declared as a variable in the function
-- body's scope. The patients-count subquery's `where is_active` was unqualified, so Postgres
-- couldn't tell whether it meant that plpgsql variable or public.patients.is_active, and
-- (with the default plpgsql.variable_conflict = error) raised rather than guess.
--
-- Fix: qualify every column reference against its source, including inside subqueries, so
-- nothing can ever resolve against the OUT-parameter variables instead of the intended table
-- column. The patients subquery now aliases the table explicitly (pt) for that purpose.
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
    select pt.clinic_id, count(*) as patients_count
    from public.patients pt
    where pt.is_active
    group by pt.clinic_id
  ) p on p.clinic_id = c.id
  left join public.clinic_usage u
    on u.clinic_id = c.id and u.month = date_trunc('month', current_date)::date
  order by c.name;
end;
$$;

revoke all on function public.get_clinics_list() from public;
grant execute on function public.get_clinics_list() to authenticated;
