-- 0058_promises_diacritics_restored_at.sql
-- Legacy promise corpus was ASCII-folded (no Polish diacritics) before B5.
-- Mark when an LLM restoration pass has run on each row so the backfill
-- is idempotent. NULL = pending; non-null = already restored.

alter table promises add column if not exists diacritics_restored_at timestamptz;
create index if not exists promises_diacritics_pending_idx
  on promises(id)
  where diacritics_restored_at is null;
