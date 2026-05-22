-- 0101_print_sitting_assignment_agenda.sql
--
-- Citizen review (2026-05-22): posiedzenie 57 had 18 eligible bills on its
-- agenda but only 1 surfaced in Tygodnik. Root cause analysis on prod:
--
--   * 0059 keyed print_sitting_assignment off process_stages.sitting_num
--     and used `distinct on (print_id) ... order by sitting_num desc` —
--     each print landed on exactly ONE sitting (the latest stage).
--   * Consequence #1: bills with stages at multiple sittings only showed
--     at the latest one (e.g. I czytanie at 57, vote at 58 → only 58).
--   * Consequence #2: bills whose process_stages.sitting_num wasn't
--     backfilled showed nowhere (10 of the 18 sitting-57 candidates had
--     no process_stages row pointing at 57 at all).
--
-- Fix: assign each print to ALL sittings where it appears on the agenda
-- (agenda_items + agenda_item_prints — the authoritative "what was
-- debated this week" source). UNION-ed with the legacy process_stages
-- assignment so back-compat is preserved (~134 (print, sitting) rows
-- exist in process_stages without a matching agenda entry — committee
-- work, procedural votes — and stay visible).
--
-- Implication: print_sitting_assignment is now multi-row per print. A
-- bill debated at sittings 56, 57, and voted at 58 surfaces in all three
-- Tygodnik issues. Per product decision 2026-05-22 — matches the
-- "what was debated this week" mental model citizens have.

-- Note: explicit public.* qualification on the view + base tables is
-- required because exec_sql() runs with `search_path = pg_catalog, public,
-- pg_temp`. Without the prefix, CREATE VIEW would attempt to land in
-- pg_catalog and fail with `permission denied for schema pg_catalog`.

create or replace view public.print_sitting_assignment as
  -- Source 1: every (print, sitting) pair from the agenda.
  select distinct
    pr.id     as print_id,
    pr.term   as term,
    pc.number as sitting_num
  from prints pr
  join agenda_item_prints aip
    on aip.term = pr.term and aip.print_number = pr.number
  join agenda_items ai on ai.id = aip.agenda_item_id
  join proceedings pc on pc.id = ai.proceeding_id

  union

  -- Source 2: legacy process_stages mapping. Keeps prints visible whose
  -- process touched a sitting without showing up on its agenda (committee
  -- work etc.). 0059 used `distinct on + order desc` so only the latest
  -- sitting bubbled up; here we keep all distinct (print, sitting) pairs.
  select distinct
    pr.id        as print_id,
    pr.term      as term,
    ps.sitting_num
  from prints pr
  join processes p
    on p.term = pr.term and p.number = pr.number
  join process_stages ps
    on ps.process_id = p.id
  where ps.sitting_num is not null;

comment on view public.print_sitting_assignment is
  'Each print -> every sitting (posiedzenie) where it was on the agenda OR had a process stage. Multi-row per print: a bill debated at sittings 56, 57, 58 surfaces in all three Tygodnik feeds. Replaces 0059 single-row distinct-on logic.';
