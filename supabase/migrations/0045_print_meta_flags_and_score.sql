-- 0045_print_meta_flags_and_score.sql
--
-- Three additions driven by citizen review of the homepage feed:
--
-- (a) `is_procedural` (LLM output, issue #8): set when the document has no
--     legal effect ("nie ma wplywu na sytuacje prawna"). Frontend hides the
--     plain-summary panel and shows a "to dokument proceduralny" badge.
--     Same provenance as the rest of the unified enricher output -- no extra
--     CHECK constraint needed.
--
-- (b) `is_meta_document` (pure SQL, issue #6): generated stored column that
--     classifies opinions, autopoprawki, organizational motions, transmittal
--     letters from the Marshal, and "Do druku nr ..." cross-references as
--     meta clutter. Frontend filters main feed with WHERE is_meta_document = false.
--
-- (c) `print_homepage_score` view: cheap 0..1 ranking signal for the
--     homepage feed, mixing severity, actionability, and audience clarity.
--
-- All operations are idempotent (IF NOT EXISTS / OR REPLACE).

-- (a) procedural flag (LLM-populated)
alter table prints add column if not exists is_procedural boolean;

comment on column prints.is_procedural is
  'LLM-set flag (issue #8): true when the document has no legal effect. Frontend hides plain-summary panel and shows "dokument proceduralny" badge.';

-- (b) generated stored column for meta-document classification
alter table prints add column if not exists is_meta_document boolean
  generated always as (
    document_category in (
      'opinia_organu',
      'autopoprawka',
      'wniosek_organizacyjny',
      'pismo_marszalka'
    )
    or title ~* '^Do druku nr'
  ) stored;

comment on column prints.is_meta_document is
  'Pure SQL classifier (issue #6): true for opinions, autopoprawki, organizational motions, transmittal letters from Marshal, and "Do druku nr X" cross-refs. Frontend filters homepage with WHERE is_meta_document = false.';

create index if not exists prints_is_meta_document_idx
  on prints (is_meta_document, term)
  where is_meta_document = false;

-- Index supporting the homepage filter on is_procedural.
create index if not exists prints_is_procedural_idx
  on prints (is_procedural, term)
  where coalesce(is_procedural, false) = false;

-- (c) homepage score view -- 0..1 sortable signal
create or replace view print_homepage_score as
select
  p.id     as print_id,
  p.number as print_number,
  p.term,
  (
    case when exists (
      select 1 from jsonb_array_elements(p.affected_groups) ag
      where ag->>'severity' = 'high'
    ) then 0.5 else 0.0 end
    +
    case when p.citizen_action is not null then 0.3 else 0.0 end
    +
    case when array_length(p.persona_tags, 1) >= 1 then 0.2 else 0.0 end
  ) as homepage_score,
  p.is_meta_document,
  coalesce(p.is_procedural, false) as is_procedural
from prints p
where p.document_category = 'projekt_ustawy';

comment on view print_homepage_score is
  'Computed 0..1 score for ranking projekt_ustawy entries on the homepage feed. Combines severity (0.5), actionability (0.3), and audience clarity (0.2).';
