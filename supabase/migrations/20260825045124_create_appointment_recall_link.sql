-- Phase 16A addendum: booking an appointment from a "Replies Waiting" recall row must mark that
-- recall actioned in the same transaction, or the recall ladder can still send a follow-up
-- WhatsApp message to a patient who already booked, and the row never leaves the Replies Waiting
-- list on refresh. appointments.recall_id already exists for exactly this link (FK to recalls,
-- ON DELETE SET NULL) -- it was just never populated by create_appointment().
--
-- Adding a parameter changes arity -- CREATE OR REPLACE would silently create a SECOND overload
-- (the exact Phase 6A/S1 trap), so the existing 4-arg signature is dropped explicitly first.

drop function public.create_appointment(uuid, timestamptz, uuid, text);

-- p_recall_id is added LAST (with a default) so it stays optional -- every existing caller that
-- doesn't know about recalls keeps working unchanged (Backward-compat test in verification).
-- Still SECURITY INVOKER (no "security definer" here) with search_path pinned -- unchanged
-- rationale from the original function: both the recalls UPDATE and the appointments INSERT run
-- under the calling user's own RLS, so a cross-clinic recall_id or a spoofed clinic_id are not
-- reachable via this function any more than they were via direct table access.
create function public.create_appointment(
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
  v_rows integer;
begin
  v_clinic_id := public.current_clinic_id();
  v_branch_id := coalesce(p_branch_id, public.current_branch_id());

  if v_branch_id is null then
    raise exception 'branch_id is required (caller has no default branch to fall back on)';
  end if;

  -- Mark the recall actioned BEFORE inserting the appointment, in the same implicit transaction
  -- as this function call -- if this update is blocked (cross-clinic, not found, or already in a
  -- terminal 'declined'/'completed' state) the raise below aborts the whole call, so the
  -- appointment is never created orphaned from a recall_id that didn't actually get updated.
  -- recalls_update RLS applies as normal (SECURITY INVOKER) -- a cross-clinic recall_id yields 0
  -- rows here, not an error, which is why the row-count check below is what turns that into a
  -- raised exception. notes is deliberately never written here -- that column is webhook-only.
  if p_recall_id is not null then
    update public.recalls
    set status = 'booked',
        updated_at = now()
    where id = p_recall_id
      and status not in ('declined', 'completed');

    get diagnostics v_rows = row_count;

    if v_rows = 0 then
      raise exception 'recall not found or not accessible';
    end if;
  end if;

  insert into public.appointments (clinic_id, branch_id, patient_id, scheduled_at, status, notes, recall_id)
  values (v_clinic_id, v_branch_id, p_patient_id, p_scheduled_at, 'booked', p_notes, p_recall_id)
  returning id into v_appointment_id;

  return v_appointment_id;
end;
$$;

revoke execute on function public.create_appointment(uuid, timestamptz, uuid, text, uuid) from public;
grant execute on function public.create_appointment(uuid, timestamptz, uuid, text, uuid) to authenticated;
