-- Phase 20A: "Powered by SmartDentist" print-only branding line, super_admin-controlled per
-- clinic. branding_domain is captured now but left null/empty everywhere until a domain is
-- bought -- the print page falls back to the product name alone when it's unset.
alter table public.clinics
  add column show_branding boolean not null default true,
  add column branding_domain text;

-- Folded into the same billing-protection trigger that already guards plan/expiry/quota fields
-- (most recently redefined in 20260813123851_branch_limit.sql), rather than a second trigger.
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
  or new.included_branches        is distinct from old.included_branches
  or new.show_branding            is distinct from old.show_branding
  or new.branding_domain          is distinct from old.branding_domain
  then
    raise exception 'Only a platform administrator can change subscription fields';
  end if;

  return new;
end;
$$;
