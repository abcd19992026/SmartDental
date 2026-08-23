-- Phase 6A Step 4: per-patient billing summary.
--
-- security_invoker = true is not optional. Without it, the view executes with the privileges of
-- whoever created it (the migration role), and since a view has no RLS policies of its own, every
-- caller would see every clinic's billing regardless of their own RLS scope. With
-- security_invoker = true, the view's underlying reads against visits/patient_payments/patients
-- are evaluated under RLS as the CALLING user, exactly as if they'd queried those tables directly.
--
-- Driven from patients (not from a union of visit/payment patient_ids) so a patient with zero
-- visits and zero payments still returns exactly one row (0/0/0), which is what a single-patient
-- lookup (fetchBillingSummary in clinic-api.ts) expects rather than an empty result.
create view public.patient_billing_summary
with (security_invoker = true) as
select
  p.id as patient_id,
  p.clinic_id,
  coalesce(v.total_billed, 0) as total_billed,
  coalesce(pp.total_paid, 0) as total_paid,
  coalesce(v.total_billed, 0) - coalesce(pp.total_paid, 0) as due
from public.patients p
left join (
  select patient_id, sum(net_amount) as total_billed
  from public.visits
  group by patient_id
) v on v.patient_id = p.id
left join (
  -- Voided payments excluded from total_paid, per spec.
  select patient_id, sum(amount) as total_paid
  from public.patient_payments
  where voided_at is null
  group by patient_id
) pp on pp.patient_id = p.id;
