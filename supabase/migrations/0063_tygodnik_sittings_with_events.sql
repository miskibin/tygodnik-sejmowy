-- 0063_tygodnik_sittings_with_events.sql
--
-- Extend tygodnik_sittings (from 0059) with event_count + top_topics. The
-- archive grid in BriefList renders "X wydarzeń" + dominant topics — this
-- view is the source of those numbers.
--
-- print_count is preserved for backwards compatibility; new queries use
-- event_count.

drop view if exists tygodnik_sittings cascade;

create or replace view tygodnik_sittings as
with per_sitting_events as (
  -- Total events per sitting from the union view.
  select
    we.term,
    we.sitting_num,
    count(*)::int as event_count
  from weekly_events_v we
  where we.sitting_num is not null
  group by we.term, we.sitting_num
),
print_topics as (
  -- Flatten topic_tags from eligible prints attached to each sitting.
  -- Guard against jsonb_typeof != 'array': jsonb_build_object converts SQL
  -- NULL into JSONB null (not '[]'), and jsonb_array_elements_text crashes
  -- on a scalar. Filter before extracting.
  select
    pe.term,
    pe.sitting_num,
    tag
  from print_events_v pe
  cross join lateral jsonb_array_elements_text(pe.payload->'topic_tags') as tag
  where pe.sitting_num is not null
    and jsonb_typeof(pe.payload->'topic_tags') = 'array'
),
top_topics_per_sitting as (
  -- Top 3 topics per (term, sitting_num) by frequency.
  select
    term,
    sitting_num,
    array_agg(tag order by cnt desc, tag) filter (where rn <= 3) as top_topics
  from (
    select
      term,
      sitting_num,
      tag,
      count(*) as cnt,
      row_number() over (partition by term, sitting_num order by count(*) desc, tag) as rn
    from print_topics
    group by term, sitting_num, tag
  ) t
  group by term, sitting_num
)
select
  pc.term,
  pc.number                              as sitting_num,
  pc.title                               as sitting_title,
  pc.dates                               as sitting_dates,
  pc.dates[1]                            as first_date,
  pc.dates[array_length(pc.dates, 1)]    as last_date,
  -- Preserved from 0059 — counts only eligible prints, used by old code paths.
  count(distinct psa.print_id) filter (
    where pr.impact_punch is not null
      and coalesce(pr.is_meta_document, false) = false
      and coalesce(pr.is_procedural,    false) = false
      and pr.document_category = 'projekt_ustawy'
  )::int                                 as print_count,
  coalesce(pse.event_count, 0)           as event_count,
  coalesce(tt.top_topics, '{}'::text[])  as top_topics
from proceedings pc
left join print_sitting_assignment psa
  on psa.term = pc.term and psa.sitting_num = pc.number
left join prints pr
  on pr.id = psa.print_id
left join per_sitting_events pse
  on pse.term = pc.term and pse.sitting_num = pc.number
left join top_topics_per_sitting tt
  on tt.term = pc.term and tt.sitting_num = pc.number
group by pc.term, pc.number, pc.title, pc.dates,
         pse.event_count, tt.top_topics;

comment on view tygodnik_sittings is
  'Per-sitting Tygodnik index. event_count from weekly_events_v, top_topics from prints.topic_tags. print_count kept for backwards-compat.';
