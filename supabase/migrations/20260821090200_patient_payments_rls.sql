-- Phase 6A Step 3: RLS for patient_payments. Same predicate shape used throughout this codebase
-- (visits, recalls, etc.): is_super_admin() OR (clinic-scoped AND (owner OR own branch)).
--
-- No DELETE policy is written at all -- with RLS enabled and no DELETE policy present, every
-- DELETE from a non-superuser role is denied outright. This is not an oversight to revisit; it is
-- the enforcement mechanism itself, matching the append-only requirement.
alter table public.patient_payments enable row level security;

create policy patient_payments_select on public.patient_payments
  for select using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  );

-- WITH CHECK re-validates clinic_id/branch_id against the helper functions independently of
-- whatever the client sent -- a receptionist's insert cannot claim a clinic_id or branch_id other
-- than their own, even if the request body says otherwise.
create policy patient_payments_insert on public.patient_payments
  for insert with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  );

-- Owner and super_admin only -- a receptionist can record a payment (insert, above) but not void
-- one. This restricts WHO may update; the allowlist trigger from the previous migration restricts
-- WHAT they may change once they do.
create policy patient_payments_update on public.patient_payments
  for update
  using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  )
  with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );
