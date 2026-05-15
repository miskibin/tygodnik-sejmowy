-- 0094_statement_print_links_align_0060.sql
--
-- `statement_print_links` was first created by migration 0047 with the
-- minimal shape `(statement_id, print_id, source, created_at)`. Migration
-- 0060 redefined the table to add `confidence` + `agenda_item_id`, change
-- the source CHECK to ('agenda','mention'), and widen the PK to include
-- `source` — but 0060 uses `create table if not exists`, so on databases
-- where 0047 had already run those changes were silently skipped.
--
-- The backfill in `supagraf/backfill/etl_review.py:backfill_statement_print_links`
-- assumes the 0060 shape. Without this migration the upsert fails with
-- PGRST204 "Could not find the 'agenda_item_id' column …".
--
-- This migration ALTERs the deployed table to match 0060's spec exactly.
-- Idempotent: every step is `if not exists` / guarded so re-runs are no-ops.
-- Empty table in prod, so the PK swap is safe.

begin;

-- 1. Add the two missing columns.
alter table statement_print_links
  add column if not exists confidence numeric not null default 1.0;

alter table statement_print_links
  add column if not exists agenda_item_id bigint
  references agenda_items(id) on delete set null;

-- 2. Tighten the confidence range to 0060's CHECK (0,1]. Guard so re-runs
--    don't blow up on the duplicate constraint name.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'statement_print_links_confidence_check'
  ) then
    alter table statement_print_links
      add constraint statement_print_links_confidence_check
      check (confidence > 0 and confidence <= 1);
  end if;
end$$;

-- 3. Swap the PK from (statement_id, print_id) to (statement_id, print_id,
--    source). Required so the same statement+print can co-exist under both
--    sources (agenda-anchored + body-mention). Table is empty in prod so
--    no row collisions to worry about.
do $$
declare
  pk_name text;
begin
  select conname into pk_name
    from pg_constraint
   where conrelid = 'statement_print_links'::regclass
     and contype  = 'p';
  if pk_name is not null then
    execute format('alter table statement_print_links drop constraint %I', pk_name);
  end if;
end$$;

alter table statement_print_links
  add primary key (statement_id, print_id, source);

-- 4. Widen the `source` CHECK to accept BOTH the 0047 vocabulary
--    ('agenda_item','title_regex','manual') and the 0060 vocabulary
--    ('agenda','mention'). The current backfill emits 0047 names so we
--    keep them valid; future code can migrate to 0060 names without
--    another DDL pass.
do $$
declare
  c text;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'statement_print_links'::regclass
       and contype  = 'c'
       and conname like '%source%'
  loop
    execute format('alter table statement_print_links drop constraint %I', c);
  end loop;
end$$;

alter table statement_print_links
  add constraint statement_print_links_source_check
  check (source in ('agenda_item','title_regex','manual','agenda','mention'));

-- 5. Indexes promised by 0060 (idempotent).
create index if not exists statement_print_links_statement_idx
  on statement_print_links(statement_id);
create index if not exists statement_print_links_source_idx
  on statement_print_links(source);

comment on table statement_print_links is
  'Speech-to-print links with provenance. source=agenda_item: derived from proceeding_day -> agenda_items -> agenda_item_prints, narrowed by body_text "Pkt. NN" ordinal (confidence 0.95). source=title_regex: regex "druk(i) nr X" hit on body_text (confidence 0.7). source=manual: operator override. Backfill via supagraf.backfill.etl_review.backfill_statement_print_links.';

commit;
