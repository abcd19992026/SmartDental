-- Marks rows written by send-test-message so they can be excluded from delivery-reporting
-- aggregates (quota-used counters, "messages sent today" stats) without being excluded from
-- message_log itself -- a test send still costs real money via Meta and must still be logged.
alter table public.message_log add column is_test boolean not null default false;
