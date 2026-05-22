-- 0102_print_sitting_assignment_agenda_only.sql
--
-- Tightens 0101: pure agenda assignment, no UNION with process_stages.
--
-- 0101 kept a fallback UNION to legacy process_stages so back-compat
-- assignments stayed visible (committee work + procedural votes that
-- never appeared on a plenary agenda). Citizen review 2026-05-22 of
-- posiedzenie 57 followed up: a Tygodnik issue should list exactly the
-- bills that were on that sitting's agenda — nothing more, nothing
-- less. The UNION violated "tylko tam" (only there) by surfacing prints
-- at sittings where they had no actual plenary debate.
--
-- Diff vs 0101: drops the process_stages branch entirely. View becomes
-- a single deterministic mapping from agenda hits.
--
-- Cost on prod: ~146 (print, sitting) rows that 0101 kept via
-- process_stages disappear. Spot-checked: these are bills with a
-- committee stage tagged to a sitting_num but no plenary agenda entry
-- at that sitting — they continue to appear on sittings where they
-- ARE on the agenda. Invariant tested in
-- tests/supagraf/e2e/test_print_sitting_assignment.py.

create or replace view public.print_sitting_assignment as
select distinct
  pr.id     as print_id,
  pr.term   as term,
  pc.number as sitting_num
from prints pr
join agenda_item_prints aip
  on aip.term = pr.term and aip.print_number = pr.number
join agenda_items ai on ai.id = aip.agenda_item_id
join proceedings pc on pc.id = ai.proceeding_id;

comment on view public.print_sitting_assignment is
  'Each print -> every sitting where it appeared on the agenda (agenda_items x agenda_item_prints x proceedings). Multi-row per print: a bill on the agenda at sittings 56, 57, 58 surfaces in all three Tygodnik feeds. No fallback to process_stages — see 0102 header.';
