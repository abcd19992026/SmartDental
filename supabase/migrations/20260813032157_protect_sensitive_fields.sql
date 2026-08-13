-- RLS policies control which ROWS a role can touch, not which COLUMNS -- so the broad
-- owner-write policies on clinics and profiles (rls_clinics_branches_profiles.sql) need a
-- second layer to stop an owner from editing fields they shouldn't, even though they're
-- allowed to UPDATE the row at all. Both triggers let auth.uid() is null through
-- unconditionally (service-role/Edge Function writes have no auth.uid() and must never be
-- blocked by these) and let is_super_admin() through unconditionally.

-- Without this, any owner could run
--   supabase.from('clinics').update({ plan_expires_on: '2099-01-01', is_active: true })
-- from the browser console and permanently defeat the platform operator's ability to suspend
-- them.
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

  if new.plan_name             is distinct from old.plan_name
  or new.plan_started_on       is distinct from old.plan_started_on
  or new.plan_expires_on       is distinct from old.plan_expires_on
  or new.is_active              is distinct from old.is_active
  or new.suspension_reason     is distinct from old.suspension_reason
  or new.monthly_message_quota is distinct from old.monthly_message_quota
  or new.daily_message_cap     is distinct from old.daily_message_cap
  or new.onboarding_completed  is distinct from old.onboarding_completed
  then
    raise exception 'Only a platform administrator can change subscription fields';
  end if;

  return new;
end;
$$;

create trigger trg_protect_clinic_billing
  before update on public.clinics
  for each row execute function public.protect_clinic_billing_fields();

-- Stops a user from self-promoting or re-assigning their own clinic via the "owner can write
-- profiles in their clinic" policy. The chk_super_admin_no_clinic check constraint on profiles
-- only blocks the worst case (self-promotion to super_admin while keeping clinic_id set), not,
-- say, a receptionist setting their own role to owner. Only blocks a user editing their OWN
-- row -- an owner legitimately changing another profile's role within their clinic (staff
-- management, a later phase) still goes through, since auth.uid() = old.id is false there.
create or replace function public.protect_profile_role_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  if auth.uid() = old.id and (
    new.role      is distinct from old.role
    or new.clinic_id is distinct from old.clinic_id
  ) then
    raise exception 'You cannot change your own role or clinic assignment';
  end if;

  return new;
end;
$$;

create trigger trg_protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role_fields();
