-- 0044_persona_population.sql
--
-- Static lookup mapping each of the 25 persona tags to an estimated PL
-- population (issue #9 in citizen review). Until now the LLM was asked to
-- guess `est_population` inside `prints.affected_groups` jsonb, which made
-- severity meaningless because the numbers were essentially fabricated.
--
-- This table holds a single source of truth derived from public statistics
-- (GUS, NFZ, CEPiK, PZW, PZL, etc.). The LLM must NOT populate
-- `est_population` in `affected_groups` anymore; the frontend joins to
-- `persona_population` at query time so labels render as e.g.
--   "dotyczy 2,6 mln samozatrudnionych"
-- instead of just "jdg".
--
-- Idempotent: re-running this migration upserts every row.

create table if not exists persona_population (
  tag text primary key,
  est_population bigint not null,
  source_year int not null,
  source_note text,
  updated_at timestamptz default now()
);

insert into persona_population (tag, est_population, source_year, source_note) values
  ('najemca',                  4500000,  2024, 'GUS BAEL 2024 - households renting'),
  ('wlasciciel-mieszkania',   19000000,  2024, 'GUS - homeowners ~80% of population'),
  ('rodzic-ucznia',            4800000,  2024, 'GUS - parents of school-age children'),
  ('pacjent-nfz',             38000000,  2024, 'NFZ - insured population'),
  ('kierowca-zawodowy',         750000,  2024, 'GUS - professional drivers'),
  ('rolnik',                   1300000,  2024, 'KRUS / GUS - farmers'),
  ('jdg',                      2600000,  2024, 'CEIDG - solopreneurs (jednoosobowa dzialalnosc)'),
  ('emeryt',                   9200000,  2024, 'ZUS / GUS - pensioners'),
  ('pracownik-najemny',       13000000,  2024, 'GUS BAEL - employees on contract'),
  ('student',                  1200000,  2024, 'GUS - higher education students'),
  ('przedsiebiorca-pracodawca', 600000,  2024, 'GUS - firms with employees'),
  ('niepelnosprawny',          4700000,  2024, 'GUS - people with disabilities'),
  ('wies',                    14900000,  2024, 'GUS - rural population'),
  ('duze-miasto',             11700000,  2024, 'GUS - cities >=100k inhabitants'),
  ('podatnik-pit',            26000000,  2024, 'MF - PIT taxpayers'),
  ('podatnik-vat',             1900000,  2024, 'MF - active VAT payers (businesses)'),
  ('kierowca-prywatny',       21000000,  2024, 'CEPiK - driving licence holders'),
  ('odbiorca-energii',        14500000,  2024, 'URE / GUS - household energy consumers'),
  ('beneficjent-rodzinny',     6800000,  2024, 'ZUS - 800+ recipients (adults+children)'),
  ('opiekun-seniora',          2400000,  2024, 'GUS - informal carers of seniors'),
  ('dzialkowicz',               900000,  2024, 'PZD ROD - allotment garden members'),
  ('wedkarz',                   600000,  2024, 'PZW - registered anglers'),
  ('mysliwy',                   130000,  2024, 'PZL - hunters'),
  ('hodowca',                  1400000,  2024, 'GUS - livestock farmers / breeders'),
  ('konsument',               38000000,  2024, 'GUS - total population (everyone consumes)')
on conflict (tag) do update set
  est_population = excluded.est_population,
  source_year    = excluded.source_year,
  source_note    = excluded.source_note,
  updated_at     = now();

comment on table persona_population is
  'Static PL population estimates per persona tag. Feeds frontend rendering of prints.affected_groups (issue #9). LLM must NOT generate est_population in affected_groups anymore - frontend joins to this table.';

-- View that explodes prints.affected_groups jsonb and joins population data.
create or replace view print_affected_with_population as
select
  p.id            as print_id,
  p.number        as print_number,
  p.term,
  ag->>'tag'      as tag,
  ag->>'severity' as severity,
  pp.est_population,
  pp.source_year,
  pp.source_note
from prints p,
  lateral jsonb_array_elements(p.affected_groups) ag
  left join persona_population pp on pp.tag = ag->>'tag'
where p.affected_groups is not null
  and jsonb_array_length(p.affected_groups) > 0;

comment on view print_affected_with_population is
  'Exploded view of prints.affected_groups joined to persona_population. One row per (print, persona tag).';
