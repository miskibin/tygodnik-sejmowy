-- 0062_weekly_event_views.sql
--
-- Multi-event Tygodnik feed. Per-event-type SQL views all emit the same
-- shape, then UNION ALL into weekly_events_v. The frontend filters by
-- (term, sitting_num) and ranks by impact_score.
--
-- Read-time composition over existing tables — no new ETL, no sync problem.
-- Compatible with the prior print-only Tygodnik: print_events_v wraps the
-- same print_homepage_score + print_sitting_assignment.
--
-- Event types (all bucketed onto a sitting_num):
--   1. print              — bills (existing behaviour)
--   2. vote               — votings linked to eligible prints (incl. close splits)
--   3. eli_inforce        — ELI acts whose legal_status_date falls in/near a sitting
--   4. late_interpellation — questions with answer_delayed_days > 30
--   5. viral_quote        — top utterances by viral_score (mig 0061 enrichment)

-- ---------- bucketing helper ----------
-- Maps an event_date → canonical sitting_num for a given term. Strategy:
--   * Prefer the sitting whose date range contains the event.
--   * If event is AFTER a sitting (e.g. ELI in_force on Mon after Fri sitting),
--     attach to that recent sitting up to 14 days later.
--   * If event is BEFORE any sitting, return NULL (filtered out by views).
create or replace function event_bucket_sitting(p_term int, p_date date)
returns int
language sql stable as $$
  select pc.number
  from proceedings pc
  where pc.term = p_term
    and pc.dates[1] <= p_date
    and p_date <= (pc.dates[array_length(pc.dates, 1)] + interval '14 days')::date
  order by pc.dates[1] desc
  limit 1
$$;

comment on function event_bucket_sitting(int, date) is
  'Map an event_date to the most relevant sitting_num for the Tygodnik feed. Returns the latest sitting whose start was on/before the date and whose last day was no more than 14 days before the date.';

-- ---------- 1. print_events_v ----------
-- Wraps print_homepage_score; no ranking change vs. prior Tygodnik.
create or replace view print_events_v as
select
  'print'::text                                        as event_type,
  pr.term                                              as term,
  psa.sitting_num                                      as sitting_num,
  pr.change_date::date                                 as event_date,
  ph.homepage_score                                    as impact_score,
  jsonb_build_object(
    'print_id',       pr.id,
    'number',         pr.number,
    'short_title',    pr.short_title,
    'title',          pr.title,
    'impact_punch',   pr.impact_punch,
    'summary_plain',  pr.summary_plain,
    'citizen_action', pr.citizen_action,
    'affected_groups', pr.affected_groups,
    'persona_tags',   pr.persona_tags,
    'topic_tags',     pr.topic_tags,
    'change_date',    pr.change_date,
    'document_category', pr.document_category
  )                                                    as payload,
  ('/druk/' || pr.term || '/' || pr.number)            as source_url,
  pr.id::text                                          as sort_key
from prints pr
join print_sitting_assignment psa on psa.print_id = pr.id
join print_homepage_score ph      on ph.print_id  = pr.id
where pr.impact_punch is not null
  and coalesce(pr.is_meta_document, false) = false
  and coalesce(pr.is_procedural,    false) = false
  and pr.document_category = 'projekt_ustawy';

comment on view print_events_v is
  'Print events for Tygodnik — projekt_ustawy with LLM impact, ranked by print_homepage_score.';

