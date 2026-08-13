-- On-demand detection net for a create-clinic onboarding that failed partway through and
-- whose compensation (delete_clinic_cascade / auth user delete) also failed, even after
-- retries -- see the ORPHAN_CLEANUP_REQUIRED activity_log rows written by the Edge Function
-- for the same condition. This RPC finds it independently by scanning current state directly,
-- so it still works even if that log write itself failed. SECURITY DEFINER bypasses RLS
-- (needed to read auth.users), so the is_super_admin() guard is explicit in the body.
create or replace function public.find_orphaned_clinics()
returns table (
  kind text,
  id uuid,
  name text,
  email text,
  detail text
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
  -- Clinics that never finished onboarding (create-clinic died before the final
  -- onboarding_completed = true update, or that update itself failed).
  select
    'incomplete_onboarding'::text as kind,
    c.id,
    c.name,
    null::text as email,
    'onboarding_completed is false'::text as detail
  from public.clinics c
  where not c.onboarding_completed

  union all

  -- Clinics with no owner profile at all (the profile insert failed or was never reached).
  select
    'clinic_without_owner'::text as kind,
    c.id,
    c.name,
    null::text as email,
    'no profile with role = owner exists for this clinic'::text as detail
  from public.clinics c
  where not exists (
    select 1 from public.profiles p where p.clinic_id = c.id and p.role = 'owner'
  )

  union all

  -- Auth users with no matching profiles row -- e.g. auth.admin.createUser() succeeded but the
  -- profile insert failed and compensation's deleteUser() call also failed.
  select
    'auth_user_without_profile'::text as kind,
    u.id,
    null::text as name,
    u.email::text,
    'auth.users row has no matching profiles row'::text as detail
  from auth.users u
  where not exists (
    select 1 from public.profiles p where p.id = u.id
  );
end;
$$;

revoke all on function public.find_orphaned_clinics() from public;
grant execute on function public.find_orphaned_clinics() to authenticated;
