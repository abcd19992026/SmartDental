-- Each clinic's plan includes a limited number of receptionist seats (default 1). Owners can
-- create receptionists up to this limit for free; raising it is a platform-operator action, so
-- it's protected the same way as the rest of the billing/plan fields.
alter table public.clinics
  add column included_receptionists integer not null default 1;

-- protect_clinic_billing_fields() (Phase 1) didn't know about this column yet -- add it to the
-- existing trigger's column list rather than writing a second trigger. create or replace leaves
-- the existing trg_protect_clinic_billing trigger pointed at this same function, so no new
-- trigger is needed.
create or replace function public.protect_clinic_billing_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  if new.plan_name                is distinct from old.plan_name
  or new.plan_started_on          is distinct from old.plan_started_on
  or new.plan_expires_on          is distinct from old.plan_expires_on
  or new.is_active                 is distinct from old.is_active
  or new.suspension_reason        is distinct from old.suspension_reason
  or new.monthly_message_quota    is distinct from old.monthly_message_quota
  or new.daily_message_cap        is distinct from old.daily_message_cap
  or new.onboarding_completed     is distinct from old.onboarding_completed
  or new.included_receptionists   is distinct from old.included_receptionists
  then
    raise exception 'Only a platform administrator can change subscription fields';
  end if;

  return new;
end;
$$;
