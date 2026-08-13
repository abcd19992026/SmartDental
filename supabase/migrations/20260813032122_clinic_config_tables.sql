-- treatment_types: per-clinic, editable in Settings. Seeded via seed_default_treatment_types().
create table public.treatment_types (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  recall_days integer not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_treatment_types_clinic_id on public.treatment_types(clinic_id);

-- whatsapp_templates: Meta-approved message templates per clinic.
create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  meta_template_name text not null,
  language_code text not null default 'en',
  category text check (category in ('UTILITY', 'MARKETING')),
  body_preview text,
  variable_mapping jsonb,
  approval_status text check (approval_status in ('pending', 'approved', 'rejected')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_whatsapp_templates_clinic_id on public.whatsapp_templates(clinic_id);
