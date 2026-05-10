-- 0060_cross_entity_links.sql
-- Cross-entity wiring used by frontend voting/speech lists:
--   * voting_stage_summary  view  : per voting, canonical stage_type +
--     primary print + process via voting_print_links role priority.
--   * voting_row_context    view  : joins summary with prints/processes for
--     a single-row payload (stage_type, print_short_title, process_title).
--   * statement_print_links table : speech -> print, with provenance
--     ('agenda' = derived via proceeding_day -> agenda_items -> agenda_item_prints
--      with body_text "Pkt. NN" ordinal narrowing; 'mention' = body_text
--      "druk(i) nr X" regex hit). Frontend renders chips per source.
--
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE).

begin;

-- =========================================================================
-- 1. voting_stage_summary
--    Per voting, the canonical stage_type + primary print_id + process_id.
--    Role priority handles multi-print votings (sprawozdanie > main > joint
--    > poprawka > autopoprawka > other). Ties broken by max sitting_num so
--    the most-recent stage wins, matching print_sitting_assignment (mig 0059).
-- =========================================================================
create or replace view voting_stage_summary as
with link_priority as (
  select
    vpl.voting_id,
    vpl.print_id,
    vpl.role,
    case vpl.role
      when 'sprawozdanie' then 1
      when 'main'         then 2
      when 'joint'        then 3
      when 'poprawka'     then 4
      when 'autopoprawka' then 5
      else 9
    end as role_rank
  from voting_print_links vpl
),
-- For each (voting, print) pair, pick the most-recent process_stage tied to
-- that print (print_id FK on process_stages). NULL stage_type rows are
-- filtered so we don't surface useless badges.
stage_per_link as (
  select distinct on (lp.voting_id, lp.print_id)
    lp.voting_id,
    lp.print_id,
    lp.role,
    lp.role_rank,
    ps.stage_type,
    ps.sitting_num,
    ps.process_id
  from link_priority lp
  left join process_stages ps
    on ps.print_id = lp.print_id and ps.stage_type is not null
  order by lp.voting_id, lp.print_id, ps.sitting_num desc nulls last
)
select distinct on (voting_id)
  voting_id,
  print_id     as primary_print_id,
  role         as link_role,
  stage_type,
  process_id
from stage_per_link
order by voting_id, role_rank, sitting_num desc nulls last;

comment on view voting_stage_summary is
  'Per voting: canonical stage_type + primary print_id + process_id. Role priority sprawozdanie>main>joint>poprawka>autopoprawka, ties broken by max sitting_num.';

-- =========================================================================
-- 2. voting_row_context
--    Frontend voting-list payload. One row per voting that has a print
--    link. Frontend joins MP votes against this for stage badge / print
--    short_title / process title.
-- =========================================================================
create or replace view voting_row_context as
select
  vss.voting_id,
  vss.stage_type,
  vss.link_role,
  vss.primary_print_id,
  pr.term            as print_term,
  pr.number          as print_number,
  pr.short_title     as print_short_title,
  pr.title           as print_title,
  vss.process_id,
  pc.title           as process_title
from voting_stage_summary vss
left join prints pr on pr.id = vss.primary_print_id
left join processes pc on pc.id = vss.process_id;

comment on view voting_row_context is
  'Single-row context per voting for the frontend: stage_type + print short_title + process title. Joins voting_stage_summary with prints and processes.';

-- =========================================================================
-- 3. statement_print_links
--    Persisted (not view) so two sources with provenance can co-exist. PK
--    on (statement_id, print_id, source) — same statement-print pair can
--    be present from both 'agenda' (high-confidence structured) and
--    'mention' (regex on body_text) without conflict.
-- =========================================================================
create table if not exists statement_print_links (
  statement_id    bigint not null references proceeding_statements(id) on delete cascade,
  print_id        bigint not null references prints(id) on delete cascade,
  source          text   not null check (source in ('agenda','mention')),
  confidence      numeric not null default 1.0 check (confidence > 0 and confidence <= 1),
  agenda_item_id  bigint references agenda_items(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (statement_id, print_id, source)
);

create index if not exists statement_print_links_statement_idx
  on statement_print_links(statement_id);
create index if not exists statement_print_links_print_idx
  on statement_print_links(print_id);
create index if not exists statement_print_links_source_idx
  on statement_print_links(source);

comment on table statement_print_links is
  'Speech-to-print links with provenance. source=agenda: derived from proceeding_day -> agenda_items -> agenda_item_prints, narrowed by body_text "Pkt. NN" ordinal. source=mention: regex "druk(i) nr X" hit on body_text. Backfill via supagraf.backfill.statement_print_links.';

commit;
