-- Edit-prescription feature: an UPDATE on prescriptions is now reachable from the client
-- (clinic-api.ts updatePrescription), so the columns that root a prescription's identity and
-- audit trail -- id, clinic_id, branch_id, patient_id, visit_id, created_by, created_at,
-- client_request_id -- need the same allowlist-style guard protect_clinic_billing_fields and
-- protect_profile_role_fields already use for clinics/profiles. Unlike those two, this does NOT
-- exempt is_super_admin(): the guarded fields are structural referential identity (which
-- clinic/branch/patient the row belongs to, who created it, when), not a platform-operator
-- override target -- moving a prescription across clinics/patients via UPDATE must never be
-- possible for anyone with a client session, so only service-role/Edge Function writes
-- (auth.uid() is null, same convention as the two existing protect_* triggers) bypass it.
create or replace function public.protect_prescription_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.id                is distinct from old.id
  or new.clinic_id         is distinct from old.clinic_id
  or new.branch_id         is distinct from old.branch_id
  or new.patient_id        is distinct from old.patient_id
  or new.visit_id          is distinct from old.visit_id
  or new.created_by        is distinct from old.created_by
  or new.created_at        is distinct from old.created_at
  or new.client_request_id is distinct from old.client_request_id
  then
    raise exception 'Cannot change clinic_id, branch_id, patient_id, visit_id, created_by, created_at, or client_request_id on a prescription';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_prescription_immutable_fields() from anon, authenticated, public;

create trigger trg_protect_prescription_immutable
  before update on public.prescriptions
  for each row execute function public.protect_prescription_immutable_fields();
