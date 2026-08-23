-- Phase 8A Step 2: RLS for medicines. Deliberately split into one policy per command rather than
-- a single ALL policy -- treatment_types itself uses one ALL policy for its writes, but that's
-- exactly the pattern that left visits writable by receptionists until 6A caught it. Splitting
-- here means adding a new command later (there isn't one planned, but if there were) can't
-- silently inherit a predicate that was only ever intended for a different command.
--
-- No branch_id on this table at all (matches treatment_types) -- medicines is clinic-wide, not
-- branch-scoped, so there's no branch-ownership check needed here the way visits/patient_payments
-- needed one in 6A.
alter table public.medicines enable row level security;

-- Any authenticated member of the clinic, owner or receptionist -- a receptionist may need to
-- read a prescription that references a medicine.
create policy medicines_select on public.medicines
  for select using (
    public.is_super_admin() or clinic_id = public.current_clinic_id()
  );

-- Owner/super_admin only -- Settings is the doctor's area, confirmed in Step 0 as genuinely
-- RLS-enforced for treatment_types, not just UI-hidden. WITH CHECK validates clinic_id against
-- current_clinic_id() independently of whatever the client sends.
create policy medicines_insert on public.medicines
  for insert with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

create policy medicines_update on public.medicines
  for update
  using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  )
  with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

create policy medicines_delete on public.medicines
  for delete using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );
