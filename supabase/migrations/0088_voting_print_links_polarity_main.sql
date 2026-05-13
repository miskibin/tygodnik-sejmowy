-- 0088: voting_print_links.role='main' must imply motion_polarity='pass'.
--
-- Issue #25 follow-up²: backfill_voting_print_links wrote role='main' on any
-- voting that appears in a process_stages.voting JSON, regardless of what the
-- motion was actually about. For druk 10/2449 (Prawo oświatowe) the only
-- voting (1517) is a "wniosek o odrzucenie" — a procedural reject motion —
-- yet was tagged role='main', driving the /druk sidebar to label it
-- "Głosowanie końcowe" and the related-votings chip "całość".
--
-- PR #30 papered over this on the UI side using motion_polarity. This
-- migration fixes the root cause:
--
--   role='main' ⇒ motion_polarity='pass'  (third-reading completion vote)
--
-- Rows whose linked voting has motion_polarity ∈ {reject, amendment,
-- minority, procedural} are demoted. NULL polarity is left alone — the
-- classifier may legitimately fail to recognise a third-reading topic
-- phrasing, and demoting those would lose information.
--
-- We don't add a CHECK constraint because role='main' is set by the
-- application layer at backfill time; the corresponding Python code change
-- (supagraf/backfill/etl_review.py:_role_from_polarity) enforces the
-- invariant going forward. A future migration could add a trigger that
-- recomputes role on UPDATE of votings.motion_polarity.

with reclassified as (
  select vpl.voting_id, vpl.print_id, v.motion_polarity
  from voting_print_links vpl
  join votings v on v.id = vpl.voting_id
  where vpl.role = 'main'
    and v.motion_polarity is not null
    and v.motion_polarity != 'pass'
)
update voting_print_links vpl
set role = case
    when r.motion_polarity = 'amendment' then 'poprawka'
    else 'other'
  end
from reclassified r
where vpl.voting_id = r.voting_id
  and vpl.print_id  = r.print_id;
