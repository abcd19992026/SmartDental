-- Phase 7A Step 2: backfill teeth from tooth_numbers. Parses comma/space-separated tokens,
-- deduplicates and sorts. A row's tooth_numbers value is left entirely alone (teeth stays null)
-- if ANY token in it fails to parse as a valid FDI number -- a partial/guessed backfill is worse
-- than no backfill at all for clinical data.
update public.visits
set teeth = (
  select array_agg(distinct n order by n)
  from unnest(
    array(
      select trim(part)::integer
      from unnest(regexp_split_to_array(trim(tooth_numbers), '[,\s]+')) as part
      where trim(part) <> ''
    )
  ) as n
)
where tooth_numbers is not null
  and trim(tooth_numbers) <> ''
  and not exists (
    select 1
    from unnest(regexp_split_to_array(trim(tooth_numbers), '[,\s]+')) as part
    where trim(part) <> ''
      and (
        trim(part) !~ '^[0-9]+$'
        or trim(part)::integer not in (
          11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,
          31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48,
          51,52,53,54,55,61,62,63,64,65,71,72,73,74,75,81,82,83,84,85
        )
      )
  );
