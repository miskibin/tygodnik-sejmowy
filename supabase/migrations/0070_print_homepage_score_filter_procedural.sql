-- 0066_print_homepage_score_filter_procedural.sql
--
-- Citizen review (2026-05-08) flagged that procedural projekty (LLM-flagged
-- via prints.is_procedural) still rank in print_homepage_score and surface
-- on the homepage feed. The original 0045 view filters only on
-- document_category = 'projekt_ustawy' and exposes is_procedural in the
-- SELECT but never excludes it.
--
-- This migration recreates the view with an additional WHERE clause that
-- drops procedural prints from the rankable set entirely. The
-- prints_is_procedural_idx (created in 0045) supports the filter.

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
where p.document_category = 'projekt_ustawy'
  and coalesce(p.is_procedural, false) = false;

comment on view print_homepage_score is
  'Computed 0..1 score for ranking projekt_ustawy entries on the homepage feed. Combines severity (0.5), actionability (0.3), and audience clarity (0.2). Excludes procedural prints (is_procedural=true) per citizen review 2026-05-08.';
