-- prints.document_category — coarse classifier so frontend can filter Tygodnik
-- to actual legislative projects (`projekt_ustawy`) and route opinions /
-- attachments / personal motions / informational reports / Senate amendments
-- to a secondary section.
--
-- Heuristic principle: STRICT POSITIVE match for `projekt_ustawy` only when
-- the title starts with an explicit Sejm authorship marker
-- ("Rządowy/Poselski/Senacki/Komisyjny/Prezydencki/Obywatelski projekt
-- (ustawy|uchwały)"). Everything else falls through more specific buckets
-- so frontend's `WHERE document_category='projekt_ustawy'` returns ONLY
-- actual proposed legislation — no opinions, no informational reports, no
-- Senate-amendment turnarounds, no commemorative resolutions, no committee
-- reorganization motions, no votes of no confidence, etc.

alter table prints
  add column if not exists document_category text;

alter table prints drop constraint if exists prints_document_category_check;
alter table prints
  add constraint prints_document_category_check
  check (document_category is null or document_category in (
    'projekt_ustawy',           -- a proposed bill or resolution
    'opinia_organu',            -- expert body opinion (NRL, KRRP, BEOS, ...)
    'sprawozdanie_komisji',     -- committee report on a bill
    'autopoprawka',             -- self-amendment by the proposer
    'wniosek_personalny',       -- personnel: judge nomination, IPN president
    'pismo_marszalka',          -- transmittal letter
    'uchwala_upamietniajaca',   -- commemorative resolution / "Year of X"
    'uchwala_senatu',           -- Senate amendments returning to Sejm
    'weto_prezydenta',          -- presidential veto requiring re-vote
    'wotum_nieufnosci',         -- vote of no confidence in a minister
    'wniosek_organizacyjny',    -- procedural: Sejm committee composition
    'informacja',               -- informational report from a body
    'inne'                      -- catch-all (should be empty in practice)
  ));

-- POSIX regex notes:
--   `\b` is unreliable in PostgreSQL POSIX mode — using explicit `\s` or
--   `(\s|$)` to delimit instead. ~* is case-insensitive matching.
update prints set document_category = case
  when title ~* '^autopoprawka' then 'autopoprawka'
  when title ~* '^wniosek\s+prezydenta\s+(rp\s+)?o\s+ponowne\s+rozpatrzenie' then 'weto_prezydenta'
  when title ~* 'wotum\s+nieufności' then 'wotum_nieufnosci'
  when title ~* '^wniosek\s+(o\s+)?(powołani[ae]|odwołani[ae]|wybór)' then 'wniosek_personalny'
  when title ~* '^kandydat\s+na\s+stanowisko' then 'wniosek_personalny'
  when title ~* '^opinia\s+komisji.*wniosk.*(wybor|powołani|odwołani|sędzi)' then 'wniosek_personalny'
  when title ~* '^pismo\s+(marszał|prezydent|prezesa)' then 'pismo_marszalka'
  when title ~* '(upamiętni|rokiem\s+\w)' then 'uchwala_upamietniajaca'
  when title ~* '^uchwała\s+senatu\s+w\s+sprawie\s+ustawy' then 'uchwala_senatu'
  when title ~* '^(opinia|stanowisko|uwagi)(\s|$)' then 'opinia_organu'
  when parent_number is not null then 'opinia_organu'
  when title ~* 'wniosek\s+w\s+sprawie\s+(zmian\s+w\s+składach|wyboru\s+składu)' then 'wniosek_organizacyjny'
  when title ~* '^przedstawiony\s+przez\s+prezydium\s+sejmu\s+wniosek' then 'wniosek_organizacyjny'
  when title ~* '^przedstawiony\s+przez\s+prezydium\s+sejmu\s+projekt\s+uchwały\s+w\s+sprawie\s+zmiany\s+regulaminu' then 'wniosek_organizacyjny'
  when title ~* '^wniosek\s+rady\s+ministrów' then 'wniosek_organizacyjny'
  when title ~* '^informacja(\s|$)' then 'informacja'
  when title ~* '^sprawozdanie\s+z\s+działalności' then 'informacja'
  when title ~* '^sprawozdanie\s+ministra' then 'informacja'
  when title ~* '^sprawozdanie\s+o\s+stanie' then 'informacja'
  when title ~* '^sprawozdanie\s+ze\s+stanu' then 'informacja'
  when title ~* '^zawiadomienie\s+prezesa\s+rady\s+ministrów' then 'informacja'
  when title ~* '^przegląd\s+funkcjonowania' then 'informacja'
  when title ~* '^(dodatkowe\s+)?sprawozdanie\s+komisji' then 'sprawozdanie_komisji'
  when title ~* '^(rządowy|poselski|senacki|komisyjny|prezydencki|obywatelski|przedstawiony\s+przez\s+prezydenta|przedstawiony\s+przez\s+prezydium\s+sejmu)\s+projekt\s+(ustawy|uchwały)' then 'projekt_ustawy'
  else 'inne'
end;

create index if not exists prints_document_category_idx
  on prints (document_category, term);
