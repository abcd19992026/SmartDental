alter table public.treatment_types enable row level security;
alter table public.whatsapp_templates enable row level security;

create policy treatment_types_select on public.treatment_types
  for select using (public.is_super_admin() or clinic_id = public.current_clinic_id());

create policy treatment_types_owner_write on public.treatment_types
  for all using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  )
  with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

create policy whatsapp_templates_select on public.whatsapp_templates
  for select using (public.is_super_admin() or clinic_id = public.current_clinic_id());

create policy whatsapp_templates_owner_write on public.whatsapp_templates
  for all using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  )
  with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );
