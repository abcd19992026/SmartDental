alter table public.patients enable row level security;
alter table public.visits enable row level security;

-- Branch-scoped: receptionist reads/writes only their own branch; owner reads/writes all
-- branches in their clinic; super_admin bypasses everything.
create policy patients_select on public.patients
  for select using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  );

create policy patients_write on public.patients
  for all using (
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

create policy visits_select on public.visits
  for select using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  );

create policy visits_write on public.visits
  for all using (
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
