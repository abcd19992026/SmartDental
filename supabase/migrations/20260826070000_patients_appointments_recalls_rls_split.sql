-- Phase S1 Step A: close the live patients-deletion hole first, as its own migration, ahead
-- of the rest of S1. The audit (Step 0) found patients_write, appointments_write and
-- recalls_write are single ALL policies with the same predicate:
--   is_super_admin() OR (clinic_id = current_clinic_id() AND (role = 'owner' OR branch_id = current_branch_id()))
-- which lets a receptionist DELETE, not just write, in their own branch. For patients this
-- cascades through visits/payments/prescriptions/recalls/appointments -- on a Free-plan project
-- with no backups, this is a live, un-audited, total-loss hole reachable directly against
-- PostgREST regardless of what the UI exposes.
--
-- SELECT/INSERT/UPDATE keep the exact original predicate -- receptionists still add patients,
-- edit them, and action recalls/appointments in their own branch; nothing about that changes.
-- DELETE is split out and narrowed to owner/super_admin only, no branch clause -- matching
-- visits_delete and prescriptions_delete exactly.

-- patients
-- patients_select already exists as its own policy (confirmed in Step 0's audit dump) --
-- only patients_write (ALL) is being split here, into insert/update/delete.
drop policy patients_write on public.patients;

create policy patients_insert on public.patients
  for insert with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  );

create policy patients_update on public.patients
  for update
  using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  )
  with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  );

create policy patients_delete on public.patients
  for delete using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

-- appointments
drop policy appointments_write on public.appointments;

create policy appointments_insert on public.appointments
  for insert with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  );

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
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  );

create policy appointments_delete on public.appointments
  for delete using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

-- recalls
drop policy recalls_write on public.recalls;

create policy recalls_insert on public.recalls
  for insert with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  );

create policy recalls_update on public.recalls
  for update
  using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  )
  with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  );

create policy recalls_delete on public.recalls
  for delete using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );
