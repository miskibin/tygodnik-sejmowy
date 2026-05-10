-- ============================================================================
-- 0035_mp_photos.sql — MP photo URLs for Twój poseł hero.
-- MVP: store the public api.sejm.gov.pl URL directly (no Supabase Storage
-- bucket — let frontend hot-link). Operator can switch to bucket later by
-- updating photo_url + adding photo_blob_path column.
-- ============================================================================

alter table mps
  add column if not exists photo_url text,
  add column if not exists photo_fetched_at timestamptz;

-- Pending = photo not yet checked
create index if not exists mps_photo_pending_idx
  on mps (id) where photo_fetched_at is null;
