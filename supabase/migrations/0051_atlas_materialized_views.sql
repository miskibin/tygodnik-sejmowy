-- 0051_atlas_materialized_views.sql
-- Atlas spec A3: heatmap + klub-by-klub stats hit PostgREST 8s timeout
-- because voting_by_club re-aggregates ~250k vote rows on every request.
--
-- Solution: pre-aggregate into materialized views, refreshed at end-of-load.
--
-- Two matviews:
--   1. voting_by_club_mv — drop-in replacement for voting_by_club (Atlas
--      module 02 reads this; frontend already SELECTs voting_by_club so
--      we keep that as a thin wrapper for back-compat).
--   2. klub_pair_agreement_mv — pairwise klub agreement % across all
--      votings in a term. Powers the Atlas heatmap (klub × klub matrix).
--      ~50 rows per term (10 clubs × 10 / 2 pairs).
--
-- CONCURRENTLY refresh requires UNIQUE index on each MV; keys chosen to
-- match natural query patterns.
--
-- Refresh wired into supagraf.cli daily orchestrator (caller's job).

-- ---------- voting_by_club_mv -------------------------------------------

drop materialized view if exists voting_by_club_mv cascade;

create materialized view voting_by_club_mv as
with current_membership as (
  select distinct on (term, mp_id) term, mp_id, club_id
  from mp_club_membership
  order by term, mp_id, id desc
)
select
  v.id        as voting_id,
  v.term,
  c.id        as club_id,
  c.club_id   as club_short,
  c.name      as club_name,
  count(*) filter (where lower(vt.vote::text) = 'yes')           as yes,
  count(*) filter (where lower(vt.vote::text) = 'no')            as no,
  count(*) filter (where lower(vt.vote::text) = 'abstain')       as abstain,
  count(*) filter (where lower(vt.vote::text) = any(array['absent','excused'])) as not_voting,
  count(*) as total
from votings v
join votes vt on vt.voting_id = v.id
join current_membership m on m.mp_id = vt.mp_id and m.term = v.term
join clubs c on c.club_id = m.club_id and c.term = m.term
group by v.id, v.term, c.id, c.club_id, c.name;

-- UNIQUE index for REFRESH MATERIALIZED VIEW CONCURRENTLY.
create unique index if not exists voting_by_club_mv_pk
  on voting_by_club_mv (voting_id, club_id);
create index if not exists voting_by_club_mv_term_idx
  on voting_by_club_mv (term);

-- Replace the slow view with a thin wrapper over the matview so callers
-- already coded against voting_by_club keep working.
drop view if exists voting_by_club;
create view voting_by_club as select * from voting_by_club_mv;

-- ---------- klub_pair_agreement_mv --------------------------------------
-- Atlas heatmap: for each pair of clubs (a,b) within a term, compute
-- % of votings where their MAJORITY positions agreed. Definition:
--   majority(club, voting) := mode of {yes,no,abstain} per club's MPs
--   agree(a,b,voting)     := majority(a,voting) = majority(b,voting)
--   agreement_pct(a,b)    := count(votings where agree) / count(votings)
--
-- Skipped: votings where either club had 0 voting MPs (no majority).
-- Self-pairs (a=a) emitted as 100% for matrix completeness.

drop materialized view if exists klub_pair_agreement_mv cascade;

create materialized view klub_pair_agreement_mv as
with majority_per_voting_club as (
  -- For each (voting, club) pick the modal vote among yes/no/abstain.
  -- We exclude not_voting (absent/excused) from the modal calc — a klub
  -- where everyone was absent has no "position".
  select
    voting_id, term, club_id, club_short, club_name,
    case
      when greatest(yes, no, abstain) = 0 then null
      when yes >= no and yes >= abstain then 'yes'
      when no  >= abstain               then 'no'
      else 'abstain'
    end as majority_vote
  from voting_by_club_mv
),
pairs as (
  select
    a.term,
    a.club_id   as club_a_id,
    a.club_short as club_a_short,
    b.club_id   as club_b_id,
    b.club_short as club_b_short,
    count(*) filter (where a.majority_vote is not null
                       and b.majority_vote is not null) as votings_with_both,
    count(*) filter (where a.majority_vote is not null
                       and b.majority_vote is not null
                       and a.majority_vote = b.majority_vote)   as votings_agreed
  from majority_per_voting_club a
  join majority_per_voting_club b
    on b.voting_id = a.voting_id and b.term = a.term
  group by a.term, a.club_id, a.club_short, b.club_id, b.club_short
)
select
  term,
  club_a_id, club_a_short,
  club_b_id, club_b_short,
  votings_with_both,
  votings_agreed,
  case when votings_with_both = 0 then null
       else round(100.0 * votings_agreed / votings_with_both, 1)
  end as agreement_pct
from pairs;

create unique index if not exists klub_pair_agreement_mv_pk
  on klub_pair_agreement_mv (term, club_a_id, club_b_id);
create index if not exists klub_pair_agreement_mv_term_idx
  on klub_pair_agreement_mv (term);

-- Initial population — both matviews start populated.
refresh materialized view voting_by_club_mv;
refresh materialized view klub_pair_agreement_mv;

-- ---------- refresh helper ----------------------------------------------
-- Single entry point for the CLI daily orchestrator. CONCURRENTLY = no
-- read lock on the matview while refreshing (cheap, since both have
-- UNIQUE indexes). Order matters: voting_by_club_mv first, klub_pair
-- depends on it.
create or replace function refresh_atlas_matviews(p_term integer default null)
returns text language plpgsql as $$
declare
  ts1 timestamptz; ts2 timestamptz; ts3 timestamptz;
begin
  ts1 := clock_timestamp();
  refresh materialized view concurrently voting_by_club_mv;
  ts2 := clock_timestamp();
  refresh materialized view concurrently klub_pair_agreement_mv;
  ts3 := clock_timestamp();
  return format('voting_by_club_mv=%sms klub_pair_agreement_mv=%sms',
    extract(milliseconds from ts2-ts1)::int,
    extract(milliseconds from ts3-ts2)::int);
end $$;
