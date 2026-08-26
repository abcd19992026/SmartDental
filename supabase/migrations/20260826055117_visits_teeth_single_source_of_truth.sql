-- Phase 15A (teeth part): make `teeth` the single source of truth for tooth numbers on visits.
--
-- tooth_numbers stays as a column (existing read paths still use it as a display fallback), but
-- its value is now ALWAYS derived from `teeth` by this trigger -- whatever any caller (the
-- create_visit_with_recall RPC, ConsultationPage's direct update, the retired AddVisitModal)
-- sends for tooth_numbers is silently overridden. The two columns can no longer disagree.
--
-- Deliberately a trigger and not a generated column: tooth_numbers already exists with data and
-- is written by live code paths; converting it to GENERATED would require dropping and recreating
-- the column, breaking those writes.

create or replace function public.sync_visit_tooth_numbers()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.teeth is null or array_length(new.teeth, 1) is null then
    new.tooth_numbers := null;
  else
    new.tooth_numbers := array_to_string(new.teeth, ', ');
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_visit_tooth_numbers() from public;

drop trigger if exists trg_sync_visit_tooth_numbers on public.visits;

create trigger trg_sync_visit_tooth_numbers
before insert or update on public.visits
for each row
execute function public.sync_visit_tooth_numbers();
