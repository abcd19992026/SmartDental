-- profiles: one row per auth.users record. clinic_id is null only for super_admin.
-- branch_id null means "all branches" (meaningful for owner only; receptionists always have one).
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  full_name text,
  phone text,
  role text not null check (role in ('super_admin', 'owner', 'receptionist')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_super_admin_no_clinic check (
    (role = 'super_admin' and clinic_id is null) or (role <> 'super_admin' and clinic_id is not null)
  )
);
create index idx_profiles_clinic_id on public.profiles(clinic_id);
