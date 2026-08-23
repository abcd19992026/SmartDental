-- Phase 7A Step 4: GIN index on teeth -- what makes "every visit on tooth 25 for this patient"
-- fast, the main reason for storing teeth as structured data instead of text in the first place.
create index idx_visits_teeth on public.visits using gin (teeth);
