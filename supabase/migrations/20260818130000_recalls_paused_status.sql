-- Lets staff hold a specific recall (e.g. "doctor says hold off on the crown follow-up") without
-- it meaning declined -- resumable later via 'paused' -> 'pending', due_date left untouched so it
-- isn't recomputed. Postgres has no ALTER CHECK; the constraint must be dropped and recreated
-- with the same values plus 'paused'.
alter table public.recalls drop constraint recalls_status_check;
alter table public.recalls add constraint recalls_status_check
  check (status in ('pending', 'sent', 'contacted', 'booked', 'completed', 'declined', 'failed', 'paused'));
