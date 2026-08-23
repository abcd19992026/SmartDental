-- Phase S1 Step D: split the remaining single-ALL policies for consistency. All four are
-- already owner-only or super_admin-only -- no access is widened or narrowed here, these
-- predicates are copied verbatim per command, just as separate policy objects.

-- treatment_types
drop policy treatment_types_owner_write on public.treatment_types;

create policy treatment_types_insert on public.treatment_types
  for insert with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

create policy treatment_types_update on public.treatment_types
  for update
  using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  )
  with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

create policy treatment_types_delete on public.treatment_types
  for delete using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

-- whatsapp_templates
drop policy whatsapp_templates_owner_write on public.whatsapp_templates;

create policy whatsapp_templates_insert on public.whatsapp_templates
  for insert with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

create policy whatsapp_templates_update on public.whatsapp_templates
  for update
  using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  )
  with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

create policy whatsapp_templates_delete on public.whatsapp_templates
  for delete using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

-- clinics (clinics_select and clinics_owner_write are untouched -- only the super_admin ALL
-- policy is being split)
drop policy clinics_super_admin_all on public.clinics;

create policy clinics_super_admin_insert on public.clinics
  for insert with check (public.is_super_admin());

create policy clinics_super_admin_update on public.clinics
  for update using (public.is_super_admin()) with check (public.is_super_admin());

create policy clinics_super_admin_delete on public.clinics
  for delete using (public.is_super_admin());

-- payments (legacy platform billing): this table had exactly one policy total, no separate
-- select -- splitting into all four.
drop policy payments_super_admin_only on public.payments;

create policy payments_select on public.payments
  for select using (public.is_super_admin());

create policy payments_insert on public.payments
  for insert with check (public.is_super_admin());

create policy payments_update on public.payments
  for update using (public.is_super_admin()) with check (public.is_super_admin());

create policy payments_delete on public.payments
  for delete using (public.is_super_admin());
