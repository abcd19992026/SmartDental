-- Phase 6A Step 7: create_visit_with_recall gains p_discount_percent, appended at the end with a
-- default of 0 so every existing caller (positional or, as this codebase's RPC calls actually
-- are, named-parameter via PostgREST) keeps working unchanged. Kept SECURITY INVOKER -- it
-- already was (confirmed in Step 0: no SECURITY DEFINER clause), and that's deliberate: RLS on
-- patients/treatment_types/visits applies through this function exactly as it would to a direct
-- insert from the caller's own session, not with elevated privilege.
create or replace function public.create_visit_with_recall(
  p_patient_id uuid,
  p_treatment_type_id uuid,
  p_visit_date date,
  p_tooth_numbers text,
  p_notes text,
  p_amount numeric,
  p_recall_date_override date default null::date,
  p_discount_percent numeric default 0
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
begin
  -- RLS on patients already scopes this to rows the caller can see (their own clinic, and
  -- their own branch unless they're an owner). If the patient exists but isn't visible to this
  -- caller, this simply returns no row -- same as if it didn't exist -- so we raise a clear
  -- error instead of letting v_clinic_id/v_branch_id stay null and fail later as a confusing
  -- not-null-violation on the visits insert.
  select clinic_id, branch_id
    into v_clinic_id, v_branch_id
  from public.patients
  where id = p_patient_id;

  if not found then
    raise exception 'Patient not found or not accessible';
  end if;

  -- Same reasoning for the treatment type: RLS on treatment_types already scopes select to the
  -- caller's own clinic, so a foreign treatment_type_id normally just won't be found. The
  -- explicit clinic_id comparison below is still asserted per spec as defense in depth, in case
  -- RLS on treatment_types is ever loosened independently of this function.
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

  -- discount_percent's own CHECK (0-100) on visits is the actual enforcement; this is just a
  -- clearer error message than the raw constraint-violation text would be.
  if p_discount_percent < 0 or p_discount_percent > 100 then
    raise exception 'discount_percent must be between 0 and 100';
  end if;

  insert into public.visits (
    patient_id, clinic_id, branch_id, treatment_type_id,
    visit_date, tooth_numbers, notes, amount, discount_percent, created_by
  ) values (
    p_patient_id, v_clinic_id, v_branch_id, p_treatment_type_id,
    p_visit_date, p_tooth_numbers, p_notes, p_amount, p_discount_percent, auth.uid()
  )
  returning id into v_visit_id;

  -- The new visit supersedes whatever the patient was already due for.
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
