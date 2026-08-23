-- Phase 7A Step 3: create_visit_with_recall gains p_teeth integer[] DEFAULT NULL, appended at
-- the end so every existing caller keeps working (and since Supabase RPC calls are always
-- named-parameter via PostgREST, not positional, this is safe regardless of position anyway).
-- p_tooth_numbers is left in place and still written -- both columns stay in sync during the
-- transition, tooth_numbers is only dropped in a later phase once nothing reads it.
--
-- Sorted and deduplicated here (not left to insertion order) so storage order is always
-- predictable regardless of the order teeth were clicked in the UI -- the visits_teeth_valid_fdi
-- CHECK doesn't care about order/duplicates, but callers reading this column later shouldn't have
-- to re-sort/re-dedupe themselves.
--
-- Kept SECURITY INVOKER (no SECURITY DEFINER clause) -- unchanged from every prior version, RLS
-- applies through this function exactly as it would to a direct insert from the caller's session.
create or replace function public.create_visit_with_recall(
  p_patient_id uuid,
  p_treatment_type_id uuid,
  p_visit_date date,
  p_tooth_numbers text,
  p_notes text,
  p_amount numeric,
  p_recall_date_override date default null::date,
  p_discount_percent numeric default 0,
  p_teeth integer[] default null
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
    visit_date, tooth_numbers, notes, amount, discount_percent, teeth, created_by
  ) values (
    p_patient_id, v_clinic_id, v_branch_id, p_treatment_type_id,
    p_visit_date, p_tooth_numbers, p_notes, p_amount, p_discount_percent, v_teeth, auth.uid()
  )
  returning id into v_visit_id;

  update public.recalls
  set status = 'completed'
  where patient_id = p_patient_id
    and status = 'pending';

  v_due_date := coalesce(p_recall_date_override, p_visit_date + v_recall_days);

  insert into public.recalls (
    patient_id, visit_id, clinic_id, branch_id, due_date, status
  ) values (
    p_patient_id, v_visit_id, v_clinic_id, v_branch_id, v_due_date, 'pending'
  )
  returning id into v_recall_id;

  return jsonb_build_object(
    'visit_id', v_visit_id,
    'recall_id', v_recall_id,
    'due_date', v_due_date
  );
end;
$function$;

-- CREATE OR REPLACE does not replace a function when arity differs -- same trap as 6A. Drop the
-- previous 8-parameter signature explicitly so exactly one version exists.
drop function public.create_visit_with_recall(uuid, uuid, date, text, text, numeric, date, numeric);
