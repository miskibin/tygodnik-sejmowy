-- Add proceeding title + in-day statement ordinal to viral_quote JSON payload
-- for Tygodnik context (sitting / day / wyp. nr).
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
    'summary_one_line',  ps.summary_one_line,
    'statement_num',     ps.num,
    'proceeding_title',  pc.title
  )                                                    as payload,
  ('https://www.sejm.gov.pl/Sejm' || ps.term ||
   '.nsf/transmisje_arch.xsp?unid=' || ps.id::text)    as source_url,
  ps.id::text                                          as sort_key
from proceeding_statements ps
join proceeding_days pd on pd.id = ps.proceeding_day_id
join proceedings pc     on pc.id = pd.proceeding_id
where ps.viral_score is not null
  and ps.viral_score > 0;
