-- Phase 11A: patient clinical profile (occupation/height/medical_history) moves onto the patient
-- master record so it's entered once and reused across visits, instead of being re-typed on every
-- prescription. A prescription must still carry a frozen SNAPSHOT of these values as of the day it
-- was written -- a prescription is a dated document, so editing a patient's history later must
-- never rewrite what a past prescription says. Three things, in one migration:
--
--   1. Add occupation/height/medical_history to patients, with medical_history defaulting to the
--      same canonical shape prescriptions.medical_history already uses (plus "allergies_detail",
--      new here) so every existing patient row backfills automatically.
--   2. A BEFORE INSERT trigger on prescriptions that fills occupation/height/medical_history from
--      the patient record ONLY when the incoming value is NULL -- the current prescription form
--      still passes real values today, so this is a no-op in practice until the consultation
--      screen (a later phase) starts passing NULL and relying on the patient master instead.
--   3. log_activity() wired onto patients (S1's audit-trigger pattern), since medical history and
--      allergies are clinical/safety data.
--
-- Rides along: closes the same branch/clinic-ownership gap on patients_insert/patients_update
-- that 20260821090700 closed on visits/patient_payments -- the owner arm of both predicates never
-- verified branch_id actually belongs to the clinic being written, so an owner could set
-- clinic_id correctly while branch_id silently pointed at another clinic's branch.

-- ---------------------------------------------------------------------------
-- 1. patients: clinical profile columns
-- ---------------------------------------------------------------------------
alter table public.patients
  add column occupation text,
  add column height text,
  add column medical_history jsonb not null default '{
    "diabetes": false, "hypertension": false, "thyroid": false, "asthma": false,
    "tuberculosis": false, "cardiac": false, "arthritis": false,
    "allergies": false, "allergies_detail": null,
    "other": false, "other_text": null
  }'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. prescriptions: fill-if-null snapshot trigger
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER (the default -- no "security definer" here): runs as the inserting user, whose
-- own patients_select RLS already lets them read the patient they're prescribing for (the same
-- clinic membership prescriptions_insert already requires). No privilege elevation needed, and
-- none of this table's data is otherwise off-limits to a caller who's allowed to insert here.
create or replace function public.prescriptions_snapshot_from_patient()
returns trigger
language plpgsql
as $$
declare
  v_patient public.patients%rowtype;
begin
  if new.occupation is null or new.height is null or new.medical_history is null then
    select * into v_patient from public.patients where id = new.patient_id;

    if new.occupation is null then
      new.occupation := v_patient.occupation;
    end if;
    if new.height is null then
      new.height := v_patient.height;
    end if;
    if new.medical_history is null then
      new.medical_history := v_patient.medical_history;
    end if;
  end if;

  return new;
end;
$$;

create trigger prescriptions_snapshot_from_patient
  before insert on public.prescriptions
  for each row execute function public.prescriptions_snapshot_from_patient();

-- ---------------------------------------------------------------------------
-- 3. patients: audit trail (S1 pattern -- same log_activity() used by visits, patient_payments,
--    prescriptions, medicines, clinics; CREATE OR REPLACE keeps it one shared function/signature,
--    just adds a 'patients' branch)
-- ---------------------------------------------------------------------------
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_action text;
  v_old jsonb;
  v_new jsonb;
  v_user_id uuid := auth.uid();
begin
  if TG_TABLE_NAME = 'visits' then
    v_entity_type := 'visit';
  elsif TG_TABLE_NAME = 'patient_payments' then
    v_entity_type := 'payment';
  elsif TG_TABLE_NAME = 'prescriptions' then
    v_entity_type := 'prescription';
  elsif TG_TABLE_NAME = 'medicines' then
    v_entity_type := 'medicine';
  elsif TG_TABLE_NAME = 'clinics' then
    v_entity_type := 'clinic';
  elsif TG_TABLE_NAME = 'patients' then
    v_entity_type := 'patient';
  else
    raise exception 'log_activity() attached to unexpected table %', TG_TABLE_NAME;
  end if;

  if TG_TABLE_NAME = 'clinics' then
    v_clinic_id := case when TG_OP = 'DELETE' then null else coalesce(new.id, old.id) end;
    v_entity_id := coalesce(new.id, old.id);
  else
    v_clinic_id := coalesce(new.clinic_id, old.clinic_id);
    v_entity_id := coalesce(new.id, old.id);
  end if;

  if TG_OP = 'INSERT' then
    v_action := v_entity_type || '_created';
    v_old := null;
    v_new := to_jsonb(new) - 'updated_at';
  elsif TG_OP = 'UPDATE' then
    v_action := v_entity_type || '_updated';
    v_old := to_jsonb(old) - 'updated_at';
    v_new := to_jsonb(new) - 'updated_at';
  else
    v_action := v_entity_type || '_deleted';
    v_old := to_jsonb(old) - 'updated_at';
    v_new := null;
  end if;

  insert into public.activity_log (clinic_id, user_id, action, entity_type, entity_id, meta)
  values (
    v_clinic_id,
    v_user_id,
    v_action,
    v_entity_type,
    v_entity_id,
    jsonb_build_object(
      'actor_type', case when v_user_id is null then 'system' else 'user' end,
      'old', v_old,
      'new', v_new
    )
  );

  return coalesce(new, old);
end;
$$;

create trigger log_activity
  after insert or update or delete on public.patients
  for each row execute function public.log_activity();

-- ---------------------------------------------------------------------------
-- 4. patients_insert / patients_update: close the branch-ownership gap (Phase 6A pattern, see
--    20260821090700's header for the full incident writeup -- same class of bug, same fix). Only
--    the non-super-admin branch gains the extra AND; owner/own-branch logic is otherwise
--    unchanged, and patients_select/patients_delete are untouched.
-- ---------------------------------------------------------------------------
drop policy patients_insert on public.patients;
drop policy patients_update on public.patients;

create policy patients_insert on public.patients
  for insert with check (
    public.is_super_admin()
    or (
      clinic_id = public.current_clinic_id()
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = public.current_clinic_id())
      and (public.current_user_role() = 'owner' or branch_id = public.current_branch_id())
    )
  );

create policy patients_update on public.patients
  for update
  using (
    public.is_super_admin()
    or (
      clinic_id = public.current_clinic_id()
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = public.current_clinic_id())
      and (public.current_user_role() = 'owner' or branch_id = public.current_branch_id())
    )
  )
  with check (
    public.is_super_admin()
    or (
      clinic_id = public.current_clinic_id()
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = public.current_clinic_id())
      and (public.current_user_role() = 'owner' or branch_id = public.current_branch_id())
    )
  );
