-- Phase 14A: appointments becomes the backing table for the Today screen's walk-in day-sheet
-- (receptionist adds a walk-in, doctor works the queue, one click into a consultation), on top of
-- its pre-existing recall-appointment use. Table has 0 rows in production, so the CHECK widen and
-- new columns are free.

-- ---------------------------------------------------------------------------
-- Task 1: new columns + widened status CHECK
-- ---------------------------------------------------------------------------

-- Nullable -- set once a visit is actually recorded from this appointment (Task 5's
-- set-visit-id function, wired from ConsultationPage in a later phase, not this one).
alter table public.appointments add column visit_id uuid references public.visits(id) on delete set null;

-- checked_in_at: what "today's list, in order" sorts by. Set at walk-in creation time (Task 3)
-- and, per the brief, also meant to be set whenever status moves to 'waiting' generally -- but
-- with only one write path today (the walk-in insert itself), there is no separate "mark as
-- waiting" transition yet to attach a second write to. Left nullable so old-style
-- scheduled/completed/no_show/cancelled rows (recall-driven, never checked in) are unaffected.
alter table public.appointments add column checked_in_at timestamptz;

-- Existing values kept (recall-driven appointments, if any exist elsewhere in the product, may
-- still use them) -- waiting/in_chair/done added alongside for the walk-in day-sheet.
alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status = any (array[
    'scheduled', 'completed', 'no_show', 'cancelled',
    'waiting', 'in_chair', 'done'
  ]));

-- ---------------------------------------------------------------------------
-- Task 2: branch-ownership + patient-ownership hardening (the fix S2 deferred for this table)
-- ---------------------------------------------------------------------------

drop policy appointments_insert on public.appointments;
drop policy appointments_update on public.appointments;

create policy appointments_insert on public.appointments
  for insert with check (
    public.is_super_admin()
    or (
      clinic_id = public.current_clinic_id()
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = public.current_clinic_id())
      and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = public.current_clinic_id())
      and (public.current_user_role() = 'owner' or branch_id = public.current_branch_id())
    )
  );

-- using (read side of the update) is left exactly as it was -- owner-or-own-branch, no EXISTS
-- guard -- matching the brief's "keep all other existing logic unchanged". The EXISTS guard is
-- added only to with_check, same asymmetry as visits_update/prescriptions_update: it constrains
-- what branch_id a row may be moved *to*, not which rows are visible to update.
create policy appointments_update on public.appointments
  for update
  using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  )
  with check (
    public.is_super_admin()
    or (
      clinic_id = public.current_clinic_id()
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = public.current_clinic_id())
      and (public.current_user_role() = 'owner' or branch_id = public.current_branch_id())
    )
  );

-- ---------------------------------------------------------------------------
-- Task 6: audit trail. log_activity() already exists (SECURITY DEFINER, search_path pinned,
-- EXECUTE revoked from PUBLIC) -- extending its TG_TABLE_NAME branch rather than writing a new
-- function, same as every table added to it so far.
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

-- CREATE OR REPLACE keeps the existing object's ACL (function identity/oid is unchanged) -- the
-- prior migration's `revoke execute on function public.log_activity() from public` still holds,
-- reconfirmed in verification step 8 rather than re-run here.

create trigger log_activity
  after insert or update or delete on public.appointments
  for each row execute function public.log_activity();
