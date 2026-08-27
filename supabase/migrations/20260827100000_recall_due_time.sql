-- Phase 21A-1: schema support for the new absolute-timestamp recall reminder ladder (built in
-- 21A-2, not here). due_time is nullable -- NULL means "no specific appointment time known", and
-- every existing clinic/recall keeps behaving exactly as today until a time is actually set.
--
-- last_stage_sent tracks progress through the fixed 3-stage ladder (due_date-1 / due_date at
-- due_time-2h / due_date+1) against the recall's CURRENT schedule. Deliberately a new column,
-- not a reuse of attempt_count:
--   * attempt_count is a historical total-attempts counter already read by TodayPage's monthly
--     stats (sentThisMonthCount). Resetting it on every reschedule would erase real send
--     history, which nothing in this phase asked for.
--   * attempt_count -> "which stage is next" isn't even a uniform mapping across recalls: due_time
--     is nullable, so stage 2 doesn't exist for some recalls, meaning the same attempt_count
--     value would mean a different next-stage depending on a second column entirely.
-- next_retry_date is left untouched -- it's `date`-typed and can't represent stage 2's intraday
-- target (due_time - 2h), and every stage's target is a pure function of due_date/due_time, so
-- there is nothing to persist for "what's next" -- 21A-2 computes it on read instead of storing it.
alter table public.recalls
  add column due_time time,
  add column last_stage_sent smallint,
  add constraint recalls_last_stage_sent_check
    check (last_stage_sent is null or last_stage_sent in (1, 2, 3));

-- Reschedule safety: due_date/due_time can change from a direct client update -- TodayPage's
-- handleSnooze7Days does exactly this today (supabase.from("recalls").update({ due_date })),
-- bypassing any application-level reset entirely. A trigger is the only mechanism that can't be
-- routed around by that or any future call path.
create or replace function public.reset_recall_ladder_stage()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.due_date is distinct from old.due_date
  or new.due_time is distinct from old.due_time
  then
    new.last_stage_sent := null;
  end if;
  return new;
end;
$$;

-- Trigger functions are checked for EXECUTE at CREATE TRIGGER time, not fire time (confirmed by
-- the S3 sweep, 20260826072358) -- leaving PUBLIC/anon/authenticated grants in place would make
-- this callable as a bare RPC endpoint for no reason. Revoke from all three explicitly.
revoke execute on function public.reset_recall_ladder_stage() from public, anon, authenticated;

drop trigger if exists trg_reset_recall_ladder_stage on public.recalls;
create trigger trg_reset_recall_ladder_stage
  before update on public.recalls
  for each row
  execute function public.reset_recall_ladder_stage();

-- create_visit_with_recall: adding a parameter changes arity -- CREATE OR REPLACE would create a
-- second overload rather than replace the existing one (the established arity trap in this
-- codebase, see 6A/S1). Drop the current 10-arg signature explicitly first.
drop function public.create_visit_with_recall(
  uuid, uuid, date, text, text, numeric, date, numeric, integer[], uuid
);

-- p_recall_due_time is appended last, with a default, so every existing caller (named-parameter
-- via PostgREST, per this codebase's established RPC convention) keeps working unchanged. Kept
-- SECURITY INVOKER (no "security definer" clause) -- unchanged from every prior version; RLS on
-- patients/treatment_types/visits/recalls applies through this function exactly as it would to a
-- direct call from the caller's own session.
create function public.create_visit_with_recall(
  p_patient_id uuid,
  p_treatment_type_id uuid,
  p_visit_date date,
  p_tooth_numbers text,
  p_notes text,
  p_amount numeric,
  p_recall_date_override date default null::date,
  p_discount_percent numeric default 0,
  p_teeth integer[] default null::integer[],
  p_client_request_id uuid default null,
  p_recall_due_time time default null
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_clinic_id     uuid;
  v_branch_id     uuid;
  v_tt_clinic_id  uuid;
  v_recall_days   integer;
  v_visit_id      uuid;
  v_recall_id     uuid;
  v_due_date      date;
  v_teeth         integer[];
begin
  select clinic_id, branch_id
    into v_clinic_id, v_branch_id
  from public.patients
  where id = p_patient_id;

  if not found then
    raise exception 'Patient not found or not accessible';
  end if;

  select clinic_id, recall_days
    into v_tt_clinic_id, v_recall_days
  from public.treatment_types
  where id = p_treatment_type_id;

  if not found then
    raise exception 'Treatment type not found or not accessible';
  end if;

  if v_tt_clinic_id is distinct from v_clinic_id then
    raise exception 'Treatment type does not belong to the patient''s clinic';
  end if;

  if p_discount_percent < 0 or p_discount_percent > 100 then
    raise exception 'discount_percent must be between 0 and 100';
  end if;

  if p_teeth is not null then
    select array_agg(distinct t order by t) into v_teeth from unnest(p_teeth) as t;
  end if;

  insert into public.visits (
    patient_id, clinic_id, branch_id, treatment_type_id,
    visit_date, tooth_numbers, notes, amount, discount_percent, teeth, created_by,
    client_request_id
  ) values (
    p_patient_id, v_clinic_id, v_branch_id, p_treatment_type_id,
    p_visit_date, p_tooth_numbers, p_notes, p_amount, p_discount_percent, v_teeth, auth.uid(),
    p_client_request_id
  )
  returning id into v_visit_id;

  update public.recalls
  set status = 'completed'
  where patient_id = p_patient_id
    and status = 'pending';

  v_due_date := coalesce(p_recall_date_override, p_visit_date + v_recall_days);

  insert into public.recalls (
    patient_id, visit_id, clinic_id, branch_id, due_date, due_time, status
  ) values (
    p_patient_id, v_visit_id, v_clinic_id, v_branch_id, v_due_date, p_recall_due_time, 'pending'
  )
  returning id into v_recall_id;

  return jsonb_build_object(
    'visit_id', v_visit_id,
    'recall_id', v_recall_id,
    'due_date', v_due_date,
    'due_time', p_recall_due_time
  );
end;
$function$;

-- A brand new function object gets Postgres's own default grants (which, per prior phases,
-- include a stray PUBLIC EXECUTE regardless of ALTER DEFAULT PRIVILEGES) -- revoke explicitly
-- from public/anon/authenticated, then grant only to authenticated.
revoke execute on function public.create_visit_with_recall(
  uuid, uuid, date, text, text, numeric, date, numeric, integer[], uuid, time
) from public, anon, authenticated;
grant execute on function public.create_visit_with_recall(
  uuid, uuid, date, text, text, numeric, date, numeric, integer[], uuid, time
) to authenticated;
