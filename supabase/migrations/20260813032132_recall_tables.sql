-- recalls: branch_id not null / on delete restrict for the same reason as patients.branch_id
-- (see patient_tables.sql). Populated by the app layer from the parent patient.
create table public.recalls (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete set null,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  due_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'contacted', 'booked', 'completed', 'declined', 'failed')),
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  next_retry_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_recalls_clinic_status_due on public.recalls(clinic_id, status, due_date);
create index idx_recalls_patient_id on public.recalls(patient_id);

-- message_log: written only by Edge Functions via the service role key (bypasses RLS). The UI
-- reads, never writes -- see the RLS policy in rls_recalls_messages_appointments.sql, which is
-- select-only. created_at is required even though it isn't in the product's own column list:
-- a row inserted as 'queued' or 'failed' has a null sent_at (that column means "when Meta
-- accepted it," not "when we tried"), so without created_at a failed send has no timestamp at
-- all, making failure debugging impossible.
create table public.message_log (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  recall_id uuid references public.recalls(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  mobile text,
  template_name text,
  wa_message_id text,
  status text check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  error_code text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_message_log_clinic_id on public.message_log(clinic_id);
create index idx_message_log_recall_id on public.message_log(recall_id);
create index idx_message_log_wa_message_id on public.message_log(wa_message_id);

-- appointments: branch_id not null / on delete restrict, same reasoning as patients.branch_id.
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete cascade,
  recall_id uuid references public.recalls(id) on delete set null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'no_show', 'cancelled')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_appointments_clinic_id on public.appointments(clinic_id);
create index idx_appointments_patient_id on public.appointments(patient_id);
