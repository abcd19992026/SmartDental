-- Phase 16A addendum-2: real testing found the previous version (20260831060000) wrongly failed
-- a legitimate booking whenever p_recall_id happened to point at a recall already in a terminal
-- state (completed/declined) or already booked by an earlier call -- e.g. a patient replied,
-- that reply's recall had already been marked completed/declined by something else, and the
-- receptionist's booking then errored out entirely even though the booking itself was perfectly
-- valid. The recall-flip is a best-effort cleanup side effect, not something a booking should
-- ever depend on succeeding -- the ONLY thing that can still fail this function is a missing
-- branch. Signature is unchanged (CREATE OR REPLACE is safe -- same arity, this is a body-only
-- change), still SECURITY INVOKER with search_path pinned.
create or replace function public.create_appointment(
  p_patient_id uuid,
  p_scheduled_at timestamptz,
  p_branch_id uuid default null,
  p_notes text default null,
  p_recall_id uuid default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_branch_id uuid;
  v_appointment_id uuid;
  v_link_recall uuid := null;
  v_recall_status text;
begin
  v_clinic_id := public.current_clinic_id();
  v_branch_id := coalesce(p_branch_id, public.current_branch_id());

  if v_branch_id is null then
    raise exception 'branch_id is required (caller has no default branch to fall back on)';
  end if;

  -- Recall handling never raises. SECURITY INVOKER means this SELECT runs under the caller's own
  -- RLS (recalls_select) -- a cross-clinic p_recall_id simply returns no row here, same as
  -- querying it directly ever would; that is treated as "don't link it", not an error, so a
  -- receptionist fat-fingering or racing a recall id can never take the whole booking down with
  -- it. notes is deliberately never written -- that column is webhook-only.
  if p_recall_id is not null then
    select status into v_recall_status from public.recalls where id = p_recall_id;

    if found then
      v_link_recall := p_recall_id;

      if v_recall_status not in ('completed', 'declined', 'booked') then
        update public.recalls
        set status = 'booked',
            updated_at = now()
        where id = p_recall_id;
      end if;
    end if;
  end if;

  insert into public.appointments (clinic_id, branch_id, patient_id, scheduled_at, status, notes, recall_id)
  values (v_clinic_id, v_branch_id, p_patient_id, p_scheduled_at, 'booked', p_notes, v_link_recall)
  returning id into v_appointment_id;

  return v_appointment_id;
end;
$$;
