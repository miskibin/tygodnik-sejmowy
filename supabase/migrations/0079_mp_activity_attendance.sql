-- ============================================================================
-- 0079_mp_activity_attendance.sql
-- Pre-aggregated MP stats for the /posel/[mpId] hero tiles (frekwencja,
-- interpelacje, wystąpienia). Source of truth mirrors tab queries:
--   votes (per-głosowanie participation; ABSENT = nieobecny)
--   proceeding_statements + question_authors
-- Refreshed with refresh_mp_activity() alongside other matviews in daily.
-- ============================================================================

drop function if exists refresh_mp_activity();

drop materialized view if exists mp_attendance cascade;
drop materialized view if exists mp_activity_summary cascade;

-- One row per (term, mp_id) from mps; vote stats left-joined so MPs with zero
-- votes still appear (total_votes=0, pct_attended null).
create materialized view mp_attendance as
select
  m.term,
  m.mp_id,
  coalesce(vc.total_votes, 0)::bigint       as total_votes,
  coalesce(vc.attended, 0)::bigint           as attended,
  case when coalesce(vc.total_votes, 0) > 0
       then round(
         100.0 * coalesce(vc.attended, 0)::numeric / vc.total_votes::numeric,
         1
       )
       else null::numeric
  end                                       as pct_attended
from mps m
left join (
  select
    term,
    mp_id,
    count(*)::bigint                                              as total_votes,
    count(*) filter (where vote <> 'ABSENT'::vote_choice)::bigint as attended
  from votes
  group by term, mp_id
) vc on vc.term = m.term and vc.mp_id = m.mp_id;

create unique index mp_attendance_pk
  on mp_attendance (term, mp_id);

create index mp_attendance_term_pct_idx
  on mp_attendance (term, pct_attended desc nulls last);

comment on materialized view mp_attendance is
  'Per-MP vote participation: total_votes = rows in votes (one per głosowanie); '
  'attended = vote <> ABSENT; pct_attended rounded to 0.1%.';

-- Activity counts aligned with question_authors + proceeding_statements.
create materialized view mp_activity_summary as
select
  m.term,
  m.mp_id,
  coalesce(st.n_statements, 0)::bigint as n_statements,
  coalesce(qa.n_questions, 0)::bigint as n_questions
from mps m
left join (
  select term, mp_id, count(*)::bigint as n_statements
  from proceeding_statements
  where mp_id is not null
  group by term, mp_id
) st on st.term = m.term and st.mp_id = m.mp_id
left join (
  select term, mp_id, count(*)::bigint as n_questions
  from question_authors
  group by term, mp_id
) qa on qa.term = m.term and qa.mp_id = m.mp_id;

create unique index mp_activity_summary_pk
  on mp_activity_summary (term, mp_id);

create index mp_activity_summary_term_statements_idx
  on mp_activity_summary (term, n_statements desc);

comment on materialized view mp_activity_summary is
  'Per-MP counts: proceeding_statements with mp_id; question_authors rows (per question).';

create or replace function refresh_mp_activity() returns void
language plpgsql as $$
begin
  refresh materialized view concurrently mp_attendance;
  refresh materialized view concurrently mp_activity_summary;
end;
$$;

comment on function refresh_mp_activity() is
  'Rebuild mp_attendance + mp_activity_summary (CONCURRENTLY).';
