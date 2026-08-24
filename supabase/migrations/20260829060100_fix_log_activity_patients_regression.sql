-- Fixes a regression introduced by the immediately-preceding migration
-- (20260829060000_appointments_walkin_daysheet.sql): its CREATE OR REPLACE of log_activity() was
-- built from the Phase S1 baseline (visits/patient_payments/prescriptions/medicines/clinics) and
-- did not carry forward the 'patients' branch that Phase 11A had since added
-- (20260827090000_patient_clinical_profile.sql) -- silently dropping patients' audit trail and
-- turning every patients insert/update/delete into a hard failure (the function's own "attached
-- to unexpected table" exception), caught live while creating a verification fixture for this
-- phase. This migration restores 'patients' alongside the 'appointments' branch that was the
-- actual intended addition.
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
  elsif TG_TABLE_NAME = 'appointments' then
    v_entity_type := 'appointment';
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
