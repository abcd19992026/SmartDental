-- Fixes a real cross-tenant data-integrity gap found live while running Phase 6A's Step 8
-- verification (item 15b), not theoretical: an owner could set clinic_id to their own clinic
-- while setting branch_id to a BRANCH BELONGING TO A COMPLETELY DIFFERENT CLINIC, on
-- visits_insert, visits_update, and patient_payments_insert. Confirmed live before this fix --
-- owner X successfully inserted/updated rows with clinic_id = Clinic X but branch_id pointing at
-- Clinic Y's branch, producing a genuinely inconsistent row (clinic_id and branch_id disagreeing
-- about which clinic the row belongs to), not just a permissions gap.
--
-- Root cause: every affected predicate's "owner" arm (`current_user_role() = 'owner'`) bypasses
-- the `branch_id = current_branch_id()` check entirely, and nothing else ever validated that
-- branch_id actually belongs to clinic_id. The receptionist arm was never vulnerable to this --
-- current_branch_id() only ever returns a branch that already belongs to that receptionist's own
-- clinic (branch/clinic consistency is enforced at profile-creation time in create-staff-user) --
-- so this fix only needed to close the owner arm, but is written as a universal check (applies
-- regardless of which arm of the OR is taken) since that's simpler to reason about than a
-- conditional check, and costs nothing extra for the already-safe receptionist path.
--
-- patient_payments_update does not need this: its allowlist trigger already blocks ANY change to
-- branch_id (or clinic_id) outright for a non-super-admin, so this class of bug was never
-- reachable through UPDATE on that table.
drop policy visits_insert on public.visits;
drop policy visits_update on public.visits;
drop policy patient_payments_insert on public.patient_payments;

create policy visits_insert on public.visits
  for insert with check (
    public.is_super_admin()
    or (
      clinic_id = public.current_clinic_id()
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = clinic_id)
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
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = clinic_id)
    )
  );

create policy patient_payments_insert on public.patient_payments
  for insert with check (
    public.is_super_admin()
    or (
      clinic_id = public.current_clinic_id()
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = clinic_id)
      and (public.current_user_role() = 'owner' or branch_id = public.current_branch_id())
    )
  );
