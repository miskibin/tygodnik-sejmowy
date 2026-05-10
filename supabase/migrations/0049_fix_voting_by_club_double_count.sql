-- 0049_fix_voting_by_club_double_count.sql
-- Original view (0047) joined `mp_club_membership` directly. PK is
-- (term, mp_id, club_id) so MPs who switched clubs (23/460 in term 10)
-- produced N rows per vote, inflating per-club counts by exactly the
-- duplicate factor.
--
-- Fix: dedupe with a CTE that picks ONE membership per (term, mp_id) using
-- max(id) — assumes monotonic insert order = chronological joinings, so
-- the latest row is the current/most-recent club. The mp_club_membership
-- table has no validity window, so this is a snapshot-best-effort approach.
-- Acceptable because votings are typically <6 months old and party-switch
-- frequency is low; for historical accuracy a point-in-time table is the
-- proper fix (deferred).

create or replace view voting_by_club as
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
