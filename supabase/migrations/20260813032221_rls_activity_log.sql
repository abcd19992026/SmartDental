alter table public.activity_log enable row level security;

-- Owners get an audit trail for their clinic; receptionists don't. No client insert policy --
-- writes come from a service-role/trigger source in a later phase.
create policy activity_log_select on public.activity_log
  for select using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );
