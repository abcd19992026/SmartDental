-- Phase 6A Step 1: per-visit discount and a derived, tamper-proof net amount.
--
-- discount_percent is staff-entered (0-100). net_amount is GENERATED ALWAYS ... STORED rather
-- than computed by a trigger or in application code, specifically so it can never drift from
-- amount/discount_percent -- Postgres recomputes it on every write and rejects any attempt to
-- write to it directly, so no client or future code path can ever leave it inconsistent.
--
-- visits.amount had no CHECK constraint at all before this migration (confirmed against the live
-- schema in Step 0) -- a negative amount was previously possible. amount is nullable, so the
-- generated expression coalesces it to 0 first; a plain `amount >= 0` check already passes
-- through NULL under standard SQL three-valued CHECK semantics, so no explicit "is null or" is
-- needed.

alter table public.visits
  add column discount_percent numeric(5,2) not null default 0,
  add constraint visits_discount_percent_check check (discount_percent >= 0 and discount_percent <= 100);

alter table public.visits
  add constraint visits_amount_check check (amount >= 0);

alter table public.visits
  add column net_amount numeric(10,2) generated always as (
    round(coalesce(amount, 0) - (coalesce(amount, 0) * discount_percent / 100), 2)
  ) stored;
