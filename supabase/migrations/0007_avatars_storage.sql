-- ============================================================================
-- 0007_avatars_storage.sql — Storage bucket for profile avatars
-- Public-read bucket so <img src> works without signed URLs; writes are scoped
-- to the owner by folder convention: objects live at `<auth.uid()>/<file>`.
-- profiles.avatar_url stores the resulting public URL (see ProfileForm upload).
-- ============================================================================

-- Public bucket (read is open; RLS below still gates writes).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- RLS on storage.objects is enabled by default on Supabase. Scope avatar writes
-- to the uploader's own folder; anyone may read (bucket is public anyway).
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars owner insert" on storage.objects;
create policy "avatars owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
