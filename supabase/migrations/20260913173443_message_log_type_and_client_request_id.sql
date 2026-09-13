-- Phase 30A: splits recall vs payment sends apart in message_log, and gives
-- send-payment-message the same client_request_id idempotency pattern already used by
-- patient_payments/prescriptions/visits.

alter table public.message_log
  add column message_type text not null default 'recall'
    check (message_type in ('recall', 'payment'));

-- Backfill is a no-op in practice (the column default already makes every existing row
-- 'recall'), but stated explicitly per the task instruction and to be correct if the default
-- were ever changed before this statement runs.
update public.message_log set message_type = 'recall' where message_type is null;

alter table public.message_log
  add column client_request_id uuid;

create unique index idx_message_log_client_request_id
  on public.message_log (client_request_id)
  where client_request_id is not null;
