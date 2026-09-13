-- Phase 30A Task 2: recall_return_attribution now filters message_log.message_type = 'recall'
-- explicitly, on top of the pre-existing recall_id is not null filter -- payment sends (Phase
-- 30A's new send-payment-message) never carry a recall_id, so this is defense in depth, not a
-- behavior change: row count is identical before/after.

create or replace view public.recall_return_attribution
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
    and ml.message_type = 'recall'
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
  'Phase 25A/30A. One row per successfully-sent recall (message_log message_type=recall, status sent/delivered/read); recalls never successfully sent are absent. return_* columns describe the earliest non-trigger visit by the same patient within 45 days (IST) of first send, credited to at most one recall (earliest due_date wins a shared visit). collected_amount = non-voided patient_payments linked to that return visit, NULL when unknown. SECURITY INVOKER -- RLS-scoped to the caller.';
