-- Phase S1 Step C: no DELETE policy on profiles at all -- deactivation via admin-set-user-active
-- is the only legitimate "remove a staff member" path (keeps every created_by/user_id reference
-- across visits/patient_payments/prescriptions/activity_log pointing at a real name). Splits
-- profiles_owner_write (ALL) into insert/update only; select policies (profiles_select_self,
-- profiles_select_same_clinic) and profiles_self_update_avatar are untouched.
--
-- Verified safe before writing this migration, not assumed:
--   1. create-staff-user's ORPHAN_CLEANUP_REQUIRED compensation path calls
--      serviceClient.auth.admin.deleteUser() when the profile insert fails -- that GoTrue Admin
--      API call never touches a profiles row via SQL DELETE in that branch (the insert failed,
--      so no profiles row exists to begin with), so it was never gated by this policy. Proved
--      live against the deployed function with a temporary trigger forcing the profile insert to
--      fail: response was `{"compensation":{"auth_user_deleted":true}}`, confirmed at the DB
--      level -- zero orphaned auth.users or profiles rows left afterward.
--   2. The deeper question -- does deleting an auth.users row (e.g. via the Supabase dashboard,
--      which runs as supabase_auth_admin, confirmed via pg_roles to NOT have bypassrls) still
--      cleanly cascade into profiles (profiles.id references auth.users(id) on delete cascade)
--      with zero DELETE policy present? Tested the general Postgres mechanism directly: an FK
--      cascade delete into a table with RLS enabled and literally zero policies, executed by a
--      non-bypassrls role, still succeeded. Referential-integrity cascade actions are not subject
--      to row security in Postgres -- this is a documented guarantee, and it was proved here
--      rather than assumed. The escape hatch for a genuinely orphaned auth.users row (no
--      matching profile, e.g. if the compensation call itself also failed) is the Supabase
--      dashboard's Authentication > Users delete, or a direct SQL delete from auth.users as
--      postgres -- both operate on auth.users directly and were never gated by this policy.
drop policy profiles_owner_write on public.profiles;

create policy profiles_owner_insert on public.profiles
  for insert with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

create policy profiles_owner_update on public.profiles
  for update
  using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  )
  with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );
