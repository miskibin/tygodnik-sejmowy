-- 0075_acts_short_title.sql
-- Plain-Polish short_title for ELI acts. Tygodnik "WCHODZI W ŻYCIE" card
-- currently dumps the full ceremonial title (e.g. "Obwieszczenie Marszałka
-- Sejmu Rzeczypospolitej Polskiej z dnia 30 kwietnia 2026 r. w sprawie
-- ogłoszenia jednolitego tekstu ustawy o krajowym systemie ewidencji
-- producentów..."), ~5 lines wide. Mirrors votings.short_title from 0067.
--
-- Source enum:
--   llm    — deepseek-v4-flash rewrite of acts.title (primary path; no PDF)
--   manual — editorial override
--
-- Note: a 'print_main' fast-path is intentionally NOT shipped — acts.processes
-- linkage goes via process_stages (multi-print, no "main" marker), and
-- Obwieszczenia/MP entries lack any sejm print anyway. LLM-only keeps the
-- pipeline trivial and uniformly covered.

alter table acts
  add column if not exists short_title text,
  add column if not exists short_title_source text,
  add column if not exists short_title_enriched_at timestamptz,
  add column if not exists short_title_model text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'acts_short_title_length'
      and conrelid = 'acts'::regclass
  ) then
    alter table acts
      add constraint acts_short_title_length
      check (short_title is null or char_length(short_title) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'acts_short_title_source_enum'
      and conrelid = 'acts'::regclass
  ) then
    alter table acts
      add constraint acts_short_title_source_enum
      check (short_title_source is null
             or short_title_source in ('llm','manual'));
  end if;
end $$;

create index if not exists acts_short_title_pending_idx
  on acts (id)
  where short_title is null;
