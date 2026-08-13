-- SECURITY DEFINER helpers used inside every RLS policy instead of inline subqueries on
-- profiles. A policy on `profiles` that reads `profiles` inline recurses (Postgres evaluates
-- the policy, which runs the subquery, which re-triggers the same policy). SECURITY DEFINER
-- functions run as their owner (the migration role, which owns every table it creates in a
-- Supabase project), so table ownership bypasses RLS for the internal read and the recursion
-- never happens. `search_path` is pinned to guard against search-path hijacking (Supabase
-- advisory 0011_function_search_path_mutable).
--
-- All four filter on is_active so a deactivated user loses data access immediately, not just
-- when their JWT eventually expires.
--
-- Note: this function is deliberately NOT named current_role() -- CURRENT_ROLE is a reserved
-- SQL keyword/niladic function in PostgreSQL's grammar and `create function current_role()`
-- fails at migration time.

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and is_active
  );
$$;

create or replace function public.current_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select clinic_id from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.current_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id from public.profiles where id = auth.uid() and is_active;
$$;

revoke all on function public.is_super_admin() from public;
revoke all on function public.current_clinic_id() from public;
revoke all on function public.current_user_role() from public;
revoke all on function public.current_branch_id() from public;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.current_clinic_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_branch_id() to authenticated;
