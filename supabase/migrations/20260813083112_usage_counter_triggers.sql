-- Monthly usage rollups for the platform dashboard (get_platform_overview reads clinic_usage
-- directly). These must be SECURITY DEFINER: clinic_usage is super-admin-only under RLS (see
-- rls_billing.sql), and the receptionist/owner session that inserts a patient or recall has no
-- write access to it at all under their own privileges. Table ownership lets the DEFINER body
-- write here despite that, same rationale as the auth-helper functions in Phase 1.
create or replace function public.increment_patients_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.clinic_usage (clinic_id, month, patients_added)
  values (new.clinic_id, date_trunc('month', current_date)::date, 1)
  on conflict (clinic_id, month)
  do update set patients_added = public.clinic_usage.patients_added + 1;
  return new;
end;
$$;

create or replace function public.increment_recalls_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.clinic_usage (clinic_id, month, recalls_created)
  values (new.clinic_id, date_trunc('month', current_date)::date, 1)
  on conflict (clinic_id, month)
  do update set recalls_created = public.clinic_usage.recalls_created + 1;
  return new;
end;
$$;

create trigger trg_increment_patients_added
  after insert on public.patients
  for each row execute function public.increment_patients_added();

create trigger trg_increment_recalls_created
  after insert on public.recalls
  for each row execute function public.increment_recalls_created();

-- Trigger functions are invoked by the trigger manager, not called directly by client SQL (and
-- their `trigger` return type makes a direct `select` on them fail regardless) -- but revoke
-- execute from every client-facing role anyway, as explicit defense in depth rather than relying
-- on that incidental protection.
revoke all on function public.increment_patients_added() from public, anon, authenticated;
revoke all on function public.increment_recalls_created() from public, anon, authenticated;
