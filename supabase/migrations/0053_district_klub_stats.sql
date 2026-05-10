-- 0053_district_klub_stats.sql
-- Atlas A2: per-district aggregate for the homepage map (module 01).
-- 41 districts × number of terms = ~50 rows; tiny, view (no matview) is fine.
--
-- Columns:
--   district_num         INT — Sejm district 1..41
--   term                 INT
--   dominant_club_id     bigint — FK clubs.id
--   dominant_club_short  TEXT
--   dominant_club_name   TEXT
--   mp_count             INT — total active MPs in the district
--   avg_age              NUMERIC(4,1) — average age in years (today)
--   turnout_pct          NUMERIC — NULL until elections data ingested
--                        (deferred — no source on api.sejm.gov.pl yet)
--
-- Dominant club = mode of current_membership (max(id) per (term, mp_id)),
-- ties broken by club_id (deterministic). Only ACTIVE MPs counted (active=true)
-- so vacated seats don't skew the dominant calc.

create or replace view district_klub_stats as
with current_membership as (
  select distinct on (term, mp_id) term, mp_id, club_id
  from mp_club_membership
  order by term, mp_id, id desc
),
mp_district as (
  -- One row per active MP with their current club. district_num is on mps.
  select
    m.term, m.id as mp_id, m.district_num, m.birth_date,
    cm.club_id as club_short
  from mps m
  join current_membership cm on cm.mp_id = m.id and cm.term = m.term
  where m.active = true
    and m.district_num is not null
),
district_club_counts as (
  select
    term, district_num, club_short,
    count(*) as members
  from mp_district
  group by term, district_num, club_short
),
dominant as (
  -- DISTINCT ON picks the row with highest count per (term, district_num);
  -- ties resolved by club_short alphabetically (deterministic).
  select distinct on (term, district_num)
    term, district_num, club_short, members as dominant_count
  from district_club_counts
  order by term, district_num, members desc, club_short
),
aggs as (
  select
    term, district_num,
    count(*)                                                   as mp_count,
    round(avg(extract(year from age(birth_date)))::numeric, 1) as avg_age
  from mp_district
  group by term, district_num
)
select
  a.district_num,
  a.term,
  c.id    as dominant_club_id,
  d.club_short as dominant_club_short,
  c.name  as dominant_club_name,
  a.mp_count,
  a.avg_age,
  null::numeric as turnout_pct  -- TODO: backfill when PKW elections ingest lands
from aggs a
join dominant d on d.term = a.term and d.district_num = a.district_num
join clubs c on c.club_id = d.club_short and c.term = a.term;
