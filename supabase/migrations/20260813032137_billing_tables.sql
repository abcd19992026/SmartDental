-- payments: super_admin only, end to end. A clinic owner must never see this table.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  amount numeric(10, 2) not null,
  paid_on date not null,
  period_from date,
  period_to date,
  mode text check (mode in ('cash', 'upi', 'bank_transfer', 'cheque', 'other')),
  reference text,
  notes text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_payments_clinic_id on public.payments(clinic_id);

-- clinic_usage: monthly rollup, written by the daily send job. Owners get read access to their
-- own clinic's rows (so the dashboard can show "1,240 of 3,000 messages used this month");
-- writes stay super_admin-exclusive.
create table public.clinic_usage (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  month date not null,
  messages_sent integer not null default 0,
  patients_added integer not null default 0,
  recalls_created integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_clinic_usage_clinic_month on public.clinic_usage(clinic_id, month);
