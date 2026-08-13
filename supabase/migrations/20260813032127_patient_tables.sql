-- patients: branch_id is NOT NULL (on delete restrict), not nullable as a bare reading of the
-- schema might suggest. Receptionist RLS policies match on branch_id = current_branch_id(),
-- and in SQL `null = <uuid>` evaluates to NULL (neither true nor false) -- a nullable branch_id
-- would make any patient created without a branch, or orphaned by a branch deletion,
-- permanently invisible to every receptionist. Branches are soft-deleted only (never hard
-- deleted), so `restrict` never actually fires in normal operation.
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  name text not null,
  mobile text not null,
  alt_mobile text,
  age integer,
  gender text check (gender in ('male', 'female', 'other')),
  address text,
  notes text,
  do_not_disturb boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_patients_clinic_mobile on public.patients(clinic_id, mobile);
create index idx_patients_clinic_id on public.patients(clinic_id);
create index idx_patients_branch_id on public.patients(branch_id);

-- visits: branch_id populated by the app layer from the parent patient's branch_id at insert.
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  treatment_type_id uuid references public.treatment_types(id) on delete set null,
  visit_date date not null default current_date,
  tooth_numbers text,
  notes text,
  amount numeric(10, 2),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_visits_clinic_id on public.visits(clinic_id);
create index idx_visits_patient_id on public.visits(patient_id);
