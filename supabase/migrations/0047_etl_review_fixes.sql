-- 0047_etl_review_fixes.sql
-- Schema additions resolving ETL deep-diff review findings.
-- Idempotent: every statement uses IF NOT EXISTS / OR REPLACE / drop-recreate.
-- Backfill in Agent B; this migration only changes schema and (where noted)
-- backfills last_refreshed_at from existing timestamp columns.

begin;

-- =========================================================================
-- 1. voting_print_links  (BLOCKER #1)
--    Materialised link from votings to prints for "Ostatnie głosowanie
--    w sprawie tego druku". Source values:
--      'process_stage_json'  parsed from process_stages.voting jsonb
--      'voting_title_regex'  fallback regex on voting title ('druk nr X, Y')
--      'manual'              operator override
-- =========================================================================
create table if not exists voting_print_links (
  voting_id   bigint not null references votings(id) on delete cascade,
  print_id    bigint not null references prints(id)  on delete cascade,
  role        text not null check (role in (
    'main','autopoprawka','sprawozdanie','poprawka','joint','other'
  )),
  source      text not null check (source in (
    'process_stage_json','voting_title_regex','manual'
  )),
  created_at  timestamptz not null default now(),
  primary key (voting_id, print_id)
);

create index if not exists voting_print_links_print_idx
  on voting_print_links(print_id);
create index if not exists voting_print_links_voting_idx
  on voting_print_links(voting_id);

comment on table voting_print_links is
  'Materialised link from votings to prints. source=process_stage_json: parsed from process_stages.voting jsonb. source=voting_title_regex: parsed from voting title (e.g. "druk nr 123, 124"). source=manual: operator override. Frontend uses this for "Ostatnie głosowanie w sprawie tego druku".';

-- =========================================================================
-- 2. prints.opinion_source  (MAJOR #4)
--    Extracted (Agent B backfill) from sub-print titles like
--    "opinia SN do druku 2199" via regex.  Set of authority codes.
-- =========================================================================
alter table prints
  add column if not exists opinion_source text;

-- Drop & recreate the check so re-running the migration with a different
-- vocabulary stays idempotent.
alter table prints
  drop constraint if exists prints_opinion_source_check;
alter table prints
  add constraint prints_opinion_source_check check (
    opinion_source is null or opinion_source in (
      'BAS','SN','KRS','KRRP','NRA','NRL','NBP','PG','RPO','PKDP','OSR',
      'RDS','GUS','RDPP','HFPC','RM','RZAD','UODO','PRM','SLDO','UDSC',
      'WNIOSKODAWCA','SLR','OZZL','BRPO','SLDR','INNY'
    )
  );

create index if not exists prints_opinion_source_idx
  on prints(opinion_source) where opinion_source is not null;

comment on column prints.opinion_source is
  'Authority that issued an opinion-style sub-print, extracted by Agent B from titles like "opinia SN do druku 2199". NULL for non-opinion documents. See prints_opinion_source_check for the closed vocabulary.';

-- =========================================================================
-- 3. print_relationships.relation_type vocabulary expansion  (MAJOR #9)
--    Existing values: 'process','additional'.
--    Add: 'similar','prints_considered_jointly','amendment',
--         'autopoprawka','sprawozdanie_dodatkowe','opinia','osr','do_druku'.
-- =========================================================================
alter table print_relationships
  drop constraint if exists print_relationships_relation_type_check;
alter table print_relationships
  add constraint print_relationships_relation_type_check check (
    relation_type in (
      'process','additional','similar','prints_considered_jointly',
      'amendment','autopoprawka','sprawozdanie_dodatkowe',
      'opinia','osr','do_druku'
    )
  );

-- =========================================================================
-- 4. voting_by_club  (MINOR #13)
--    Per-voting per-club aggregates. Joins votings.date with the (term, mp_id)
--    -> club_id snapshot in mp_club_membership. NOTE: mp_club_membership in
--    this database is a flat (term, mp_id, club_id) snapshot without a
--    valid_from/valid_to validity window, so the join is by (term, mp_id).
--    votes.vote is an enum (yes/no/abstain/absent/excused).
--    clubs.club_id is the text business key; clubs.name is the display label.
-- =========================================================================
create or replace view voting_by_club as
select
  v.id                                                          as voting_id,
  v.term                                                        as term,
  c.id                                                          as club_id,
  c.club_id                                                     as club_short,
  c.name                                                        as club_name,
  count(*) filter (where vt.vote::text = 'yes')                 as yes,
  count(*) filter (where vt.vote::text = 'no')                  as no,
  count(*) filter (where vt.vote::text = 'abstain')             as abstain,
  count(*) filter (where vt.vote::text in ('absent','excused')) as not_voting,
  count(*)                                                      as total
from votings v
join votes vt
  on vt.voting_id = v.id
join mp_club_membership m
  on m.mp_id = vt.mp_id
 and m.term  = v.term
join clubs c
  on c.club_id = m.club_id
 and c.term    = m.term
group by v.id, v.term, c.id, c.club_id, c.name;

comment on view voting_by_club is
  'Per-voting per-club tally. Membership is the flat snapshot in mp_club_membership (no validity window). yes/no/abstain/not_voting reflect votes.vote enum.';

-- =========================================================================
-- 5. statement_url() helper  (MINOR #15)
-- =========================================================================
create or replace function statement_url(
  p_term          int,
  p_sitting_num   int,
  p_day           int,
  p_statement_num int
) returns text
language sql
immutable
as $$
  select format(
    'https://api.sejm.gov.pl/sejm/term%s/proceedings/%s/%s/transcripts/%s',
    p_term, p_sitting_num, p_day, p_statement_num
  )
$$;

comment on function statement_url(int,int,int,int) is
  'Canonical Sejm API URL for a statement transcript. Used by the frontend "źródło" links. Pure formatting; immutable.';

-- =========================================================================
-- 6. statement_print_links  (MINOR #14) -- slot only; backfill in Agent B
-- =========================================================================
create table if not exists statement_print_links (
  statement_id bigint not null references proceeding_statements(id) on delete cascade,
  print_id     bigint not null references prints(id)               on delete cascade,
  source       text   not null check (source in ('agenda_item','title_regex','manual')),
  created_at   timestamptz not null default now(),
  primary key (statement_id, print_id)
);

create index if not exists statement_print_links_print_idx
  on statement_print_links(print_id);

comment on table statement_print_links is
  'Materialised link from proceeding_statements to prints. source=agenda_item: derived from agenda_items.print_numbers. source=title_regex: parsed from statement context. source=manual: operator override. Empty until Agent B backfill.';

-- =========================================================================
-- 7. last_refreshed_at on prints + processes  (Strategic gap F)
--    Backfill from existing loaded_at/staged_at so monitoring queries work
--    immediately after this migration.
-- =========================================================================
alter table prints
  add column if not exists last_refreshed_at timestamptz;
alter table processes
  add column if not exists last_refreshed_at timestamptz;

update prints
   set last_refreshed_at = coalesce(loaded_at, staged_at)
 where last_refreshed_at is null;

update processes
   set last_refreshed_at = coalesce(loaded_at, staged_at)
 where last_refreshed_at is null;

comment on column prints.last_refreshed_at is
  'Last time this print was refreshed by the ETL (touched by an updater). Backfilled from loaded_at/staged_at by 0047.';
comment on column processes.last_refreshed_at is
  'Last time this process was refreshed by the ETL. Backfilled from loaded_at/staged_at by 0047.';

commit;