-- ---------- 2. vote_events_v ----------
-- Filter: only votings linked to at least one eligible print (avoids procedural
-- vote noise). impact_score blends linked-print homepage_score (0.7 weight)
-- with close-split signal (0.3 weight) — controversial votes surface even
-- when their print isn't the most impactful.
create or replace view vote_events_v as
select
  'vote'::text                                         as event_type,
  v.term                                               as term,
  v.sitting                                            as sitting_num,
  v.date::date                                         as event_date,
  least(1.0,
    0.7 * coalesce((
      select max(ph.homepage_score)
      from voting_print_links vpl
      join print_homepage_score ph on ph.print_id = vpl.print_id
      where vpl.voting_id = v.id
    ), 0.0)
    +
    0.3 * (
      case when (v.yes + v.no) > 0
        then 1.0 - (abs(v.yes::numeric - v.no::numeric) / nullif((v.yes + v.no)::numeric, 0))
        else 0
      end
    )
  )                                                    as impact_score,
  jsonb_build_object(
    'voting_id',     v.id,
    'voting_number', v.voting_number,
    'sitting',       v.sitting,
    'sitting_day',   v.sitting_day,
    'date',          v.date,
    'title',         v.title,
    'topic',         v.topic,
    'yes',           v.yes,
    'no',            v.no,
    'abstain',       v.abstain,
    'not_participating', v.not_participating,
    'total_voted',   v.total_voted,
    'linked_prints', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'print_id',    vpl.print_id,
        'number',      pr.number,
        'short_title', pr.short_title,
        'role',        vpl.role
      ) order by vpl.role), '[]'::jsonb)
      from voting_print_links vpl
      join prints pr on pr.id = vpl.print_id
      where vpl.voting_id = v.id
    ),
    'club_tally', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'club_short', vbc.club_short,
        'club_name',  vbc.club_name,
        'yes',        vbc.yes,
        'no',         vbc.no,
        'abstain',    vbc.abstain,
        'not_voting', vbc.not_voting,
        'total',      vbc.total
      ) order by vbc.yes desc), '[]'::jsonb)
      from voting_by_club vbc
      where vbc.voting_id = v.id
    )
  )                                                    as payload,
  ('/glosowanie/' || v.term || '/' || v.sitting || '/' || v.voting_number)
                                                       as source_url,
  v.id::text                                           as sort_key
from votings v
where exists (
  select 1
  from voting_print_links vpl
  join print_homepage_score ph on ph.print_id = vpl.print_id
  where vpl.voting_id = v.id
);

comment on view vote_events_v is
  'Vote events for Tygodnik — votings linked to at least one eligible print. impact_score = 0.7*max(linked print score) + 0.3*close_split_signal.';

-- ---------- 3. eli_inforce_events_v ----------
-- ELI acts entering force around a sitting. ELI is term-agnostic; we only
-- emit for term 10 to match the current Tygodnik scope. Heuristic impact:
-- DU > MP, longer titles tend to be more substantive (ratifications/uchwały
-- are short, ustawy są długie).
create or replace view eli_inforce_events_v as
select
  'eli_inforce'::text                                  as event_type,
  10                                                   as term,
  event_bucket_sitting(10, a.legal_status_date)        as sitting_num,
  a.legal_status_date                                  as event_date,
  least(1.0,
    case when a.publisher = 'DU' then 0.5 else 0.3 end
    + least(0.5, char_length(a.title)::numeric / 400.0)
  )                                                    as impact_score,
  jsonb_build_object(
    'act_id',            a.id,
    'eli_id',            a.eli_id,
    'publisher',         a.publisher,
    'year',              a.year,
    'position',          a.position,
    'type',              a.type,
    'title',             a.title,
    'in_force',          a.in_force,
    'legal_status_date', a.legal_status_date,
    'announcement_date', a.announcement_date,
    'promulgation_date', a.promulgation_date,
    'display_address',   a.display_address,
    'keywords',          a.keywords
  )                                                    as payload,
  a.source_url                                         as source_url,
  a.id::text                                           as sort_key
from acts a
where a.legal_status_date is not null
  and a.in_force in ('IN_FORCE', 'obowiązujący')
  and event_bucket_sitting(10, a.legal_status_date) is not null;

comment on view eli_inforce_events_v is
  'ELI acts entering force around a sitting (term 10). Heuristic impact: DU=0.5 base, MP=0.3, +length(title)/400 (capped at 0.5).';

