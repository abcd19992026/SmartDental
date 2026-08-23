-- Phase S1 Step B: owner-only deletion (Step A) restricts *who* can delete a patient, but
-- doesn't make it *safe* -- one click from an owner still destroyed payments and prescriptions.
-- Money received and clinical records are hard facts; a patient cannot be deleted while either
-- exists, by anyone, without dealing with that history first. visits/recalls/appointments stay
-- CASCADE (visits are meaningless without the patient and are reconstructable from activity_log
-- once Step 1 lands; recalls/appointments are operational scheduling, not records).
alter table public.patient_payments
  drop constraint patient_payments_patient_id_fkey,
  add constraint patient_payments_patient_id_fkey
    foreign key (patient_id) references public.patients(id) on delete restrict;

alter table public.prescriptions
  drop constraint prescriptions_patient_id_fkey,
  add constraint prescriptions_patient_id_fkey
    foreign key (patient_id) references public.patients(id) on delete restrict;

-- delete_clinic_cascade deleted patients first specifically to dodge branches' RESTRICT (see the
-- comment on the original migration). It now needs patient_payments and prescriptions cleared
-- for the clinic before that patients delete, or the new RESTRICT above aborts it. Everything
-- else in the function is unchanged.
create or replace function public.delete_clinic_cascade(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.patient_payments where clinic_id = p_clinic_id;
  delete from public.prescriptions where clinic_id = p_clinic_id;
  delete from public.patients where clinic_id = p_clinic_id;
  delete from public.branches where clinic_id = p_clinic_id;
  delete from public.clinics where id = p_clinic_id;
end;
$$;

revoke all on function public.delete_clinic_cascade(uuid) from public;
grant execute on function public.delete_clinic_cascade(uuid) to service_role;
