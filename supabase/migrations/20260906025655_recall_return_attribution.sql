-- Phase 25A Task 2: recall_return_attribution -- per recall, did the patient actually come back
-- after we successfully sent it, and what was that return visit worth? Feeds the Recall Report
-- screen built in Phase 25B.
--
-- security_invoker = true is load-bearing, exactly as in patient_billing_summary
-- (20260821090300): a view has no RLS of its own, so without this every caller would read every
-- clinic's recalls. With it, the underlying reads against recalls / message_log / visits /
-- patient_payments / patients are all evaluated under the CALLING user's RLS scope.
--
-- WHAT "ACTUALLY SENT" MEANS (step 1/2): message_log-driven, never recalls.status. A recall can
-- be flipped to 'sent'/'completed' by staff action with no successful WhatsApp send ever landing.
--   first_sent_at = earliest message_log.sent_at with status in ('sent','delivered','read')
--   delivered_at  = earliest message_log.sent_at with status in ('delivered','read'), nullable
-- A recall with no qualifying message_log row (never successfully sent) produces NO row here at
-- all -- it is not in the report yet. Test sends (is_test) are excluded: a test message costs
-- money at Meta but is not a real recall contact.
--
-- DATES: message_log.sent_at is timestamptz; visits.visit_date is a plain calendar date. The
-- whole app runs on IST (Asia/Kolkata -- todayIST() and friends), so first_sent_at is reduced to
-- its IST calendar date before comparison. The return window is (first_sent_date, first_sent_date
-- + 45 days] -- strictly after, up to and including day 45.
--
-- RETURN VISIT (step 3): the earliest visits row for the SAME patient whose visit_date falls in
-- that window and which is NOT the visit that triggered the recall (visits.id distinct from
-- recalls.visit_id).
--
-- ONE VISIT CREDITS ONE RECALL (step 4): if the same candidate visit would satisfy two of a
-- patient's recalls, only the recall with the earlier due_date (then lower id) keeps its return_*
-- columns populated; the other recall's return_* columns come back NULL even though a visit did
-- physically happen. Implemented with row_number() over (partition by candidate visit
-- order by due_date, recall id) and keeping return_* only where the rank is 1.
--
-- collected_amount (step 5): sum of patient_payments.amount linked (via the new visit_id column)
-- to the credited return visit, voided rows excluded. NULL -- never 0 -- when there is no credited
-- return visit, or there is one but nothing has been linked to it yet. 0 would assert "we know
-- nothing was collected"; NULL correctly says "unknown".
--
-- return_visit_amount is visits.net_amount (the GENERATED ALWAYS, tamper-proof column from
-- 20260821090000), never visits.amount.
--
-- patient_name (Phase 25A Task 3 decision): joined into the view here rather than fetched in a
-- second round-trip from clinic-api.ts. Simpler for the single caller, and the patients read is
-- RLS-scoped through security_invoker just like every other table in the view. It is an inner
-- join -- a recall always has a patient (recalls.patient_id is NOT NULL, ON DELETE CASCADE), so
-- it can never drop a row that would otherwise qualify.

create view public.recall_return_attribution
with (security_invoker = true) as
with message_log_sent as (
  select
    ml.recall_id,
    min(ml.sent_at) filter (where ml.status in ('sent', 'delivered', 'read')) as first_sent_at,
    min(ml.sent_at) filter (where ml.status in ('delivered', 'read'))         as delivered_at
  from public.message_log ml
  where ml.recall_id is not null
    and ml.sent_at is not null
    and ml.is_test = false
  group by ml.recall_id
),
candidate as (
  select
    r.id          as recall_id,
    r.clinic_id,
    r.branch_id,
    r.patient_id,
    pt.name       as patient_name,
    r.due_date,
    r.status,
    r.reply_received_at,
    s.first_sent_at,
    s.delivered_at,
    rv.id         as return_visit_id,
    rv.visit_date as return_visit_date,
    rv.net_amount as return_visit_amount
  from public.recalls r
  join public.patients pt on pt.id = r.patient_id
  join message_log_sent s
    on s.recall_id = r.id
   and s.first_sent_at is not null
  left join lateral (
    select v.id, v.visit_date, v.net_amount
    from public.visits v
    where v.patient_id = r.patient_id
      and v.id is distinct from r.visit_id
      and v.visit_date >  (s.first_sent_at at time zone 'Asia/Kolkata')::date
      and v.visit_date <= (s.first_sent_at at time zone 'Asia/Kolkata')::date + 45
    order by v.visit_date asc, v.id asc
    limit 1
  ) rv on true
),
ranked as (
  select
    c.*,
    case
      when c.return_visit_id is not null then
        row_number() over (
          partition by c.return_visit_id
          order by c.due_date asc, c.recall_id asc
        )
    end as return_rank
  from candidate c
)
select
  ranked.recall_id,
  ranked.clinic_id,
  ranked.branch_id,
  ranked.patient_id,
  ranked.patient_name,
  ranked.due_date,
  ranked.status,
  ranked.first_sent_at,
  ranked.delivered_at,
  ranked.reply_received_at,
  case when ranked.return_rank = 1 then ranked.return_visit_id     end as return_visit_id,
  case when ranked.return_rank = 1 then ranked.return_visit_date   end as return_visit_date,
  case when ranked.return_rank = 1 then ranked.return_visit_amount end as return_visit_amount,
  case
    when ranked.return_rank = 1 then (
      select sum(pp.amount)
      from public.patient_payments pp
      where pp.visit_id = ranked.return_visit_id
        and pp.voided_at is null
    )
  end as collected_amount
from ranked;

comment on view public.recall_return_attribution is
  'Phase 25A. One row per successfully-sent recall (message_log status sent/delivered/read); recalls never successfully sent are absent. return_* columns describe the earliest non-trigger visit by the same patient within 45 days (IST) of first send, credited to at most one recall (earliest due_date wins a shared visit). collected_amount = non-voided patient_payments linked to that return visit, NULL when unknown. SECURITY INVOKER -- RLS-scoped to the caller.';