-- ---------- 4. late_interpellation_events_v ----------
-- Interpelacje where the minister blew past 30 days. event_date = sent + 30d
-- (the moment delay was first observable). impact_score grows with the
-- delay length, capped near 1 around 180+ days.
create or replace view late_interpellation_events_v as
select
  'late_interpellation'::text                          as event_type,
  q.term                                               as term,
  event_bucket_sitting(q.term,
    (q.sent_date + interval '30 days')::date)          as sitting_num,
  (q.sent_date + interval '30 days')::date             as event_date,
  least(1.0,
    ln(greatest(q.answer_delayed_days, 31)::numeric)
      / ln(180.0)
  )                                                    as impact_score,
  jsonb_build_object(
    'question_id',         q.id,
    'kind',                q.kind,
    'num',                 q.num,
    'title',               q.title,
    'sent_date',           q.sent_date,
    'answer_delayed_days', q.answer_delayed_days,
    'recipient_titles',    q.recipient_titles,
    'authors', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'mp_id',           qa.mp_id,
        'first_last_name', m.first_last_name
      )), '[]'::jsonb)
      from question_authors qa
      left join mps m on m.term = qa.term and m.mp_id = qa.mp_id
      where qa.question_id = q.id
    )
  )                                                    as payload,
  ('https://www.sejm.gov.pl/Sejm' || q.term || '.nsf/' ||
    case q.kind
      when 'interpellation' then 'InterpelacjaTresc.xsp?key='
      when 'written'        then 'ZapytanieTresc.xsp?key='
      else 'document.xsp?key='
    end || q.num
  )                                                    as source_url,
  q.id::text                                           as sort_key
from questions q
where q.sent_date is not null
  and q.answer_delayed_days is not null
  and q.answer_delayed_days > 30
  and event_bucket_sitting(q.term,
    (q.sent_date + interval '30 days')::date) is not null;

comment on view late_interpellation_events_v is
  'Interpelacje/zapytania z opóźnioną odpowiedzią (>30 dni). event_date = sent_date + 30d. impact_score = ln(delay)/ln(180), capped at 1.';

-- ---------- 5. viral_quote_events_v ----------
-- Top utterances by LLM-scored viral_score. References columns added in 0061.
-- Bucketed via proceeding_days → proceedings.number.
create or replace view viral_quote_events_v as
select
  'viral_quote'::text                                  as event_type,
  ps.term                                              as term,
  pc.number                                            as sitting_num,
  pd.date                                              as event_date,
  ps.viral_score                                       as impact_score,
  jsonb_build_object(
    'statement_id',      ps.id,
    'speaker_name',      ps.speaker_name,
    'function',          ps.function,
    'mp_id',             ps.mp_id,
    'date',              pd.date,
    'start_datetime',    ps.start_datetime,
    'viral_quote',       ps.viral_quote,
    'viral_reason',      ps.viral_reason,
    'tone',              ps.tone,
    'topic_tags',        ps.topic_tags,
    'mentioned_entities',ps.mentioned_entities,
    'key_claims',        ps.key_claims,
    'addressee',         ps.addressee,
    'summary_one_line',  ps.summary_one_line
  )                                                    as payload,
  ('https://www.sejm.gov.pl/Sejm' || ps.term ||
   '.nsf/transmisje_arch.xsp?unid=' || ps.id::text)    as source_url,
  ps.id::text                                          as sort_key
from proceeding_statements ps
join proceeding_days pd on pd.id = ps.proceeding_day_id
join proceedings pc     on pc.id = pd.proceeding_id
where ps.viral_score is not null
  and ps.viral_score > 0;

comment on view viral_quote_events_v is
  'Wystąpienia z LLM-scored viral_score. Top-N per sitting feeds Tygodnik viral_quote section. Wymaga uruchomienia enrich-utterances.';

-- ---------- weekly_events_v (UNION ALL) ----------
create or replace view weekly_events_v as
  select * from print_events_v
  union all
  select * from vote_events_v
  union all
  select * from eli_inforce_events_v
  union all
  select * from late_interpellation_events_v
  union all
  select * from viral_quote_events_v;

comment on view weekly_events_v is
  'All Tygodnik events from 5 source views. Frontend filters by (term, sitting_num) and ranks by impact_score DESC.';
