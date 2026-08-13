alter table public.clinics enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;

-- clinics: super_admin sees/writes everything; owner/receptionist can read only their own
-- clinic row and (as owner) update it. The owner-write policy below is deliberately broad
-- (name/address/logo edits) -- it also technically permits writing billing/subscription
-- columns, which is closed by a trigger in protect_sensitive_fields.sql, not by RLS (RLS
-- can't restrict which columns a policy covers, and column-level GRANT doesn't work here
-- since super_admin and owner both authenticate as the `authenticated` Postgres role).
create policy clinics_select on public.clinics
  for select using (public.is_super_admin() or id = public.current_clinic_id());

create policy clinics_super_admin_all on public.clinics
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy clinics_owner_write on public.clinics
  for update using (id = public.current_clinic_id() and public.current_user_role() = 'owner')
  with check (id = public.current_clinic_id() and public.current_user_role() = 'owner');

-- branches: clinic-scoped read for owner/receptionist; write only by owner (or super_admin).
create policy branches_select on public.branches
  for select using (public.is_super_admin() or clinic_id = public.current_clinic_id());

create policy branches_owner_write on public.branches
  for all using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  )
  with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

-- profiles: a user can always see their own row (profiles_select_self); owner/receptionist can
-- see everyone in their clinic; super_admin sees everyone. Multiple permissive select policies
-- are OR'd by Postgres, so both apply together. Owner write is clinic-scoped; the fact that it
-- would also let an owner edit their own role/clinic_id is closed by a trigger in
-- protect_sensitive_fields.sql, not by RLS.
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

create policy profiles_select_same_clinic on public.profiles
  for select using (public.is_super_admin() or clinic_id = public.current_clinic_id());

create policy profiles_owner_write on public.profiles
  for all using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  )
  with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );
