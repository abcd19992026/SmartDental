-- clinics: one row per tenant.
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_name text,
  phone text,
  email text,
  city text,
  address text,
  logo_url text,
  waba_phone_number_id text,
  waba_business_id text,
  whatsapp_enabled boolean not null default false,
  send_time time not null default '10:00',
  daily_message_cap integer not null default 150,
  monthly_message_quota integer not null default 3000,
  plan_name text not null default 'standard',
  plan_started_on date,
  plan_expires_on date,
  is_active boolean not null default true,
  suspension_reason text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- branches: never hard-deleted; soft-delete via is_active.
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  address text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_branches_clinic_id on public.branches(clinic_id);
