-- 0064_mp_rebellion_count_mv.sql
-- Per-MP rebellion counter: votes against own klub majority, total + topic breakdown.
-- Used by /posel/[mpId] "Rebels" section in voting redesign.
--
-- Rebellion definition: rows in mp_vote_discipline (0032) where aligned=false.
-- That view excludes ABSENT and resolves club_modal via klub majority on
-- decisive votes (YES/NO/ABSTAIN). Single source of truth for "broke discipline".
--
-- Topic resolution: voting_print_links can attach multiple prints to one
-- voting; we collapse with DISTINCT ON role priority so each rebellion lands
-- in exactly one topic bucket. Votings with no print → 'inne'.

create materialized view if not exists mp_rebellion_count_mv as
with voting_topic as (
  select distinct on (vpl.voting_id)
    vpl.voting_id,
    coalesce(p.topic, 'inne') as topic
  from voting_print_links vpl
  join prints p on p.id = vpl.print_id
  order by vpl.voting_id,
           case when vpl.role = 'main' then 0 else 1 end,
           p.id
),
rebels_per_topic as (
  select d.term, d.mp_id,
         coalesce(vt.topic, 'inne') as topic,
         count(*)::int as cnt
  from mp_vote_discipline d
  left join voting_topic vt on vt.voting_id = d.voting_id
  where d.aligned = false
  group by d.term, d.mp_id, coalesce(vt.topic, 'inne')
)
select
  term,
  mp_id,
  sum(cnt)::int as total_rebellions,
  jsonb_object_agg(topic, cnt) as rebellions_by_topic
from rebels_per_topic
group by term, mp_id;

create unique index if not exists mp_rebellion_count_mv_pk
  on mp_rebellion_count_mv (term, mp_id);

create index if not exists mp_rebellion_count_mv_term_total_idx
  on mp_rebellion_count_mv (term, total_rebellions desc);

create or replace function refresh_mp_rebellion_count() returns void
language plpgsql as $$
begin
  refresh materialized view concurrently mp_rebellion_count_mv;
end;
$$;

refresh materialized view mp_rebellion_count_mv;

comment on materialized view mp_rebellion_count_mv is
  'Per-MP rebellion stats: total_rebellions + rebellions_by_topic {topic: cnt}. '
  'Built on mp_vote_discipline (0032). Topic via voting_print_links DISTINCT ON role priority.';
