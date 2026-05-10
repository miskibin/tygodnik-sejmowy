-- Atlas A5: club-switch history for Sankey ribbons.
--
-- Why a derived table (not a direct API import)?
-- The Sejm OpenAPI (term 10) has no first-class /clubChanges endpoint —
-- club membership is exposed only as a current snapshot per MP. However,
-- every row in `votes` carries the MP's club AT VOTE TIME via votes.club_ref,
-- and `votings.date` gives us a timestamp. Walking each MP's vote series
-- by date and detecting club_ref transitions yields a per-day-resolution
-- history that's good enough for Sankey ribbons.
--
-- Granularity: change_date = first voting date on which the MP appears
-- under the new club. The actual transition could have happened any day
-- between this and the previous vote, but for quarter-aggregated flows
-- this is more than precise enough.

create table if not exists mp_club_history (
  id            bigserial primary key,
  term          int    not null,
  mp_id         int    not null,
  -- NULL only for the synthesized initial-assignment row (first vote ever).
  from_club_id  bigint references clubs(id),
  to_club_id    bigint not null references clubs(id),
  change_date   date   not null,
  source        text   not null check (source in ('vote_series_derived','api','manual')),
  created_at    timestamptz not null default now(),
  -- Idempotency target: re-running the backfill with the same vote series
  -- produces the same (term, mp_id, change_date, to_club_id) tuples.
  unique (term, mp_id, change_date, to_club_id),
  -- mps PK is (id) but business key is (term, mp_id); cascade on roster delete.
  foreign key (term, mp_id) references mps(term, mp_id) on delete cascade
);

create index if not exists mp_club_history_term_idx on mp_club_history(term, change_date);
create index if not exists mp_club_history_mp_idx   on mp_club_history(mp_id, term);

comment on table mp_club_history is
  'Atlas A5: per-MP club transition log derived from votes.club_ref series. '
  'One row per detected switch plus one synthetic "initial assignment" row '
  '(from_club_id=NULL) per MP at their first vote. Re-runnable backfill.';

-- Sankey aggregate: one row per (term, quarter, from_club, to_club).
-- date_trunc('quarter', ...) ensures deterministic bucketing. Initial-
-- assignment rows are excluded — they're not flows, just anchors.
create or replace view klub_flow_quarter as
select
  h.term,
  date_trunc('quarter', h.change_date)::date as quarter,
  fc.club_id   as from_club_short,
  tc.club_id   as to_club_short,
  count(*)::int as mp_count
from mp_club_history h
join clubs fc on fc.id = h.from_club_id
join clubs tc on tc.id = h.to_club_id
where h.from_club_id is not null
group by h.term, date_trunc('quarter', h.change_date), fc.club_id, tc.club_id;

comment on view klub_flow_quarter is
  'Sankey-ready quarterly flow ribbons. Excludes initial assignments. '
  'mp_count = number of distinct switch events into to_club from from_club '
  'in the given quarter (one MP can appear multiple times across quarters '
  'if they switch repeatedly).';

-- Helper function to detect transitions in a single SQL pass. Uses LAG
-- over (mp_id ORDER BY voting_date) to find adjacent distinct club_ref
-- values per MP. lag()=NULL on the first row → emitted as the initial-
-- assignment record (from_club_short=NULL).
create or replace function detect_mp_club_transitions(p_term int)
returns table (
  mp_id           int,
  change_date     date,
  from_club_short text,
  to_club_short   text
)
language sql
stable
as $$
  with sorted_votes as (
    select
      v.mp_id,
      vt.date::date as voting_date,
      v.club_ref    as club_short,
      lag(v.club_ref) over (
        partition by v.mp_id order by vt.date, vt.id
      ) as prev_club
    from votes v
    join votings vt on vt.id = v.voting_id
    where vt.term = p_term and v.club_ref is not null
  ),
  -- Keep only the FIRST date the new club_ref appears (transition point).
  transitions as (
    select
      mp_id,
      voting_date,
      club_short,
      prev_club,
      row_number() over (
        partition by mp_id, club_short
        order by voting_date
      ) as rn_in_club
    from sorted_votes
    where prev_club is distinct from club_short
  )
  select
    mp_id,
    voting_date    as change_date,
    prev_club      as from_club_short,
    club_short     as to_club_short
  from transitions
  where rn_in_club = 1
  order by mp_id, voting_date;
$$;

comment on function detect_mp_club_transitions(int) is
  'Atlas A5 helper: returns one row per (mp_id, club transition) for the term. '
  'First row per mp_id has from_club_short=NULL (initial assignment). '
  'Used by supagraf.backfill.mp_club_history.';

-- LAG window scans ~280k votes for term 10 → exceeds PostgREST 8s default.
-- Pin per-function timeout so daily backfill (called via .rpc()) doesn't fail.
alter function detect_mp_club_transitions(int) set statement_timeout = '60s';
