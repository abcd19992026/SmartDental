-- S3: three functions missed by the 20260826070400_grant_sweep pass.
--
-- 1) set_updated_at, protect_clinic_billing_fields, protect_profile_role_fields still carried
--    EXECUTE for anon + authenticated. S1 established that revoking EXECUTE from trigger
--    functions is safe: Postgres checks EXECUTE at CREATE TRIGGER time, not at fire time.
--    Leaving them granted exposed them as callable RPC endpoints (/rest/v1/rpc/...).
--    Verified after applying: an UPDATE on patients still bumped updated_at, so the
--    set_updated_at trigger fires normally with no EXECUTE grant.
--
-- 2) set_updated_at and increment_clinic_messages_sent had no pinned search_path.
--    Note the real signature is (uuid, date, integer) -- not (uuid, integer).

revoke execute on function public.set_updated_at() from anon, authenticated, public;
revoke execute on function public.protect_clinic_billing_fields() from anon, authenticated, public;
revoke execute on function public.protect_profile_role_fields() from anon, authenticated, public;

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.increment_clinic_messages_sent(uuid, date, integer) set search_path = public, pg_temp;
