-- Replies Waiting visibility must be independent of recalls.status: dismissing a reply was
-- previously implemented by setting status='declined' (reusing the "Not Interested" handler),
-- which permanently removed the recall from status='contacted' -- including from any FUTURE
-- reply, since the webhook deliberately never auto-reopens a declined/booked/etc. recall (that's
-- a staff decision, not something a stray reply should silently undo). Tracking dismissal against
-- the specific reply instead: a card is showable whenever reply_received_at is newer than
-- reply_dismissed_at (or dismissed_at is null), regardless of what recalls.status happens to be.
alter table public.recalls
  add column reply_received_at timestamptz,
  add column reply_dismissed_at timestamptz;
