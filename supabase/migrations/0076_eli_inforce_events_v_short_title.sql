-- 0076_eli_inforce_events_v_short_title.sql
-- Expose acts.short_title (added in 0075) on the eli_inforce_events_v payload.
-- Frontend EliCard falls back to a.title when short_title is null, so this
-- migration can ship before the backfill completes.
--
-- Body of the view is otherwise identical to the 0062 definition.

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
    'short_title',       a.short_title,
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
  'ELI acts entering force around a sitting (term 10). Heuristic impact: DU=0.5 base, MP=0.3, +length(title)/400 (capped at 0.5). Payload includes short_title (LLM-rewritten plain-Polish headline; nullable until backfill).';
