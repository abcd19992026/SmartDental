-- Phase 8A Step 3: seed_default_medicines, mirroring seed_default_treatment_types exactly --
-- SECURITY DEFINER, pinned search_path, and (confirmed in Step 0) the same restrictive default
-- EXECUTE grant that role -- anon/authenticated get nothing, only service_role can call it, since
-- this migration runs under the same creating role as every other function in this project and
-- gets the identical default ACL with zero explicit GRANT/REVOKE needed.
--
-- Names only. default_dosage/default_duration are deliberately left NULL -- dosage is a clinical
-- decision belonging to the prescribing dentist, not a seed script. A pre-filled default invites
-- a doctor to click past it without reading; each dentist fills in their own defaults once in
-- Settings, and from then on it auto-fills.
--
-- ON CONFLICT (clinic_id, lower(name)) DO NOTHING against the exact expression the unique index
-- (idx_medicines_clinic_name_ci) is built on -- makes this idempotent: running it twice on the
-- same clinic inserts nothing the second time, rather than erroring on the unique violation.
create or replace function public.seed_default_medicines(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.medicines (clinic_id, name) values
    (p_clinic_id, 'Amoxicillin 500'),
    (p_clinic_id, 'Amoxicillin + Clavulanic Acid 625'),
    (p_clinic_id, 'Cefixime 200'),
    (p_clinic_id, 'Azithromycin 500'),
    (p_clinic_id, 'Metronidazole 400'),
    (p_clinic_id, 'Ibuprofen 400'),
    (p_clinic_id, 'Paracetamol 650'),
    (p_clinic_id, 'Ibuprofen + Paracetamol'),
    (p_clinic_id, 'Aceclofenac + Paracetamol'),
    (p_clinic_id, 'Diclofenac 50'),
    (p_clinic_id, 'Ketorolac 10'),
    (p_clinic_id, 'Serratiopeptidase 10'),
    (p_clinic_id, 'Pantoprazole 40'),
    (p_clinic_id, 'Rabeprazole 20'),
    (p_clinic_id, 'Tranexamic Acid 500'),
    (p_clinic_id, 'Chlorhexidine Mouthwash 0.2%'),
    (p_clinic_id, 'Povidone Iodine Gargle'),
    (p_clinic_id, 'Lignocaine Oral Gel'),
    (p_clinic_id, 'Vitamin B Complex'),
    (p_clinic_id, 'Calcium + Vitamin D3')
  on conflict (clinic_id, lower(name)) do nothing;
end;
$function$;
