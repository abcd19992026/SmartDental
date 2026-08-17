-- The Super Admin WhatsApp tab's "set default template" write is two sequential client-side
-- updates (reset all templates for the clinic to is_default = false, then set the chosen one to
-- true) -- not atomic. Two overlapping saves (two tabs, a double-click, a retried request) can
-- interleave so that two different templates for the same clinic both end up is_default = true.
-- send-recall-messages' "load the clinic's default template" query uses .maybeSingle(), which
-- errors out on more than one match -- so a duplicate default doesn't silently pick the wrong
-- template, but it does silently stop that clinic's automated sending (logged as
-- "no_default_template", which is misleading about the real cause).
--
-- A partial unique index makes the bad state unreachable at the database level regardless of how
-- the two-step client write races: whichever UPDATE would create a second is_default = true row
-- for the same clinic_id fails outright with a unique-violation instead of succeeding.
create unique index idx_whatsapp_templates_one_default_per_clinic
  on public.whatsapp_templates (clinic_id)
  where is_default;
