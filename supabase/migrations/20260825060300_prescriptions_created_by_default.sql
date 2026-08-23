-- Fixes an oversight caught live in Step 7 verification: the spec explicitly called for
-- created_by default auth.uid() (matching patient_payments.created_by from 6A), but the Step 1
-- migration omitted the DEFAULT clause, leaving every insert failing on a NOT NULL violation
-- unless the client explicitly supplied created_by -- which the data-access layer deliberately
-- never does (same reasoning as 6A: the DEFAULT is what keeps it un-spoofable in practice).
alter table public.prescriptions alter column created_by set default auth.uid();
