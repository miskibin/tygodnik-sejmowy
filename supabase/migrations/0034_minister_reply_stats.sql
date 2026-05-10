-- ============================================================================
-- 0034_minister_reply_stats.sql -- P3.2 slowest-minister rankings.
-- Source: question_recipients (free-text minister names, no FK) +
--         questions (term). Aggregated per (term, recipient_name).
-- Caveat: recipient_name is free-text -- same minister may appear under
--         multiple names ("Sekretarz Stanu w MS", "Minister Sprawiedliwosci")
--         -- downstream consumer needs to dedupe / canonicalize.
-- Schema confirmed via introspection:
--   question_recipients(id, question_id, ord, name, sent_date, answer_delayed_days)
--   questions(id, term, kind, num, ..., answer_delayed_days, ...)
-- We use answer_delayed_days from question_recipients (per-recipient lag).
-- ============================================================================

create materialized view if not exists minister_reply_stats as
select
  q.term,
  qr.name                            as recipient_name,
  count(*)                           as n_total,
  count(*) filter (where qr.answer_delayed_days > 30) as n_overdue_30d,
  count(*) filter (where qr.answer_delayed_days is null) as n_unanswered,
  percentile_cont(0.5) within group (order by qr.answer_delayed_days)
                                     as median_days,
  percentile_cont(0.9) within group (order by qr.answer_delayed_days)
                                     as p90_days,
  max(qr.answer_delayed_days)        as max_days,
  avg(qr.answer_delayed_days)::numeric(10,2) as mean_days
from question_recipients qr
join questions q on q.id = qr.question_id
group by q.term, qr.name;

create unique index if not exists minister_reply_stats_pk
  on minister_reply_stats (term, recipient_name);

create index if not exists minister_reply_stats_p90_idx
  on minister_reply_stats (term, p90_days desc nulls last);

create or replace function refresh_minister_reply_stats() returns void
language plpgsql as $$
begin
  refresh materialized view concurrently minister_reply_stats;
end;
$$;

refresh materialized view minister_reply_stats;
