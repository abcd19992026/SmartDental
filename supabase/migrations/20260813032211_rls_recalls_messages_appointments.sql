alter table public.recalls enable row level security;
alter table public.message_log enable row level security;
alter table public.appointments enable row level security;

-- recalls, appointments: same branch-scoped pattern as patients/visits.
create policy recalls_select on public.recalls
  for select using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  );

create policy recalls_write on public.recalls
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

create policy appointments_select on public.appointments
  for select using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and (
      public.current_user_role() = 'owner' or branch_id = public.current_branch_id()
    ))
  );

create policy appointments_write on public.appointments
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

-- message_log: clinic-scoped READ ONLY for owner/receptionist. No insert/update/delete policy
-- for `authenticated` at all -- Edge Functions in later phases use the service role key, which
-- bypasses RLS entirely, so no write policy should exist for normal app roles.
create policy message_log_select on public.message_log
  for select using (public.is_super_admin() or clinic_id = public.current_clinic_id());
