-- Fixes a real bug caught live in Step 7 verification: delete_clinic_cascade explicitly clears
-- patient_payments and prescriptions before deleting patients/clinics (needed to route around
-- their RESTRICT on patient_id, added in Step B) but never explicitly cleared medicines. Medicines
-- has no RESTRICT (clinic_id CASCADEs directly), so it was never a constraint problem before --
-- but medicines gained a log_activity AFTER DELETE trigger in Step 1, and a leftover medicines
-- row's FK-CASCADE-triggered delete (fired as a side effect of `delete from clinics`) tries to
-- insert into activity_log referencing clinic_id = the clinic being deleted -- which is already
-- gone from the clinics table within that same statement, violating activity_log's FK. Same class
-- of problem as the clinics table's own delete event (handled with clinic_id = null in Step 1),
-- but this one is fixed by ordering instead: clear medicines explicitly, before the cascade ever
-- has a chance to fire mid-statement.
create or replace function public.delete_clinic_cascade(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.patient_payments where clinic_id = p_clinic_id;
  delete from public.prescriptions where clinic_id = p_clinic_id;
  delete from public.medicines where clinic_id = p_clinic_id;
  delete from public.patients where clinic_id = p_clinic_id;
  delete from public.branches where clinic_id = p_clinic_id;
  delete from public.clinics where id = p_clinic_id;
end;
$$;

revoke all on function public.delete_clinic_cascade(uuid) from public;
grant execute on function public.delete_clinic_cascade(uuid) to service_role;
