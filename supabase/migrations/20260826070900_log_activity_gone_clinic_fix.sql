-- Fixes the general form of the bug in 20260826070800: it's not just medicines, and not just
-- delete_clinic_cascade. ANY of visits/patient_payments/prescriptions/medicines has clinic_id
-- CASCADE directly from clinics (not only through patients) -- so a super_admin's raw
-- `delete from clinics where id = X` (via clinics_super_admin_delete, no RPC involved) cascades
-- to all four simultaneously, each firing log_activity, each trying to insert into activity_log
-- referencing a clinic_id that -- by the time that cascaded child delete's trigger runs -- is
-- already gone from the clinics table within the same statement. The medicines pre-clear in
-- 20260826070800 only closed this for the RPC path; this closes it for every path, including one
-- I can't pre-order around because it doesn't go through delete_clinic_cascade at all.
--
-- Fix: on DELETE for the four non-clinics tables, if the referenced clinic no longer exists
-- (checked directly, not assumed), log with clinic_id = null instead -- same reasoning as the
-- clinics table's own delete event already uses. A normal single-row delete (clinic very much
-- still exists) is unaffected; only a delete that's part of a whole-clinic teardown falls into
-- this branch, and that's exactly the case where a null clinic_id (rather than a crashed
-- transaction) is correct.
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
  else
    raise exception 'log_activity() attached to unexpected table %', TG_TABLE_NAME;
  end if;

  if TG_TABLE_NAME = 'clinics' then
    v_clinic_id := case when TG_OP = 'DELETE' then null else coalesce(new.id, old.id) end;
    v_entity_id := coalesce(new.id, old.id);
  else
    v_clinic_id := coalesce(new.clinic_id, old.clinic_id);
    v_entity_id := coalesce(new.id, old.id);

    if TG_OP = 'DELETE' and v_clinic_id is not null
       and not exists (select 1 from public.clinics c where c.id = v_clinic_id)
    then
      v_clinic_id := null;
    end if;
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
