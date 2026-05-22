-- 0103_statement_primary_print.sql
--
-- Attribute each proceeding_statement to ONE specific print — the draft
-- that the speaker was actually debating, not just one they cited.
-- Distinct from statement_print_links (many-to-many) which catalogues
-- every reference. Powers:
--   * /tygodnik print top_quote: one statement claimed by one card
--   * /proces/[term]/[number]: "all wypowiedzi z dyskusji o TEJ ustawie"
--
-- NULL semantics:
--   * statement is procedural (Marshal, sekretarz, technical motion)
--   * statement is in a pure-debate agenda item with no linked drafts
--   * not yet enriched (term < 10 or sittings < 55 backfill scope)
--
-- Populated by supagraf/enrich/statement_primary_print.py:
--   1. agenda_item-linked + single-print → assign deterministically
--   2. agenda_item-linked + multi-print → deepseek-flash picks main draft

begin;

alter table proceeding_statements
  add column if not exists primary_print_id bigint
    references prints(id) on delete set null;

-- Tygodnik feed queries top_quote per print; /proces detail queries
-- statements per print — both filter by primary_print_id directly.
create index if not exists proceeding_statements_primary_print_idx
  on proceeding_statements(primary_print_id)
  where primary_print_id is not null;

comment on column proceeding_statements.primary_print_id is
  'The single print this statement primarily debates, NOT a list of mentions. NULL = procedural / pure-debate / pre-backfill. Populated by supagraf.enrich.statement_primary_print: single-print agenda items assigned deterministically; multi-print joint debates disambiguated by deepseek-flash.';

commit;
