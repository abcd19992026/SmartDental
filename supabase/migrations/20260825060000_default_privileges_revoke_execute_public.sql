-- Root-cause fix for a recurring problem: three times now (most recently seed_default_medicines
-- in 8A) a new SECURITY DEFINER function has come out of its own CREATE FUNCTION with EXECUTE
-- granted to PUBLIC by Postgres's own default behavior, which anon/authenticated inherit from.
-- Revoking it after the fact each time treats the symptom, not the cause.
--
-- Confirmed before applying, not assumed:
--   1. ALTER DEFAULT PRIVILEGES only changes the template applied to objects created AFTER this
--      statement runs -- it is fundamentally incapable of touching any existing function's
--      current grants (that's the entire design point of the feature; there is no retroactive
--      mode). Verified empirically anyway in this phase's Step 7 by diffing an existing
--      function's ACL before and after.
--   2. Functions created by this project's migrations are owned by `postgres` (confirmed via
--      pg_get_userbyid(proowner) on several existing functions), and this migration itself runs
--      as current_user = postgres -- so naming that role below is correct, not a guess.
--
-- After this, every new RPC meant to be callable by authenticated/service_role needs an explicit
-- GRANT EXECUTE. That's the intended trade: a forgotten grant fails loudly (404 in testing); a
-- forgotten revoke fails silently (a security hole that only a grants audit catches).
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
