-- Reusable seed function, not invoked by this migration -- Phase 2's onboarding wizard calls
-- this when creating a new clinic.
create or replace function public.seed_default_treatment_types(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.treatment_types (clinic_id, name, recall_days, sort_order) values
    (p_clinic_id, 'Scaling / Cleaning', 180, 1),
    (p_clinic_id, 'Filling', 180, 2),
    (p_clinic_id, 'RCT — in progress', 7, 3),
    (p_clinic_id, 'RCT — completed, crown due', 15, 4),
    (p_clinic_id, 'Crown / Bridge fitted', 180, 5),
    (p_clinic_id, 'Extraction', 7, 6),
    (p_clinic_id, 'Denture delivered', 15, 7),
    (p_clinic_id, 'Orthodontic adjustment', 21, 8),
    (p_clinic_id, 'Implant placed', 90, 9),
    (p_clinic_id, 'General checkup', 180, 10);
end;
$$;

revoke all on function public.seed_default_treatment_types(uuid) from public;
grant execute on function public.seed_default_treatment_types(uuid) to authenticated;
