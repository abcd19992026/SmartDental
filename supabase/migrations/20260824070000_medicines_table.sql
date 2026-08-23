-- Phase 8A Step 1: per-clinic medicines master, modeled on treatment_types (Step 0 reference:
-- same clinic_id CASCADE FK shape, same set_updated_at() trigger reused rather than a new one).
--
-- Case-insensitive unique index on (clinic_id, lower(name)): without it a clinic ends up with
-- "Clavam 625" and "clavam 625" as separate rows and the prescription dropdown becomes a mess.
-- CHECK on name rejects blank/whitespace-only after trimming -- trim(name) <> '' also implicitly
-- rejects null via CHECK's NULL-is-satisfied semantics not applying here since name is NOT NULL.
create table public.medicines (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (trim(name) <> ''),
  default_dosage text,
  default_duration text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_medicines_clinic_name_ci on public.medicines (clinic_id, lower(name));
create index idx_medicines_clinic_id on public.medicines (clinic_id);

create trigger set_updated_at
  before update on public.medicines
  for each row execute function public.set_updated_at();
