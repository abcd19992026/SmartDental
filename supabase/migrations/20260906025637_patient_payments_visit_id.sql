-- Phase 25A Task 1: optionally link a patient_payment to the specific visit it was collected for,
-- so the Recall Report (Phase 25B) can say how much money a given return visit actually brought in.
--
-- Nullable, NOT backfilled: every existing row stays NULL. A payment recorded before this column
-- existed simply isn't attributable to one visit, and guessing retroactively would be inventing
-- data on a money ledger. New payments carry visit_id only when the caller supplies it
-- (AddPaymentModal does, when it has a current-visit context; PatientsPage/TodayPage do not).
--
-- ON DELETE SET NULL mirrors recalls.visit_id exactly: deleting a visit must never cascade-delete
-- the row that recorded real cash, but the now-dangling link is cleared rather than left pointing
-- at a gone visit.
alter table public.patient_payments
  add column visit_id uuid references public.visits(id) on delete set null;

create index idx_patient_payments_visit_id on public.patient_payments (visit_id);

comment on column public.patient_payments.visit_id is
  'Optional link to the specific visit this payment was collected for. Set only at INSERT time -- protect_patient_payments_immutable_fields() rejects any later change, and patient_payments_insert''s WITH CHECK requires the visit to belong to the same patient and clinic. Old rows and payments recorded without a current-visit context stay NULL; never backfilled.';

-- ---------------------------------------------------------------------------
-- patient_payments_insert: add a visit_id consistency check alongside (not replacing) the
-- branch-ownership and patient-ownership EXISTS guards already there from 20260821090700 /
-- 20260824115751. Live policy body confirmed via pg_policies before rewriting; the only change is
-- the new `visit_id is null or exists (...)` conjunct -- no role/owner/branch/patient logic is
-- altered or weakened.
-- ---------------------------------------------------------------------------
drop policy patient_payments_insert on public.patient_payments;

create policy patient_payments_insert on public.patient_payments
  for insert with check (
    public.is_super_admin()
    or (
      clinic_id = public.current_clinic_id()
      and exists (select 1 from public.branches b where b.id = branch_id and b.clinic_id = public.current_clinic_id())
      and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = public.current_clinic_id())
      and (
        visit_id is null
        or exists (
          select 1 from public.visits v
          where v.id = visit_id
            and v.patient_id = patient_payments.patient_id
            and v.clinic_id = public.current_clinic_id()
        )
      )
      and (public.current_user_role() = 'owner' or branch_id = public.current_branch_id())
    )
  );

-- ---------------------------------------------------------------------------
-- protect_patient_payments_immutable_fields(): visit_id joins the explicit column-by-column
-- allowlist. A money row's link to a visit may be established at INSERT time and never changed
-- afterward -- once linked, it's linked. Body below is the live function (confirmed via
-- pg_get_functiondef before editing) with `visit_id` added in the same style as every other
-- checked column; nothing else changed.
-- ---------------------------------------------------------------------------
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
    or new.visit_id   is distinct from old.visit_id
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
