alter table public.profiles
  add column avatar_url text;

-- Gap check requested: today the ONLY update policy on profiles is profiles_owner_write, which
-- requires role = 'owner' -- a receptionist has no write policy on their own row at all (only
-- profiles_select_self / profiles_select_same_clinic, both select-only). So a receptionist could
-- not have set avatar_url even if it existed. This migration adds a self-update policy to close
-- that gap, scoped as tightly as the feature needs -- see the trigger below for how it's kept to
-- avatar_url only, not widened into a general self-write policy.
create policy profiles_self_update_avatar on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- protect_profile_role_fields() (Phase 1) previously blocked only role/clinic_id changes on a
-- self-edit, because until now 'owner' was the only role with any self-write policy at all
-- (profiles_owner_write), and role/clinic_id were the only self-escalation risk on that path.
-- Adding profiles_self_update_avatar above changes that: it's a second, independent UPDATE
-- policy (Postgres OR's multiple permissive policies together) that lets ANY user -- including
-- receptionists -- reach this same trigger for their own row. RLS can't restrict which COLUMNS a
-- policy covers, so without widening this trigger, a receptionist could now also self-edit
-- branch_id (branch-visibility escalation) or is_active (self-reactivating after being
-- deactivated by an owner/super_admin) through this same new policy.
--
-- Rather than list new columns to block, this switches to an allowlist: on a self-edit (not
-- super_admin), avatar_url is the ONLY column permitted to change. This is deliberately
-- conservative -- full_name/phone are blocked too, since the feature being added only needs
-- avatar_url and the instruction was not to widen beyond what's needed. It also incidentally
-- closes a latent gap that predates this migration: an owner editing their own row via
-- profiles_owner_write was never actually restricted to role/clinic_id either, so a deactivated
-- owner could previously have re-activated themselves. That's now blocked too.
create or replace function public.protect_profile_role_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  if auth.uid() = old.id and (
    new.role        is distinct from old.role
    or new.clinic_id is distinct from old.clinic_id
    or new.branch_id is distinct from old.branch_id
    or new.is_active is distinct from old.is_active
    or new.full_name is distinct from old.full_name
    or new.phone     is distinct from old.phone
  ) then
    raise exception 'You may only change your own avatar_url on your own profile';
  end if;

  return new;
end;
$$;

-- Same shape as clinic-logos (Phase 4), but keyed by auth.uid() instead of clinic_id, and with
-- no role restriction -- any authenticated user, including receptionists, manages their own
-- avatar folder only. Path convention: {user_id}/{timestamp}.{ext}.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-avatars', 'user-avatars', true, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy user_avatars_public_read on storage.objects
  for select using (bucket_id = 'user-avatars');

create policy user_avatars_own_insert on storage.objects
  for insert
  with check (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy user_avatars_own_update on storage.objects
  for update
  using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy user_avatars_own_delete on storage.objects
  for delete
  using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
