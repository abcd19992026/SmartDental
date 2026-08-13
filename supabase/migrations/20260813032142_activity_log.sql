-- activity_log: append-only audit trail. No updated_at -- rows are never modified.
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_activity_log_clinic_id on public.activity_log(clinic_id);
create index idx_activity_log_created_at on public.activity_log(created_at desc);
