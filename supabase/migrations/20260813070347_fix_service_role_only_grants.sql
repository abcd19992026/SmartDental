-- SECURITY FIX. Every "grant execute ... to service_role" in the Phase 2A migrations was
-- silently ineffective at actually restricting the function: this project's default privileges
-- (`select * from pg_default_acl where nspname = 'public'`) auto-grant EXECUTE on every new
-- function to anon, authenticated, AND service_role at CREATE FUNCTION time, for functions
-- created by the `postgres` role (which every migration runs as). `revoke all ... from public`
-- only revokes the PUBLIC pseudo-role's privilege; it does nothing to these separate, explicit
-- per-role default grants. The result: create_clinic_with_branches and delete_clinic_cascade --
-- both SECURITY DEFINER with no internal authorization check of their own, by design, since
-- they trust their caller is the create-clinic Edge Function running as service_role -- were
-- actually callable directly by ANY authenticated user, and even by anon (unauthenticated
-- requests using only the public anon key). Confirmed live: a signed-in clinic owner could call
-- delete_clinic_cascade(<any clinic id>) directly via supabase.rpc() and delete any clinic on
-- the platform, completely bypassing RLS and the Edge Function's authorization chain.
--
-- The fix is to revoke from the specific roles the default privilege actually granted to, not
-- from PUBLIC.

revoke execute on function public.create_clinic_with_branches(jsonb, jsonb) from anon, authenticated, public;
revoke execute on function public.delete_clinic_cascade(uuid) from anon, authenticated, public;

-- Not part of the original vulnerability report (seed_default_treatment_types has no internal
-- authorization check either, but doesn't destroy data) -- tightened for the same reason and
-- because it's now only ever called by the create-clinic Edge Function's service-role client,
-- not directly from the frontend as Phase 1 anticipated when it was first granted to
-- authenticated.
revoke execute on function public.seed_default_treatment_types(uuid) from anon, authenticated, public;

-- Defense in depth: get_platform_overview / get_clinics_list / find_orphaned_clinics all guard
-- themselves internally with an explicit is_super_admin() check (SECURITY DEFINER bypasses RLS,
-- so that check is the only thing protecting them), so anon having EXECUTE was never a data
-- leak -- anon has no auth.uid(), so is_super_admin() correctly returns false and the call
-- raises. Revoking anyway: there's no legitimate reason for a fully unauthenticated caller to
-- even attempt these, and it removes any dependency on that internal check being the only line
-- of defense.
revoke execute on function public.get_platform_overview() from anon;
revoke execute on function public.get_clinics_list() from anon;
revoke execute on function public.find_orphaned_clinics() from anon;

-- Prevents this class of bug recurring silently in future migrations: without this, every new
-- SECURITY DEFINER function created by a migration (which always runs as `postgres`) is
-- auto-granted EXECUTE to anon and authenticated by the project's existing default privileges,
-- regardless of any `revoke all ... from public` in the same file. Functions that should be
-- reachable by `authenticated` (or, in principle, `anon`) now need an explicit
-- `grant execute ... to authenticated` in their own migration -- the same discipline
-- current_clinic_id() and friends already followed in Phase 1, now enforced by default instead
-- of by convention. service_role keeps its automatic grant; it's the trusted, service-side
-- caller and restricting it further would break every Edge Function.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
