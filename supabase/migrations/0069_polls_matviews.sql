-- 0069_polls_matviews.sql
-- E2: national polls aggregations. No district seat projection (deferred).

-- 30-day weighted-by-recency average per party_code. Half-life 14 days
-- via exp(-days_old/14) — newer polls dominate.
create materialized view if not exists poll_average_30d_mv as
with recent as (
  select pr.party_code,
         pr.percentage,
         (now()::date - p.conducted_at_end) as days_old,
         p.sample_size,
         p.conducted_at_end,
         p.pollster
  from poll_results pr
  join polls p on p.id = pr.poll_id
  where p.conducted_at_end >= now()::date - interval '30 days'
    and p.election_target = 'sejm'
    and pr.percentage is not null
)
select party_code,
       round(sum(percentage * exp(-days_old::numeric / 14)) /
             nullif(sum(exp(-days_old::numeric / 14)), 0), 2) as percentage_avg,
       count(*) as n_polls,
       max(conducted_at_end) as last_conducted_at,
       round(min(percentage), 2) as percentage_min_30d,
       round(max(percentage), 2) as percentage_max_30d
from recent
group by party_code;

create unique index if not exists poll_average_30d_mv_party_idx
  on poll_average_30d_mv (party_code);

-- Per-party quarterly trend, post-2023-election cutoff.
create materialized view if not exists poll_trend_quarterly_mv as
select pr.party_code,
       date_trunc('quarter', p.conducted_at_end)::date as quarter_start,
       round(avg(pr.percentage), 2) as percentage_avg,
       round(min(pr.percentage), 2) as percentage_min,
       round(max(pr.percentage), 2) as percentage_max,
       count(*) as n_polls
from poll_results pr
join polls p on p.id = pr.poll_id
where p.election_target = 'sejm'
  and pr.percentage is not null
  and p.conducted_at_end >= '2023-10-15'
group by pr.party_code, date_trunc('quarter', p.conducted_at_end);

create unique index if not exists poll_trend_quarterly_mv_pq_idx
  on poll_trend_quarterly_mv (party_code, quarter_start);
create index if not exists poll_trend_quarterly_mv_q_idx
  on poll_trend_quarterly_mv (quarter_start);

create or replace function refresh_polls_mv() returns void
language plpgsql as $$
begin
  refresh materialized view concurrently poll_average_30d_mv;
  refresh materialized view concurrently poll_trend_quarterly_mv;
end;
$$;

-- Initial populate (NOT CONCURRENTLY because indexes just created).
refresh materialized view poll_average_30d_mv;
refresh materialized view poll_trend_quarterly_mv;
