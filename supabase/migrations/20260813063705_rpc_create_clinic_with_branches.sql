-- Atomically inserts a clinic row plus one or more branch rows in a single transaction, so a
-- partially-created clinic (e.g. clinic with zero branches) can never exist. Called only from
-- the create-clinic Edge Function via a service-role client -- the browser never calls this
-- directly, hence execute is granted to service_role only, not authenticated.
create or replace function public.create_clinic_with_branches(
  p_clinic jsonb,
  p_branches jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_branch_id uuid;
  v_branch jsonb;
  v_branch_ids uuid[] := '{}';
begin
  if p_clinic->>'name' is null or trim(p_clinic->>'name') = '' then
    raise exception 'Clinic name is required';
  end if;
  if p_branches is null or jsonb_array_length(p_branches) < 1 then
    raise exception 'At least one branch is required';
  end if;

  insert into public.clinics (
    name, owner_name, phone, email, city, address, logo_url,
    waba_phone_number_id, waba_business_id, whatsapp_enabled,
    send_time, daily_message_cap, monthly_message_quota,
    plan_name, plan_started_on, plan_expires_on, is_active
  )
  values (
    p_clinic->>'name',
    p_clinic->>'owner_name',
    p_clinic->>'phone',
    p_clinic->>'email',
    p_clinic->>'city',
    p_clinic->>'address',
    p_clinic->>'logo_url',
    p_clinic->>'waba_phone_number_id',
    p_clinic->>'waba_business_id',
    coalesce((p_clinic->>'whatsapp_enabled')::boolean, false),
    coalesce((p_clinic->>'send_time')::time, '10:00'),
    coalesce((p_clinic->>'daily_message_cap')::integer, 150),
    coalesce((p_clinic->>'monthly_message_quota')::integer, 3000),
    coalesce(p_clinic->>'plan_name', 'standard'),
    (p_clinic->>'plan_started_on')::date,
    (p_clinic->>'plan_expires_on')::date,
    true
  )
  returning id into v_clinic_id;

  for v_branch in select * from jsonb_array_elements(p_branches)
  loop
    if v_branch->>'name' is null or trim(v_branch->>'name') = '' then
      raise exception 'Branch name is required';
    end if;

    insert into public.branches (clinic_id, name, address, phone)
    values (
      v_clinic_id,
      v_branch->>'name',
      v_branch->>'address',
      v_branch->>'phone'
    )
    returning id into v_branch_id;

    v_branch_ids := array_append(v_branch_ids, v_branch_id);
  end loop;

  return jsonb_build_object('clinic_id', v_clinic_id, 'branch_ids', v_branch_ids);
end;
$$;

revoke all on function public.create_clinic_with_branches(jsonb, jsonb) from public;
grant execute on function public.create_clinic_with_branches(jsonb, jsonb) to service_role;
