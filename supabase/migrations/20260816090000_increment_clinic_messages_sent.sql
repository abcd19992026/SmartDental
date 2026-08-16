-- Atomic upsert for clinic_usage.messages_sent, called by the send-recall-messages Edge Function
-- (service role) once per successful send. A read-then-write from the function itself would race
-- across concurrent invocations; a single UPSERT statement doesn't. Same shape as
-- increment_patients_added / increment_recalls_created in usage_counter_triggers.sql, but this
-- one isn't a trigger -- it's called directly by the Edge Function, which already holds the
-- service role (bypasses RLS on its own), so it doesn't need SECURITY DEFINER.
create or replace function public.increment_clinic_messages_sent(p_clinic_id uuid, p_month date, p_count integer default 1)
returns void
language sql
as $$
  insert into public.clinic_usage (clinic_id, month, messages_sent)
  values (p_clinic_id, p_month, p_count)
  on conflict (clinic_id, month)
  do update set messages_sent = public.clinic_usage.messages_sent + excluded.messages_sent;
$$;

revoke all on function public.increment_clinic_messages_sent(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.increment_clinic_messages_sent(uuid, date, integer) to service_role;
