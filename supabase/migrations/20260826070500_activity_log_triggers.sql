-- Phase S1 Step 1: audit trail via triggers, not application code -- a trigger cannot be
-- bypassed by a future code path, a direct RPC, or a manual SQL statement the way logging from
-- clinic-api.ts only covers paths that exist today.
--
-- One shared function covers all five tables (visits, patient_payments, prescriptions,
-- medicines, clinics), branching on TG_TABLE_NAME/TG_OP. Design notes, each addressing a
-- specific requirement from the brief:
--
-- * SECURITY DEFINER with a pinned search_path, so the insert into activity_log runs as the
--   function owner (postgres, which bypasses RLS -- confirmed via pg_roles earlier this phase),
--   not as the invoking role. RLS on activity_log can structurally never block this write and
--   take the clinical operation down with it -- there's no exception-swallowing needed for that
--   specific risk, the security-definer model already guarantees it.
--
-- * Actor: auth.uid() when present; cron/service-role writes have none, so those are recorded
--   explicitly as actor_type: 'system' in meta rather than leaving user_id null and unexplained.
--   user_id itself stays null in that case -- it's an existing, nullable column (on delete set
--   null already), not a new one.
--
-- * updated_at is stripped from both old and new snapshots via the jsonb `-` operator -- every
--   update touches it and it carries no information.
--
-- * clinics has no large jsonb column or logo blob (checked: logo_url is a short text URL, not a
--   blob) -- the brief's exclusion was conditional ("if clinics already has..."), so nothing
--   needs excluding beyond updated_at for this table.
--
-- * entity_type uses the existing singular convention from the four pre-existing writers
--   ('profile', 'clinic') -- 'visit', 'payment', 'prescription', 'medicine', 'clinic' here.
--   action follows the same past-tense event style already in the log ('clinic_created',
--   'password_reset') -- '{entity}_created' / '{entity}_updated' / '{entity}_deleted'.
--
-- * clinics is structurally different from the other four: it has no clinic_id column, it IS the
--   clinic (id is the clinic's own id). And logging its DELETE is the one genuinely tricky case:
--   activity_log.clinic_id is ON DELETE CASCADE from clinics, so an AFTER DELETE trigger on
--   clinics inserting a row with clinic_id = OLD.id would violate that FK outright -- by the time
--   this AFTER trigger's INSERT runs, the clinics row is already gone within the same
--   transaction. Logging it with clinic_id = NEW.id (an update/insert) is fine since the clinic
--   still exists; the delete event specifically uses clinic_id = NULL (the column is nullable)
--   so the row survives independent of the now-gone clinic, with the deleted id preserved in
--   entity_id and the full old row preserved in meta. This also means the deletion record is
--   visible only to super_admin afterward (activity_log_select's owner branch requires
--   clinic_id = current_clinic_id(), which a null clinic_id never matches) -- correct, since the
--   clinic's own owner profile is gone too by that point.
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

revoke execute on function public.log_activity() from public;

create trigger log_activity
  after insert or update or delete on public.visits
  for each row execute function public.log_activity();

create trigger log_activity
  after insert or update or delete on public.patient_payments
  for each row execute function public.log_activity();

create trigger log_activity
  after insert or update or delete on public.prescriptions
  for each row execute function public.log_activity();

create trigger log_activity
  after insert or update or delete on public.medicines
  for each row execute function public.log_activity();

create trigger log_activity
  after insert or update or delete on public.clinics
  for each row execute function public.log_activity();
