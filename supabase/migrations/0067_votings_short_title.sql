-- 0067_votings_short_title.sql
-- Plain-Polish short_title for votings. Citizen UI gets readable headlines
-- instead of raw "Pkt. 5 Pierwsze czytanie rządowego projektu ustawy o
-- zmianie ustawy - Prawo oświatowe..." chunks.
--
-- Source preference (set by enricher):
--   print_main → linked print's short_title via voting_print_links role='main'
--   llm        → gemma3:e4b plain-text generation
--   manual     → editorial override
--
-- 120 char cap matches prints.short_title cap. CHECK enforces the source
-- enum so we can audit/filter without a separate enum type.

alter table votings
  add column if not exists short_title text,
  add column if not exists short_title_source text,
  add column if not exists short_title_enriched_at timestamptz,
  add column if not exists short_title_model text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'votings_short_title_length'
      and conrelid = 'votings'::regclass
  ) then
    alter table votings
      add constraint votings_short_title_length
      check (short_title is null or char_length(short_title) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'votings_short_title_source_enum'
      and conrelid = 'votings'::regclass
  ) then
    alter table votings
      add constraint votings_short_title_source_enum
      check (short_title_source is null
             or short_title_source in ('print_main','llm','manual'));
  end if;
end $$;

create index if not exists votings_short_title_pending_idx
  on votings (id)
  where short_title is null;
