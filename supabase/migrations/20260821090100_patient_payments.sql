-- Phase 6A Step 2 + 5: patient_payments -- a patient paying the clinic, distinct from the
-- existing `payments` table. Step 0 confirmed `payments` is subscription/platform billing (clinic
-- paying the platform owner): no patient_id column, no branch_id column, period_from/period_to,
-- and RLS scoped to is_super_admin() only -- no clinic ever sees its own rows there. It is not
-- reused or extended here; this is a genuinely separate table.
--
-- Append-only by design: a wrong entry is voided, never edited or deleted. This is cash handled
-- by receptionists -- an editable row destroys accountability. Enforced two ways: no DELETE policy
-- at all (next migration), and the allowlist trigger below, which permits only
-- voided_at/voided_by/void_reason to change on UPDATE.
--
-- patient_id ON DELETE CASCADE mirrors visits.patient_id exactly; branch_id ON DELETE RESTRICT
-- mirrors visits.branch_id / patients.branch_id exactly. This is deliberate: delete_clinic_cascade
-- deletes patients (which cascades away their visits), then branches, then clinics. Giving
-- patient_payments the identical FK shape means it gets swept away in the same first step visits
-- already are, with zero changes needed to delete_clinic_cascade.
create table public.patient_payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  mode text not null check (mode in ('cash', 'upi', 'card', 'bank_transfer', 'other')),
  paid_on date not null default current_date,
  notes text,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  -- Left NOT NULL with no ON DELETE clause (defaults to NO ACTION): unlike visits.created_by /
  -- payments.recorded_by (both nullable, both SET NULL), this column can never legitimately go
  -- null on a money row without breaking "who recorded this" accountability, so deleting a
  -- profile that has payment history is blocked rather than silently corrupting the audit trail.
  created_by uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

comment on column public.patient_payments.voided_at is
  'null = active. Non-null = voided; the row itself is never deleted or edited beyond voided_at/voided_by/void_reason (see protect_patient_payments_immutable_fields).';

comment on column public.patient_payments.created_by is
  'Defaults to auth.uid() so a normal insert never supplies it explicitly -- the data-access layer (insertPayment in clinic-api.ts) never sends this field in the request body, which is what actually keeps it un-spoofable in practice.';

create index idx_patient_payments_patient_id on public.patient_payments (patient_id);
create index idx_patient_payments_clinic_id on public.patient_payments (clinic_id);
create index idx_patient_payments_branch_id on public.patient_payments (branch_id);
create index idx_patient_payments_paid_on on public.patient_payments (paid_on);

-- Allowlist trigger, same style as protect_profile_role_fields(): service role and super_admin
-- pass through unconditionally (an escape hatch for backend corrections, mirroring that
-- function's own bypass). Everyone else -- in practice only an owner, since the UPDATE RLS policy
-- in the next migration restricts this to owner/super_admin already -- may only change
-- voided_at/voided_by/void_reason. Every other column is asserted unchanged explicitly, not just
-- the ones that seem sensitive, so a column added to this table later can't silently end up
-- writable without this trigger being touched too.
create or replace function public.protect_patient_payments_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  if new.clinic_id   is distinct from old.clinic_id
    or new.branch_id  is distinct from old.branch_id
    or new.patient_id is distinct from old.patient_id
    or new.amount     is distinct from old.amount
    or new.mode       is distinct from old.mode
    or new.paid_on    is distinct from old.paid_on
    or new.notes      is distinct from old.notes
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Only voided_at, voided_by, and void_reason may be changed on a payment';
  end if;

  return new;
end;
$$;

create trigger patient_payments_protect_immutable_fields
  before update on public.patient_payments
  for each row execute function public.protect_patient_payments_immutable_fields();
