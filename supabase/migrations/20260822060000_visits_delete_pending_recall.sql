-- Phase 6A follow-up: cleans up a visit's recall on visit deletion, but only when nothing has
-- happened to it yet. A 'pending' recall has never been communicated to anyone, so deleting it
-- loses nothing. Any other status (sent, contacted, booked, completed, declined, failed, paused)
-- means either a message went out or staff made an explicit decision -- that history is real
-- patient communication history and must survive. Those keep the existing FK behaviour
-- (recalls.visit_id ON DELETE SET NULL): the recall stays, just loses its visit link. Part 1
-- (visits!inner in send-recall-messages) is what stops a null-visit recall from being re-sent;
-- this trigger is what stops a never-sent one from lingering as dead weight in the queue at all.
--
-- 'paused' is deliberately NOT included even though a paused recall was also never sent: pausing
-- is an explicit staff decision to hold it (matching the "staff made a decision" case), not an
-- untouched pending state -- if this reasoning should extend to paused recalls too, that's a
-- product call, not something to fold in silently here.
--
-- BEFORE DELETE, not AFTER: the FK's own ON DELETE SET NULL action nulls recalls.visit_id as part
-- of the same statement's referential-integrity enforcement. A BEFORE trigger runs first, while
-- recalls.visit_id still equals OLD.id, so `where visit_id = old.id` actually finds the row. An
-- AFTER trigger would often find nothing left to match, since the FK's own SET NULL may already
-- have fired by then.
create or replace function public.delete_pending_recall_on_visit_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.recalls
  where visit_id = old.id
    and status = 'pending';

  return old;
end;
$$;

create trigger visits_delete_pending_recall
  before delete on public.visits
  for each row execute function public.delete_pending_recall_on_visit_delete();
