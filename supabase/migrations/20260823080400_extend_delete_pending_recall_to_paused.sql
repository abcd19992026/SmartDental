-- Phase 7A Step 5: extends visits_delete_pending_recall's trigger function to also delete a
-- 'paused' recall, not just 'pending'.
--
-- Mechanical reason, confirmed against the actual code before making this change (both
-- TodayPage.tsx and PatientsPage.tsx's handleTogglePause set status back to 'pending' on
-- un-pause, nothing else): a paused recall survives a visit deletion with visit_id set to null
-- (the FK's SET NULL). If staff later un-pause it, it returns to 'pending' -- but the
-- visits!inner join added in the 6A follow-up (Part 1) means a null-visit_id recall is never
-- selected by send-recall-messages again. It would sit 'pending' forever: inflating the Recalls
-- Due count and never resolving, never sending, never failing loudly enough to notice.
create or replace function public.delete_pending_recall_on_visit_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.recalls
  where visit_id = old.id
    and status in ('pending', 'paused');

  return old;
end;
$$;
