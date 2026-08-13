-- Per-clinic cap on active branches, mirroring included_receptionists exactly.
alter table public.clinics
  add column included_branches integer not null default 2;

-- Folded into the same billing-protection trigger that already guards
-- included_receptionists and the plan/expiry fields, rather than a second trigger.
create or replace function public.protect_clinic_billing_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  if new.plan_name                is distinct from old.plan_name
  or new.plan_started_on          is distinct from old.plan_started_on
  or new.plan_expires_on          is distinct from old.plan_expires_on
  or new.is_active                 is distinct from old.is_active
  or new.suspension_reason        is distinct from old.suspension_reason
  or new.monthly_message_quota    is distinct from old.monthly_message_quota
  or new.daily_message_cap        is distinct from old.daily_message_cap
  or new.onboarding_completed     is distinct from old.onboarding_completed
  or new.included_receptionists   is distinct from old.included_receptionists
  or new.included_branches        is distinct from old.included_branches
  then
    raise exception 'Only a platform administrator can change subscription fields';
  end if;

  return new;
end;
$$;

-- Branches were plain client CRUD under RLS (branches_owner_write, a single "for all" policy).
-- That's no longer sufficient once there's a cap to enforce: a SECURITY INVOKER RPC's own insert
-- runs under the exact same RLS policy as a direct client insert (RLS can't tell them apart), so
-- if the policy still allows an owner to INSERT directly, the cap is bypassable via a raw
-- supabase.from('branches').insert(...) call regardless of what create_branch does. Splitting the
-- policy: owner keeps direct UPDATE/DELETE (unaffected by this cap), but owner INSERT is removed
-- entirely -- only a SECURITY DEFINER function (create_branch, below) or super_admin can insert
-- a branch row now.
drop policy if exists branches_owner_write on public.branches;

create policy branches_owner_update on public.branches
  for update using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  )
  with check (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

create policy branches_owner_delete on public.branches
  for delete using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

create policy branches_super_admin_insert on public.branches
  for insert with check (public.is_super_admin());

-- The owner's self-service branch creation path. Deliberately SECURITY DEFINER, not INVOKER --
-- see the migration header comment above for why INVOKER can't satisfy "RPC-only, direct inserts
-- blocked" at the same time. Because DEFINER bypasses RLS, the authorization check that RLS would
-- normally provide is done explicitly here instead (same pattern already used by
-- is_super_admin()/current_clinic_id() and the rest of Phase 1's helper functions).
--
-- The onboarding wizard (create_clinic_with_branches, Phase 2) is deliberately NOT capped by
-- included_branches -- it's already SECURITY DEFINER, reachable only via the super-admin-only
-- create-clinic Edge Function, and the operator is setting the plan directly at that point, so
-- there's no meaningful limit to enforce yet. included_branches only binds the owner's own
-- self-service branch creation afterward, via this function.
create or replace function public.create_branch(
  p_clinic_id uuid,
  p_name text,
  p_address text default null,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role              text;
  v_clinic_id          uuid;
  v_included_branches  integer;
  v_active_count       integer;
  v_branch_id          uuid;
begin
  select role, clinic_id
    into v_role, v_clinic_id
  from public.profiles
  where id = auth.uid() and is_active;

  if v_role is distinct from 'owner' or v_clinic_id is distinct from p_clinic_id then
    raise exception 'Only the clinic''s own owner can create a branch';
  end if;

  select included_branches into v_included_branches
  from public.clinics
  where id = p_clinic_id;

  if v_included_branches is null then
    raise exception 'Clinic not found';
  end if;

  select count(*) into v_active_count
  from public.branches
  where clinic_id = p_clinic_id and is_active = true;

  if v_active_count >= v_included_branches then
    raise exception 'Branch limit reached (% of % used). Contact SmartDentist to add more branches.',
      v_active_count, v_included_branches;
  end if;

  insert into public.branches (clinic_id, name, address, phone)
  values (p_clinic_id, p_name, p_address, p_phone)
  returning id into v_branch_id;

  return v_branch_id;
end;
$$;

revoke all on function public.create_branch(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_branch(uuid, text, text, text) to authenticated;
