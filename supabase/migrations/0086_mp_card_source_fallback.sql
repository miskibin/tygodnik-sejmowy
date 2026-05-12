-- ============================================================================
-- 0086_mp_card_source_fallback.sql
-- Live (non-materialized) per-MP aggregates from source tables. Used by
-- frontend/lib/db/mp-card-stats.ts when mp_attendance / mp_activity_summary
-- matviews are stale or empty so the /posel list view never silently shows
-- zeros. Mirrors the same self-heal pattern getMpStats() already uses.
--
-- Cheap to evaluate when filtered by term=N (votes_mp_idx on (term,mp_id)
-- prunes the scan); PostgREST pushes the eq.term filter into the view body.
-- ============================================================================

create or replace view mp_attendance_source as
select
  v.term,
  v.mp_id,
  count(*)::bigint                                                  as total_votes,
  count(*) filter (where v.vote <> 'ABSENT'::vote_choice)::bigint   as attended,
  case when count(*) > 0
       then round(
         100.0 * count(*) filter (where v.vote <> 'ABSENT'::vote_choice)::numeric
              / count(*)::numeric,
         1
       )
       else null::numeric
  end                                                               as pct_attended
from votes v
group by v.term, v.mp_id;

comment on view mp_attendance_source is
  'Live per-(term,mp_id) vote participation from votes. Fallback for stale '
  'mp_attendance matview; same column shape as the matview.';

create or replace view mp_activity_source as
select
  m.term,
  m.mp_id,
  coalesce(st.n, 0)::bigint as n_statements,
  coalesce(qa.n, 0)::bigint as n_questions
from mps m
left join (
  select term, mp_id, count(*)::bigint as n
  from proceeding_statements
  where mp_id is not null
  group by term, mp_id
) st on st.term = m.term and st.mp_id = m.mp_id
left join (
  select term, mp_id, count(*)::bigint as n
  from question_authors
  group by term, mp_id
) qa on qa.term = m.term and qa.mp_id = m.mp_id;

comment on view mp_activity_source is
  'Live per-(term,mp_id) statement + interpellation counts. Fallback for '
  'stale mp_activity_summary matview; same column shape.';
