-- Phase S1 Step D/Step 6: grant sweep.
--
-- Trigger-return functions with a stray PUBLIC grant: proved live (throwaway table, real
-- set_updated_at() function, EXECUTE revoked from PUBLIC first, then fired via an UPDATE run as
-- a non-bypassrls role) that revoking EXECUTE FROM PUBLIC does not break a trigger -- Postgres
-- checks function-call privilege at CREATE TRIGGER time (implicitly, via the creating role's own
-- rights), not at fire time. Safe to revoke on all five. set_updated_at was already revoked as
-- part of that same proof; the other four are revoked here.
revoke execute on function public.set_updated_at() from public;
revoke execute on function public.delete_pending_recall_on_visit_delete() from public;
revoke execute on function public.protect_clinic_billing_fields() from public;
revoke execute on function public.protect_patient_payments_immutable_fields() from public;
revoke execute on function public.protect_profile_role_fields() from public;

-- create_visit_with_recall: SECURITY INVOKER (RLS already applies to the caller, so this was
-- never a privilege-escalation risk), but there's no reason anon should be able to invoke it at
-- all. Revoke PUBLIC, grant to authenticated only -- matches how every other client-callable RPC
-- in this project is scoped.
revoke execute on function public.create_visit_with_recall(
  uuid, uuid, date, text, text, numeric, date, numeric, integer[]
) from public;
grant execute on function public.create_visit_with_recall(
  uuid, uuid, date, text, text, numeric, date, numeric, integer[]
) to authenticated;
