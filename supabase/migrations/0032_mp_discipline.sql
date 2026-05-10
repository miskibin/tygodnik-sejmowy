-- ============================================================================
-- 0032_mp_discipline.sql -- party-discipline metric (votes vs club modal)
-- ============================================================================
-- Schema notes confirmed via introspection:
--   votes(voting_id, term, mp_id, club_ref, vote vote_choice, list_votes)
--     -- the column is `vote`, not `choice`; `term` already on votes (skip vt join)
--   vote_choice enum: YES, NO, ABSTAIN, ABSENT, PRESENT
--     -- "didn't vote" == ABSENT (no NIE_GLOSOWAL literal exists)
--   mp_club_membership(id, term, mp_id, club_id)
--     -- no is_inferred column; deterministic tiebreak on (term, mp_id, club_id)
--   clubs(id, term, club_id text, name, ...) -- club_id is the text natural key
--
-- CAVEAT: mp_club_membership is a SNAPSHOT (no point-in-time history).
-- For now, "club_at_vote" = current snapshot membership. Acceptable until
-- club_history lands.
-- ============================================================================

create or replace view mp_vote_discipline as
with mp_club as (
  select distinct on (term, mp_id)
    term, mp_id, club_id
  from mp_club_membership
  order by term, mp_id, club_id
),
club_modal as (
  select voting_id, club_id, vote as modal_choice
  from (
    select v.voting_id,
           mc.club_id,
           v.vote,
           count(*) as n,
           row_number() over (
             partition by v.voting_id, mc.club_id
             order by count(*) desc, v.vote
           ) as rk
    from votes v
    join mp_club mc on mc.term = v.term and mc.mp_id = v.mp_id
    where v.vote <> 'ABSENT'
    group by v.voting_id, mc.club_id, v.vote
  ) ranked
  where rk = 1
)
select
  v.voting_id,
  v.mp_id,
  v.term,
  mc.club_id            as club_id_at_vote,
  cm.modal_choice       as club_modal_choice,
  v.vote                as mp_choice,
  (v.vote = cm.modal_choice) as aligned
from votes v
join mp_club  mc on mc.term = v.term and mc.mp_id = v.mp_id
left join club_modal cm on cm.voting_id = v.voting_id and cm.club_id = mc.club_id
where v.vote <> 'ABSENT';

comment on view mp_vote_discipline is
  'Per-vote-per-MP alignment vs club modal choice. Excludes ABSENT (didn''t vote). '
  'club_id_at_vote uses current mp_club_membership snapshot (no club_history yet).';

create materialized view if not exists mp_discipline_summary as
select
  d.term,
  d.mp_id,
  count(*)                                                  as n_votes,
  count(*) filter (where d.aligned)                         as n_aligned,
  case when count(*) > 0
       then round(100.0 * count(*) filter (where d.aligned) / count(*), 1)
       else null::numeric
  end                                                       as pct_aligned
from mp_vote_discipline d
group by d.term, d.mp_id;

create unique index if not exists mp_discipline_summary_pk
  on mp_discipline_summary (term, mp_id);

create index if not exists mp_discipline_summary_term_pct_idx
  on mp_discipline_summary (term, pct_aligned desc);

create or replace function refresh_mp_discipline() returns void
language plpgsql as $$
begin
  refresh materialized view concurrently mp_discipline_summary;
end;
$$;

refresh materialized view mp_discipline_summary;
