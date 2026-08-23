-- Phase 9A Step 1: prescriptions -- digitises the clinic's paper prescription slip. FK shape
-- matches visits exactly (Step 0 reference): clinic_id CASCADE, branch_id RESTRICT, patient_id
-- CASCADE, visit_id nullable SET NULL (a prescription is a real clinical record and must survive
-- its visit being deleted, same reasoning as recalls.visit_id in 7A/the 6A follow-up).
--
-- doctor_name is stored as plain text, separate from created_by: this clinic's letterhead lists
-- three dentists, only one of whom has a login. The record must carry which of them actually
-- prescribed it, not which login happened to be signed in.
--
-- created_by: NOT NULL, no ON DELETE clause (defaults to NO ACTION) -- same audit-integrity
-- reasoning as patient_payments.created_by in 6A: a clinical record's "who recorded this" must
-- never silently go null, so deleting a profile with prescription history is blocked rather than
-- corrupting the audit trail.
create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete set null,
  doctor_name text not null,
  prescribed_on date not null default current_date,

  -- Vitals: free-form on paper, format varies (e.g. height "5'6\"" or "168cm", BP "120/80"),
  -- deliberately text rather than a typed/numeric column.
  occupation text,
  height text,
  weight text,
  blood_pressure text,
  spo2 text,

  chief_complaint text,

  -- The checkbox row on the paper slip. Shape:
  -- {"diabetes": false, "hypertension": false, "thyroid": false, "asthma": false,
  --  "tuberculosis": false, "cardiac": false, "allergies": false, "arthritis": false,
  --  "other": false, "other_text": null}
  medical_history jsonb,

  past_dental_history text,
  oral_examination text,

  -- Shape: {"iopa": false, "rvg": false, "opg": false, "blood_other": false, "notes": null}
  investigation jsonb,

  provisional_diagnosis text,
  treatment_plan text,

  -- Same valid-FDI-number set as visits.teeth (visits_teeth_valid_fdi, 7A) -- reused verbatim via
  -- the constraint below, not rewritten, so the two can never drift apart.
  teeth integer[],

  -- Array shape: [{"name": "Amoxicillin 500", "dosage": "1-0-1", "duration": "5 days",
  --   "notes": null}]. Deliberately plain text fields, not a foreign key to medicines: a
  -- prescription is a point-in-time medical record -- if the doctor later renames or deletes
  -- "Clavam 625" from their medicines list, every prescription already printed must still read
  -- exactly what was prescribed that day. medicines is only a picker to fill this in quickly, not
  -- a source of truth this table stays linked to.
  medications jsonb,

  notes text,

  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint prescriptions_teeth_valid_fdi check (
    teeth is null or teeth <@ array[
      11,12,13,14,15,16,17,18,
      21,22,23,24,25,26,27,28,
      31,32,33,34,35,36,37,38,
      41,42,43,44,45,46,47,48,
      51,52,53,54,55,
      61,62,63,64,65,
      71,72,73,74,75,
      81,82,83,84,85
    ]::integer[]
  ),
  constraint prescriptions_medications_is_array check (
    medications is null or jsonb_typeof(medications) = 'array'
  )
);

create trigger set_updated_at
  before update on public.prescriptions
  for each row execute function public.set_updated_at();

create index idx_prescriptions_patient_id on public.prescriptions (patient_id);
create index idx_prescriptions_clinic_id on public.prescriptions (clinic_id);
create index idx_prescriptions_prescribed_on on public.prescriptions (prescribed_on);
create index idx_prescriptions_teeth on public.prescriptions using gin (teeth);
