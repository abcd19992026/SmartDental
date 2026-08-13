-- Compensation function for a failed onboarding: removes a clinic and all its child rows.
-- Used only for rollback -- the create-clinic Edge Function calls this when a step after clinic
-- creation fails. Execute is granted to service_role only.
--
-- patients.branch_id / visits.branch_id / recalls.branch_id / appointments.branch_id are all
-- ON DELETE RESTRICT against branches (see patient_tables.sql / recall_tables.sql), while both
-- patients and branches are independently ON DELETE CASCADE from clinics.id. A plain
-- `delete from clinics` would let Postgres fire those two cascade paths in an unspecified
-- order, and if branches is processed before patients the RESTRICT constraint aborts the
-- delete entirely. Patients are removed explicitly first (which itself cascades to visits,
-- recalls, and appointments -- all ON DELETE CASCADE from patients.id), then branches, so the
-- restrict constraint is never live by the time branches or clinics are removed. Everything
-- else (profiles, treatment_types, whatsapp_templates, payments, clinic_usage, message_log,
-- activity_log) cascades cleanly from the final clinics delete with no ordering hazard.
create or replace function public.delete_clinic_cascade(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.patients where clinic_id = p_clinic_id;
  delete from public.branches where clinic_id = p_clinic_id;
  delete from public.clinics where id = p_clinic_id;
end;
$$;

revoke all on function public.delete_clinic_cascade(uuid) from public;
grant execute on function public.delete_clinic_cascade(uuid) to service_role;
