-- Phase 7A Step 1: structured tooth storage. tooth_numbers stays for now (dropped in a later
-- phase once nothing reads it) -- this is additive only.
--
-- CHECK can't contain a subquery, so the valid-FDI-number set is spelled out explicitly via array
-- containment. Deciduous teeth (51-85) are included even though the UI starts adult-only:
-- paediatric patients are common in an Indian dental practice, and widening this CHECK later
-- means another migration against live clinical data -- 20 extra integers now costs nothing.
alter table public.visits add column teeth integer[];

alter table public.visits add constraint visits_teeth_valid_fdi check (
  teeth is null or teeth <@ array[
    11,12,13,14,15,16,17,18,
    21,22,23,24,25,26,27,28,
    31,32,33,34,35,36,37,38,
    41,42,43,44,45,46,47,48,
    51,52,53,54,55,
    61,62,63,64,65,
    71,72,73,74,75,
    81,82,83,84,85
  ]::integer[]
);
