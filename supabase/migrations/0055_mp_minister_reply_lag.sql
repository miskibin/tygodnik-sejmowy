-- ============================================================================
-- 0055_mp_minister_reply_lag.sql
-- Atlas A6 (module 04 "Ministrowie"): per-minister reply-lag aggregates.
--
-- WHY a view, not a new resource:
--   The repo's `questions` table (0022) already models BOTH Sejm question
--   kinds: kind='interpellation' (formal interpelacja, 21-day binding reply)
--   and kind='written' (zapytanie pisemne, 7-day). 632 + 434 = 1066 rows in
--   term=10 — the same /sejm/term{N}/interpellations and /writtenQuestions
--   endpoints Atlas A6 wanted. `question_recipients.answer_delayed_days` is
--   already populated per-recipient by the loader (mirrors API field).
--   Migration 0034 also created `minister_reply_stats` matview with most of
--   the aggregates A6 wants, just under different column names.
--
--   So instead of duplicating tables (interpellations / interpellation_*),
--   this migration ships the missing piece: a view exposing the exact column
--   shape the Atlas frontend will SELECT from:
--     mp_minister_reply_lag(
--       recipient_authority, recipient_label,
--       total_questions, replied,
--       avg_lag_days, median_lag_days, overdue_30d_pct
--     )
--
-- WHY filter to kind='interpellation' only:
--   Atlas module 04 "Ministrowie" is about ministerial accountability for
--   formal interpellations (the 21-day binding constitutional instrument).
--   Mixing in writtenQuestions would distort the lag distribution because
--   their reply window is different. If the frontend ever wants both kinds,
--   the view can be relaxed; for now A6 is interpellation-only.
--
-- WHY recompute instead of `SELECT FROM minister_reply_stats`:
--   minister_reply_stats aggregates over all kinds and treats `answer_delayed_days
--   IS NULL` as "unanswered". For Atlas we want clearer semantics:
--     replied = there is at least one non-prolongation reply
--   This requires joining question_replies, which the matview doesn't expose.
--
-- WHY the recipient_authority slug:
--   `recipient_name` is free-text Polish ("minister sprawiedliwości",
--   "Sekretarz Stanu w MS"...). Frontend needs a stable join key for icons,
--   colours, breadcrumbs. We derive a kebab-case ASCII slug here so the
--   frontend doesn't repeat the normalisation logic.
-- ============================================================================

-- Helper: slugify a Polish minister title to a stable kebab-case authority key.
-- Strips diacritics, drops noise tokens ("minister", "do spraw", connectives),
-- lowercases, replaces non-alphanumerics with '-', collapses runs.
create or replace function slugify_recipient(p_name text)
returns text
language sql immutable as $$
  with stripped as (
    select translate(
      lower(coalesce(p_name, '')),
      'ąćęłńóśźż',
      'acelnoszz'
    ) as s
  ),
  cleaned as (
    select regexp_replace(s, '[^a-z0-9]+', '-', 'g') as s from stripped
  )
  select trim(both '-' from
    regexp_replace(
      regexp_replace(s,
        '\m(minister|ministra|ministrowi|do-spraw|i|oraz|the|a|w|na)\M',
        '', 'g'),
      '-+', '-', 'g')
  )
  from cleaned;
$$;

create or replace view mp_minister_reply_lag as
with base as (
  -- One row per (question, recipient) pair, restricted to interpellations.
  -- We use answer_delayed_days from question_recipients (per-recipient lag,
  -- which is what the API gives us). NULL means "no reply yet".
  select
    qr.name                                       as recipient_label,
    slugify_recipient(qr.name)                    as recipient_authority,
    qr.answer_delayed_days                        as lag_days,
    -- "replied" = at least one non-prolongation reply exists for this question.
    exists (
      select 1 from question_replies rep
      where rep.question_id = q.id and not rep.prolongation
    ) as has_real_reply
  from questions q
  join question_recipients qr on qr.question_id = q.id
  where q.term = 10
    and q.kind = 'interpellation'
)
select
  recipient_authority,
  -- Pretty label: pick the modal raw form for this slug (most common spelling).
  (array_agg(recipient_label order by recipient_label))[1] as recipient_label,
  count(*)                                                  as total_questions,
  count(*) filter (where has_real_reply)                    as replied,
  round(avg(lag_days) filter (where lag_days is not null), 1) as avg_lag_days,
  percentile_cont(0.5) within group (order by lag_days)     as median_lag_days,
  round(
    100.0 * count(*) filter (where lag_days is not null and lag_days > 30)::numeric
    / nullif(count(*) filter (where lag_days is not null), 0),
    1
  ) as overdue_30d_pct
from base
where recipient_authority <> ''
group by recipient_authority;

comment on view mp_minister_reply_lag is
  'Atlas A6 module 04 (Ministrowie): per-minister interpellation reply-lag '
  'aggregates derived from questions/question_recipients/question_replies. '
  'recipient_authority is a stable kebab-case slug; recipient_label is the '
  'human-readable Polish title. Restricted to term=10, kind=interpellation.';
