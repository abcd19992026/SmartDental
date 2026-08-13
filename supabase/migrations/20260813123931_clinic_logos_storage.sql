-- Root cause of the logo-upload bug: this bucket never existed, so every upload failed. The
-- existing frontend code (src/features/clinic/settings/ClinicProfileTab.tsx) currently targets a
-- DIFFERENT bucket name ("clinic-assets") and a flat "logos/" folder with clinic_id as a
-- filename prefix rather than a folder segment -- that path shape can't be scoped per-clinic with
-- a clean storage.foldername() policy. This bucket is named and structured as specified
-- (clinic-logos, {clinic_id}/{filename}); the frontend needs a small follow-up change to match
-- (bucket name + path + removing its silent base64 fallback on upload error, which currently
-- masks failures -- including a real RLS rejection -- as a false "success"). Flagged separately,
-- not applied here -- this migration is the storage/RLS side only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinic-logos', 'clinic-logos', true, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public bucket serves reads without needing this policy in practice, but it's added explicitly
-- so read access doesn't silently depend on that bucket-level flag alone.
create policy clinic_logos_public_read on storage.objects
  for select using (bucket_id = 'clinic-logos');

-- Write access: only the clinic's own active owner, to a path scoped to their own clinic_id
-- (path shape: {clinic_id}/{filename} -- storage.foldername(name) returns the path segments
-- excluding the filename itself, so (storage.foldername(name))[1] is the clinic_id folder).
-- super_admin bypasses this, consistent with every other RLS policy in this schema.
create policy clinic_logos_owner_insert on storage.objects
  for insert
  with check (
    bucket_id = 'clinic-logos'
    and (
      public.is_super_admin()
      or (
        public.current_user_role() = 'owner'
        and (storage.foldername(name))[1] = public.current_clinic_id()::text
      )
    )
  );

create policy clinic_logos_owner_update on storage.objects
  for update
  using (
    bucket_id = 'clinic-logos'
    and (
      public.is_super_admin()
      or (
        public.current_user_role() = 'owner'
        and (storage.foldername(name))[1] = public.current_clinic_id()::text
      )
    )
  )
  with check (
    bucket_id = 'clinic-logos'
    and (
      public.is_super_admin()
      or (
        public.current_user_role() = 'owner'
        and (storage.foldername(name))[1] = public.current_clinic_id()::text
      )
    )
  );

create policy clinic_logos_owner_delete on storage.objects
  for delete
  using (
    bucket_id = 'clinic-logos'
    and (
      public.is_super_admin()
      or (
        public.current_user_role() = 'owner'
        and (storage.foldername(name))[1] = public.current_clinic_id()::text
      )
    )
  );
