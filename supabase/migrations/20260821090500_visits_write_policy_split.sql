-- Phase 6A additional step: split visits_write into INSERT/UPDATE/DELETE, tightening UPDATE and
-- DELETE to owner/super_admin only.
--
-- The single ALL policy this replaces let any branch-scoped receptionist UPDATE or DELETE a
-- visit, not just INSERT it (confirmed against the live policy in Step 0). That was already a
-- gap, but it becomes the weak point of the whole billing feature once total_billed derives from
-- visits.net_amount: a receptionist could change a visit's amount/discount or delete it outright
-- and silently change what a patient owes, with no audit trail -- while patient_payments in the
-- same phase is being locked down to append-only, owner/super_admin-only voiding. Confirmed via
-- grep before writing this: no "Edit visit" or "Delete visit" control exists anywhere in the
-- frontend today, so nothing that currently works can start silently no-op'ing under RLS.
--
-- visits_select is untouched, exactly as instructed.
drop policy visits_write on public.visits;

-- Unchanged scope from the old ALL policy -- a receptionist must still be able to record a visit.
create policy visits_insert on public.visits
  for insert with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  );

-- Owner/super_admin only. Both USING and WITH CHECK carry the same clinic-scoped, owner-only
-- predicate (no branch_id alternative) so an owner can update visits across every branch of their
-- own clinic, but can never move a visit into another clinic or branch via UPDATE.
create policy visits_update on public.visits
  for update
  using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  )
  with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

-- Same predicate as UPDATE -- owner/super_admin only.
create policy visits_delete on public.visits
  for delete using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );
