-- 0092_viral_quote_agenda_point.sql
--
-- Tygodnik viral_quote cards repeat the full sitting title ("57. Posiedzenie
-- Sejmu RP w dniach 12, 13, 14 i 15 maja 2026 r.") as the card heading,
-- which is redundant on /tygodnik/p/<sitting> pages and uninformative
-- elsewhere. The user-visible signal we actually want is the AGENDA POINT
-- being debated when the quote was spoken (e.g. "Pkt. 4 Pierwsze czytanie
-- poselskiego projektu ustawy o rynku kryptoaktywów").
--
-- Schema lacks a hard statement→agenda_item linkage. Upstream Sejm doesn't
-- tag statements with agenda_num. agenda_items has no timing. Workaround:
-- votings DO carry both timestamps and "Pkt. N ..." titles — every agenda
-- point that reaches a vote has a corresponding voting row. So we pick the
-- earliest voting later than the statement's start_datetime on the same
-- (term, sitting) whose title starts with "Pkt." — that voting's title IS
-- the agenda point title.
--
-- Statements after the last voting of the day (and statements on agenda
-- points that never reach a vote, e.g. pure debate items) fall back to
-- proceeding_title — handled by the frontend's existing coalesce logic.
--
-- LEFT JOIN LATERAL is the natural shape: per-statement subquery picks the
-- one matching voting. Postgres evaluates lazily and the votings(term,
-- sitting, date) index keeps it cheap.

create or replace view viral_quote_events_v as
select
  'viral_quote'::text                                  as event_type,
  ps.term                                              as term,
  pc.number                                            as sitting_num,
  pd.date                                              as event_date,
  ps.viral_score                                       as impact_score,
  jsonb_build_object(
    'statement_id',        ps.id,
    'speaker_name',        ps.speaker_name,
    'function',            ps.function,
    'mp_id',               ps.mp_id,
    'date',                pd.date,
    'start_datetime',      ps.start_datetime,
    'viral_quote',         ps.viral_quote,
    'viral_reason',        ps.viral_reason,
    'tone',                ps.tone,
    'topic_tags',          ps.topic_tags,
    'mentioned_entities',  ps.mentioned_entities,
    'key_claims',          ps.key_claims,
    'addressee',           ps.addressee,
    'summary_one_line',    ps.summary_one_line,
    'statement_num',       ps.num,
    'proceeding_title',    pc.title,
    -- agenda point context: voting title from the next "Pkt. N ..." voting
    -- on the same sitting after the statement was spoken. NULL when no
    -- matching voting (statement during pure-debate agenda item, after
    -- the last vote of the day, or when start_datetime is NULL).
    'agenda_point_title',  ap.title
  )                                                    as payload,
  ('https://www.sejm.gov.pl/Sejm' || ps.term ||
   '.nsf/transmisje_arch.xsp?unid=' || ps.id::text)    as source_url,
  ps.id::text                                          as sort_key
from proceeding_statements ps
join proceeding_days pd on pd.id = ps.proceeding_day_id
join proceedings pc     on pc.id = pd.proceeding_id
left join lateral (
  select v.title
  from votings v
  where v.term = ps.term
    and v.sitting = pc.number
    and ps.start_datetime is not null
    and v.date >= ps.start_datetime
    and v.title ~ '^Pkt\.\s+\d+'
  order by v.date asc
  limit 1
) ap on true
where ps.viral_score is not null
  and ps.viral_score > 0;

comment on view viral_quote_events_v is
  'viral_quote events for Tygodnik. payload.agenda_point_title resolves to the next "Pkt. N ..." voting title after the statement start — frontend uses it as the card heading. Falls back to proceeding_title when no matching voting (NULL).';
