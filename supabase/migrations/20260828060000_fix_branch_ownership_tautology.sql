-- Phase S2: the branch-ownership guard added in Phase 6A (and copied into Phase 9A's
-- prescriptions policies) shipped with a tautology -- every affected EXISTS subquery reads
--   exists (select 1 from public.branches b where b.id = <table>.branch_id and b.clinic_id = b.clinic_id)
-- i.e. "b.clinic_id = b.clinic_id", a column compared to itself, always true for any row that
-- exists at all. It was meant to read "b.clinic_id = current_clinic_id()". The bug made the
-- branch-ownership check a complete no-op on visits_insert, visits_update, patient_payments_insert,
-- prescriptions_insert and prescriptions_update: an owner could set clinic_id to their own clinic
-- while branch_id silently pointed at ANY other clinic's branch, exactly the hole 6A believed it
-- had closed. patients_insert/patients_update (Phase 11A) already use the correct
-- `b.clinic_id = current_clinic_id()` form and are untouched here. appointments is untouched --
-- its policies are being rebuilt in the upcoming day-sheet phase.
--
-- Rides along: none of the three INSERT policies above ever verified patient_id belongs to the
-- current clinic either -- only branch_id was (meant to be) checked. Adding
--   exists (select 1 from public.patients p where p.id = <table>.patient_id and p.clinic_id = current_clinic_id())
-- into the same non-super-admin branch closes that gap too, as defense in depth alongside the
-- corrected branch check. UPDATE policies are left alone here -- patient_id is not expected to
-- change on update, so there is no new write path to guard.
--
-- Every predicate below is a straight copy of the live one (confirmed via pg_policies before
-- writing this migration) with only the two changes described -- no role/owner/branch logic is
-- altered, no policy is widened.

-- ---------------------------------------------------------------------------
-- visits_insert / visits_update
-- ---------------------------------------------------------------------------
drop policy visits_insert on public.visits;
drop policy visits_update on public.visits;

create policy visits_insert on public.visits
  for insert with check (
    public.is_super_admin()
    or (
      clinic_id = public.current_clinic_id()
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = public.current_clinic_id())
      and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = public.current_clinic_id())
      and (public.current_user_role() = 'owner' or branch_id = public.current_branch_id())
    )
  );

create policy visits_update on public.visits
  for update
  using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  )
  with check (
    public.is_super_admin()
    or (
      clinic_id = public.current_clinic_id()
      and public.current_user_role() = 'owner'
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = public.current_clinic_id())
    )
  );

-- ---------------------------------------------------------------------------
-- patient_payments_insert (patient_payments_update has no branch/patient EXISTS check to begin
-- with -- its allowlist trigger already blocks any change to branch_id/clinic_id outright for a
-- non-super-admin, per the Phase 6A migration's own note -- so it is untouched here)
-- ---------------------------------------------------------------------------
drop policy patient_payments_insert on public.patient_payments;

create policy patient_payments_insert on public.patient_payments
  for insert with check (
    public.is_super_admin()
    or (
      clinic_id = public.current_clinic_id()
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = public.current_clinic_id())
      and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = public.current_clinic_id())
      and (public.current_user_role() = 'owner' or branch_id = public.current_branch_id())
    )
  );

-- ---------------------------------------------------------------------------
-- prescriptions_insert / prescriptions_update
-- ---------------------------------------------------------------------------
drop policy prescriptions_insert on public.prescriptions;
drop policy prescriptions_update on public.prescriptions;

create policy prescriptions_insert on public.prescriptions
  for insert with check (
    public.is_super_admin()
    or (
      clinic_id = public.current_clinic_id()
      and public.current_user_role() = 'owner'
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = public.current_clinic_id())
      and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = public.current_clinic_id())
    )
  );

create policy prescriptions_update on public.prescriptions
  for update
  using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  )
  with check (
    public.is_super_admin()
    or (
      clinic_id = public.current_clinic_id()
      and public.current_user_role() = 'owner'
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = public.current_clinic_id())
    )
  );

-- ---------------------------------------------------------------------------
-- prescriptions_snapshot_from_patient(): stays SECURITY INVOKER (the default -- this CREATE OR
-- REPLACE does not add "security definer"). INVOKER is load-bearing, not incidental: it's what
-- makes the fill-if-null read of public.patients run under the INSERTING user's own RLS, so a
-- cross-clinic patient_id (which the new patient-ownership check above now blocks before this
-- trigger even runs, but defense in depth matters here too) can never leak another clinic's
-- medical history into a prescription via a definer-elevated read. Adding
-- "set search_path = pg_catalog, public" for the same search-path-hijack hardening every other
-- function in this project already has -- safe here since every reference inside the body
-- (public.patients) is already schema-qualified, so this changes nothing about what the function
-- resolves. REVOKE EXECUTE FROM PUBLIC for consistency with log_activity(), even though it's
-- moot in practice: a trigger function's RETURNS TYPE is "trigger", so Postgres refuses to let
-- anyone call it directly outside a trigger context regardless of its ACL.
create or replace function public.prescriptions_snapshot_from_patient()
returns trigger
language plpgsql
set search_path = pg_catalog, public
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

revoke execute on function public.prescriptions_snapshot_from_patient() from public;
