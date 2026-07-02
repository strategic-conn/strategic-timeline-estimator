-- ============================================================================
-- 0011_avatar_bucket_limits.sql — server-side guards on the avatars bucket
-- The upload UI already checks type/size, but that's client-side only. Enforce
-- it at the storage layer so a crafted direct upload can't drop huge or
-- non-image files into the bucket.
-- ============================================================================

update storage.buckets
set
  file_size_limit = 5242880, -- 5 MB
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
where id = 'avatars';
