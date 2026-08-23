-- Phase S1 Step 2: double-submission protection. Nullable client_request_id uuid on the three
-- tables a slow-network double-tap actually duplicates money or clinical records on
-- (patient_payments, visits, prescriptions), with a partial unique index so a duplicate submit
-- collides with the index instead of silently creating a second row. Nullable because existing
-- rows have none and older callers must keep working; the UI generates one value per form
-- opening and sends it with the submit.
alter table public.patient_payments add column client_request_id uuid;
create unique index idx_patient_payments_client_request_id
  on public.patient_payments (client_request_id)
  where client_request_id is not null;

alter table public.visits add column client_request_id uuid;
create unique index idx_visits_client_request_id
  on public.visits (client_request_id)
  where client_request_id is not null;

alter table public.prescriptions add column client_request_id uuid;
create unique index idx_prescriptions_client_request_id
  on public.prescriptions (client_request_id)
  where client_request_id is not null;

-- create_visit_with_recall: adding a parameter, even trailing-with-default, is a different
-- signature to Postgres -- CREATE OR REPLACE would create a second overload rather than replace
-- the first (the exact arity trap from 6A). Drop the old 9-arg signature explicitly first.
drop function public.create_visit_with_recall(
  uuid, uuid, date, text, text, numeric, date, numeric, integer[]
);

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
  p_client_request_id uuid default null
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

-- A brand new function object gets Postgres's own default grants (which, per 8A/9A, include a
-- stray PUBLIC EXECUTE regardless of ALTER DEFAULT PRIVILEGES) -- reapply the same grant shape
-- Step D just set on the old signature.
revoke execute on function public.create_visit_with_recall(
  uuid, uuid, date, text, text, numeric, date, numeric, integer[], uuid
) from public;
grant execute on function public.create_visit_with_recall(
  uuid, uuid, date, text, text, numeric, date, numeric, integer[], uuid
) to authenticated;
