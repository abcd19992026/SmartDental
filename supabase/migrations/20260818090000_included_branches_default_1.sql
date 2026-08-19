-- New clinics start with 1 branch (matching included_receptionists' existing default of 1), not
-- 2 -- extra capacity is a paid upgrade a platform operator unlocks per clinic, not a free
-- starting allowance. Only changes the column default for future inserts; existing clinic rows
-- keep whatever included_branches value they already have.
alter table public.clinics
  alter column included_branches set default 1;
