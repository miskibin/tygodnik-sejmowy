-- 0080_persona_population_imigrant.sql
--
-- Add `imigrant` row to persona_population (taxonomy widening to 26 tags).
-- Sejm regularly legislates on legalization, zatrudnianie cudzoziemców, status
-- uchodźcy, integrację — yet the previous 25-tag set had no persona covering
-- foreigners, so those prints surfaced nowhere on the homepage filter row.
--
-- Population estimate ~2.0 mln: foreigners with karta pobytu + Ukrainian PESEL
-- UKR holders post-2022. Conservative midpoint of UDSC / GUS 2024 figures.
--
-- Backend Literal/Tuple addition lives in
-- supagraf/enrich/print_personas.py:PERSONA_TAGS. Frontend chip lives in
-- frontend/lib/personas.ts. Prompts bumped (print_personas v2,
-- print_unified v5, print_impact v3).
--
-- Idempotent — re-running upserts the row.

insert into persona_population (tag, est_population, source_year, source_note) values
  ('imigrant', 2000000, 2024, 'UDSC / GUS - foreigners with residence permits + PESEL UKR')
on conflict (tag) do update set
  est_population = excluded.est_population,
  source_year    = excluded.source_year,
  source_note    = excluded.source_note,
  updated_at     = now();
