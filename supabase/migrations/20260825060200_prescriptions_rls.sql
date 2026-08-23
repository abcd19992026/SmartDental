-- Phase 9A Step 3: RLS for prescriptions. Four separate policies, not one ALL -- the single-ALL
-- pattern is what left visits writable by receptionists until 6A caught it.
--
-- WITH CHECK on insert/update validates clinic_id against current_clinic_id() AND independently
-- confirms branch_id actually belongs to that clinic via an exists() against branches. This is
-- the exact hole 6A found live (fix migration 20260821090700): an owner's predicate only checked
-- clinic_id, letting branch_id silently point at a completely different clinic's branch while
-- clinic_id stayed correct. Built in from the start here rather than patched after the fact.
alter table public.prescriptions enable row level security;

-- Any clinic member; branch-scoped for a receptionist (matches visits_select's shape) -- a
-- receptionist needs this to reprint a slip for a patient in their own branch.
create policy prescriptions_select on public.prescriptions
  for select using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  );

-- Owner/super_admin only -- diagnosis and prescribing are the dentist's, not the front desk's.
create policy prescriptions_insert on public.prescriptions
  for insert with check (
    public.is_super_admin()
    or (
      clinic_id = public.current_clinic_id()
      and public.current_user_role() = 'owner'
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = clinic_id)
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
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = clinic_id)
    )
  );

create policy prescriptions_delete on public.prescriptions
  for delete using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );
