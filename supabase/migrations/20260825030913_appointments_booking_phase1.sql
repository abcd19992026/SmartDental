-- Appointments System Phase 1 (backend only): adds a 'booked' status to the existing
-- appointments table so a receptionist can schedule an appointment ahead of time, then check the
-- patient in on arrival by flipping it into the SAME queue the walk-in flow already uses
-- ('waiting' -> 'in_chair' -> 'done', Phase 14A). No new table, no RLS policy changes -- the
-- existing per-command policies (branch/clinic/patient ownership already verified in Phase 14A)
-- are reused as-is by every RPC below via SECURITY INVOKER.
--
-- Status lifecycle: booked -> (check-in) waiting -> in_chair -> done
--                    booked -> (no-show) no_show
--                    booked -> cancelled

-- ---------------------------------------------------------------------------
-- Task 1a: widen the status CHECK to also allow 'booked'.
-- ---------------------------------------------------------------------------
alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status = any (array[
    'scheduled', 'completed', 'no_show', 'cancelled',
    'waiting', 'in_chair', 'done', 'booked'
  ]));

-- ---------------------------------------------------------------------------
-- Task 1b: created_by defaults to auth.uid() -- create_appointment() below never sets it
-- explicitly, relying on this default the same way patient_payments.created_by already does.
-- ---------------------------------------------------------------------------
alter table public.appointments alter column created_by set default auth.uid();

-- ---------------------------------------------------------------------------
-- Task 1c: composite index for the queue read (get_appointments() below, and the existing
-- day-sheet read in clinic-api.ts) -- clinic/branch/status is the filter, scheduled_at is the
-- sort.
-- ---------------------------------------------------------------------------
create index idx_appointments_queue on public.appointments (clinic_id, branch_id, status, scheduled_at);

-- ---------------------------------------------------------------------------
-- Task 2a: create_appointment -- books an appointment ahead of time. SECURITY INVOKER (default,
-- no "security definer" here) so appointments_insert's own branch/patient/clinic ownership check
-- runs as the calling user, same rationale as create_visit_with_recall. clinic_id is never taken
-- from the caller -- always current_clinic_id() -- so a spoofed clinic_id argument is not even a
-- parameter this function accepts.
-- ---------------------------------------------------------------------------
create function public.create_appointment(
  p_patient_id uuid,
  p_scheduled_at timestamptz,
  p_branch_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_branch_id uuid;
  v_appointment_id uuid;
begin
  v_clinic_id := public.current_clinic_id();
  v_branch_id := coalesce(p_branch_id, public.current_branch_id());

  if v_branch_id is null then
    raise exception 'branch_id is required (caller has no default branch to fall back on)';
  end if;

  insert into public.appointments (clinic_id, branch_id, patient_id, scheduled_at, status, notes)
  values (v_clinic_id, v_branch_id, p_patient_id, p_scheduled_at, 'booked', p_notes)
  returning id into v_appointment_id;

  return v_appointment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Task 2b: get_appointments -- today's/upcoming booked appointments (not yet checked in) for the
-- caller's own RLS scope. Plain SQL function, SECURITY INVOKER by default -- appointments_select
-- and patients_select both apply exactly as if the caller queried the tables directly.
-- ---------------------------------------------------------------------------
create function public.get_appointments()
returns table (
  appointment_id uuid,
  patient_id uuid,
  patient_name text,
  patient_mobile text,
  branch_id uuid,
  scheduled_at timestamptz,
  notes text
)
language sql
stable
set search_path = public
as $$
  select
    a.id as appointment_id,
    a.patient_id,
    p.name as patient_name,
    p.mobile as patient_mobile,
    a.branch_id,
    a.scheduled_at,
    a.notes
  from public.appointments a
  join public.patients p on p.id = a.patient_id
  where a.status = 'booked'
  order by a.scheduled_at asc;
$$;

-- ---------------------------------------------------------------------------
-- Task 2c: check_in_appointment -- moves a booked appointment into the SAME queue the walk-in
-- flow uses (status='waiting'), bumping checked_in_at/scheduled_at to now() so it sorts into
-- today's queue regardless of how far in advance it was originally booked; the original booked
-- time survives in activity_log via the existing log_activity audit trigger (old/new snapshot).
-- The `and status = 'booked'` guard makes this a no-op transition-check as well as an ownership
-- check: RLS blocking a cross-clinic id and an already-checked-in/cancelled id both surface as
-- the same "0 rows" result, turned into one exception below rather than silently doing nothing.
-- ---------------------------------------------------------------------------
create function public.check_in_appointment(p_appointment_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_rows integer;
begin
  update public.appointments
  set status = 'waiting',
      checked_in_at = now(),
      scheduled_at = now(),
      updated_at = now()
  where id = p_appointment_id
    and status = 'booked';

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'appointment not found or not in booked state';
  end if;

  return p_appointment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Task 2d: mark_appointment_no_show -- same ownership-check-via-row-count pattern as
-- check_in_appointment above.
-- ---------------------------------------------------------------------------
create function public.mark_appointment_no_show(p_appointment_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_rows integer;
begin
  update public.appointments
  set status = 'no_show',
      updated_at = now()
  where id = p_appointment_id
    and status = 'booked';

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'appointment not found or not in booked state';
  end if;

  return p_appointment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Task 3: grants. A brand new function gets Postgres's own default PUBLIC EXECUTE grant
-- regardless of this project's ALTER DEFAULT PRIVILEGES revoke (confirmed stray-grant behavior in
-- prior phases) -- revoke it explicitly per function, then grant only to authenticated.
-- ---------------------------------------------------------------------------
revoke execute on function public.create_appointment(uuid, timestamptz, uuid, text) from public;
grant execute on function public.create_appointment(uuid, timestamptz, uuid, text) to authenticated;

revoke execute on function public.get_appointments() from public;
grant execute on function public.get_appointments() to authenticated;

revoke execute on function public.check_in_appointment(uuid) from public;
grant execute on function public.check_in_appointment(uuid) to authenticated;

revoke execute on function public.mark_appointment_no_show(uuid) from public;
grant execute on function public.mark_appointment_no_show(uuid) to authenticated;
