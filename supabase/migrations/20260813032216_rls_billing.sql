alter table public.payments enable row level security;
alter table public.clinic_usage enable row level security;

-- payments: super_admin only, no carve-out. An owner must never see this table.
create policy payments_super_admin_only on public.payments
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- clinic_usage: owners may read their own clinic's usage rows (needed for a "X of Y messages
-- used this month" display on the clinic dashboard); all writes stay super_admin-exclusive
-- (the daily send job writes via the service role key, which bypasses RLS anyway).
create policy clinic_usage_select on public.clinic_usage
  for select using (public.is_super_admin() or clinic_id = public.current_clinic_id());

create policy clinic_usage_super_admin_insert on public.clinic_usage
  for insert with check (public.is_super_admin());

create policy clinic_usage_super_admin_update on public.clinic_usage
  for update using (public.is_super_admin()) with check (public.is_super_admin());

create policy clinic_usage_super_admin_delete on public.clinic_usage
  for delete using (public.is_super_admin());
