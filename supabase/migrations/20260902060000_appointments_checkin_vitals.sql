-- Phase 17A: capture optional vitals (weight/BP/SpO2/chief complaint/past dental history) at
-- appointment check-in ("Patient Arrived"), so the doctor's Consultation page "1. Today's Status"
-- section can be pre-filled once they open the visit -- but a visit doesn't exist yet at check-in
-- time (createVisitWithRecall creates it later, when the doctor actually starts the
-- consultation). appointments.checked_in_at/status already carry this kind of transient,
-- one-per-appointment lifecycle data directly on the row (Phase 14A/16A) -- five more nullable
-- staging columns is the same pattern, not a new one. A separate staging table was considered and
-- rejected: the relationship is strictly 1:1 (one appointment, at most one check-in capture), so
-- it would only add four RLS policies that duplicate appointments_insert/update's existing
-- branch-ownership WITH CHECK for zero benefit -- these columns inherit that protection for free.
-- Column names mirror prescriptions.weight/blood_pressure/spo2/chief_complaint/past_dental_history
-- exactly (confirmed live against the actual table, not assumed) -- same field, same name,
-- wherever it's stored.
alter table public.appointments add column checkin_weight text;
alter table public.appointments add column checkin_blood_pressure text;
alter table public.appointments add column checkin_spo2 text;
alter table public.appointments add column checkin_chief_complaint text;
alter table public.appointments add column checkin_past_dental_history text;

-- Adding parameters changes arity -- CREATE OR REPLACE would silently create a second overload
-- (the Phase 6A/S1 trap), so the existing 1-arg signature is dropped explicitly first.
drop function public.check_in_appointment(uuid);

-- p_appointment_id stays first; the five vitals are added after, all optional with a null
-- default, so any existing caller that only passes p_appointment_id keeps working unchanged.
-- Still SECURITY INVOKER (no "security definer" here) with search_path pinned -- same rationale
-- as before: appointments_update's own RLS (branch/clinic ownership) applies exactly as if the
-- caller ran this UPDATE directly. nullif(btrim(...), '') normalizes a blank string to NULL at
-- write time (rather than trusting every future caller, including Gemini's Phase 17B frontend
-- code, to never send '' for an empty field) -- so "blank" always reads back as NULL, never as an
-- empty string, on whichever path later checks whether a field was filled in.
create function public.check_in_appointment(
  p_appointment_id uuid,
  p_weight text default null,
  p_blood_pressure text default null,
  p_spo2 text default null,
  p_chief_complaint text default null,
  p_past_dental_history text default null
)
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
      updated_at = now(),
      checkin_weight = nullif(btrim(p_weight), ''),
      checkin_blood_pressure = nullif(btrim(p_blood_pressure), ''),
      checkin_spo2 = nullif(btrim(p_spo2), ''),
      checkin_chief_complaint = nullif(btrim(p_chief_complaint), ''),
      checkin_past_dental_history = nullif(btrim(p_past_dental_history), '')
  where id = p_appointment_id
    and status = 'booked';

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'appointment not found or not in booked state';
  end if;

  return p_appointment_id;
end;
$$;

revoke execute on function public.check_in_appointment(uuid, text, text, text, text, text) from public;
grant execute on function public.check_in_appointment(uuid, text, text, text, text, text) to authenticated;
