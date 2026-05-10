-- 0077_acts_act_kind.sql
-- Citizen-facing classification of every ELI act so the Tygodnik
-- "Wchodzi w życie" section can surface only ustawa_nowa / nowelizacja
-- and split republications (tekst_jednolity, plain obwieszczenie) into a
-- separate "Aktualizacje prawa" sub-section.
--
-- Citizen review #13: "Wchodzi w życie" was leading with items like
--   "01 DU 2026/610 · Ewidencja producentów rolnych (tekst jednolity) ·
--    Obwieszczenie"
-- which is a Marszałek-issued republication (consolidated text), NOT a new
-- law. Showing those at the top makes the section look like AI slop.
--
-- Mapping is deterministic from acts.type + acts.title — no LLM needed.
-- Verified across 7375 fixtures (2026-05-10 sample):
--   Rozporządzenie       2440  -> rozporzadzenie
--   Obwieszczenie        2129  -> tekst_jednolity (most) / obwieszczenie
--   Postanowienie        1058  -> inne
--   Uchwała               618  -> uchwala_sejmu / inne (Sąd Najwyższy etc.)
--   Ustawa                402  -> ustawa_nowa / nowelizacja
--   Komunikat / Zarządzenie / Oświadczenie rządowe / Umowa międzynarodowa /
--   Ogłoszenie / Orzeczenie / Protokół / Apel  -> inne
--
-- Discriminators:
--   - title ILIKE '%o ratyfikacji%'      ⇒ ustawa_nowa (ratifications stay
--     classified as new ustawa even if their title also says "o zmianie",
--     because they ratify an external instrument rather than amend Polish law)
--   - title ILIKE '%o zmianie%' OR
--     '%zmieniająca ustaw%'              ⇒ nowelizacja (covers "o zmianie
--     ustawy", "o zmianie niektórych ustaw", "o zmianie ustaw...", and the
--     older "Ustawa zmieniająca ustawę..." drafting style)
--   - title ILIKE '%jednolit%tekst%'     ⇒ tekst_jednolity (Obwieszczenie body
--     always reads "w sprawie ogłoszenia jednolitego tekstu ustawy/rozporządzenia ...")
--   - 'Uchwała Sejmu...' prefix          ⇒ uchwala_sejmu (Sejm resolution; the
--     other Uchwały are Sąd Najwyższy / Senat / KRS — citizen-irrelevant)
--
-- We DON'T drop teksty jednolite from ETL — only classify. The Tygodnik
-- query layer filters; the rest of the app (full-text search, MV stats,
-- act detail pages) keeps every row.

alter table acts
  add column if not exists act_kind text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'acts_act_kind_enum' and conrelid = 'acts'::regclass
  ) then
    alter table acts
      add constraint acts_act_kind_enum
      check (act_kind is null or act_kind in (
        'ustawa_nowa', 'nowelizacja', 'tekst_jednolity', 'obwieszczenie',
        'rozporzadzenie', 'uchwala_sejmu', 'inne'
      ));
  end if;
end $$;

create index if not exists acts_act_kind_idx on acts (act_kind);

-- compute_act_kind: pure deterministic classifier. Inputs mirror columns
-- already present on every acts row. Mirrored 1:1 in
-- supagraf/enrich/acts.py:classify_act so the Python enricher and the SQL
-- view stay in lockstep — change one, change both.
create or replace function compute_act_kind(
  p_type text,
  p_title text
) returns text language sql immutable as $$
  select case
    -- Ratifications / withdrawals: new ustawa even if the title carries
    -- "o zmianie" (e.g. ratification of an amending protocol).
    when p_type = 'Ustawa'
         and (p_title ilike '%o ratyfikacji%' or p_title ilike '%o wypowiedzeniu%')
      then 'ustawa_nowa'
    when p_type = 'Ustawa'
         and (p_title ilike '%o zmianie%' or p_title ilike '%zmieniająca ustaw%')
      then 'nowelizacja'
    when p_type = 'Ustawa'
      then 'ustawa_nowa'
    when p_type = 'Obwieszczenie' and p_title ilike '%jednolit%tekst%'
      then 'tekst_jednolity'
    when p_type = 'Obwieszczenie'
      then 'obwieszczenie'
    when p_type = 'Rozporządzenie'
      then 'rozporzadzenie'
    when p_type = 'Uchwała' and p_title ilike 'Uchwała Sejmu%'
      then 'uchwala_sejmu'
    else 'inne'
  end
$$;

-- One-shot backfill for every existing row. Deterministic + cheap (~7k rows
-- as of 2026-05). Re-running is a no-op (WHERE clause skips rows already
-- matching).
update acts
set act_kind = compute_act_kind(type, title)
where act_kind is distinct from compute_act_kind(type, title);

-- Wire act_kind into load_acts so future loads stamp it on insert/update.
-- Body otherwise identical to 0036's definition.
create or replace function load_acts(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  insert into acts(
    eli_id, term, publisher, year, position, type, title, status, in_force,
    announcement_date, promulgation_date, legal_status_date, change_date,
    address, display_address, keywords, source_url, source_path,
    act_kind, staged_at, loaded_at
  )
  select
    s.eli_id,
    nullif(s.payload->>'term','')::int,
    s.payload->>'publisher',
    (s.payload->>'year')::int,
    coalesce(
      nullif(s.payload->>'position','')::int,
      nullif(s.payload->>'pos','')::int
    ),
    s.payload->>'type',
    s.payload->>'title',
    s.payload->>'status',
    s.payload->>'inForce',
    nullif(s.payload->>'announcementDate','')::date,
    nullif(s.payload->>'promulgation','')::date,
    nullif(s.payload->>'legalStatusDate','')::date,
    nullif(s.payload->>'changeDate','')::timestamptz,
    s.payload->>'address',
    s.payload->>'displayAddress',
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(s.payload->'keywords')),
      '{}'
    ),
    coalesce(
      s.payload->>'sourceUrl',
      'https://api.sejm.gov.pl/eli/acts/' || (s.payload->>'publisher') || '/' ||
        (s.payload->>'year') || '/' ||
        coalesce(s.payload->>'position', s.payload->>'pos')
    ),
    s.source_path,
    compute_act_kind(s.payload->>'type', s.payload->>'title'),
    s.staged_at,
    now()
  from _stage_acts s
  on conflict (publisher, year, position) do update set
    eli_id            = excluded.eli_id,
    term              = excluded.term,
    type              = excluded.type,
    title             = excluded.title,
    status            = excluded.status,
    in_force          = excluded.in_force,
    announcement_date = excluded.announcement_date,
    promulgation_date = excluded.promulgation_date,
    legal_status_date = excluded.legal_status_date,
    change_date       = excluded.change_date,
    address           = excluded.address,
    display_address   = excluded.display_address,
    keywords          = excluded.keywords,
    source_url        = excluded.source_url,
    source_path       = excluded.source_path,
    act_kind          = excluded.act_kind,
    staged_at         = excluded.staged_at,
    loaded_at         = now();
  get diagnostics affected = row_count;
  return affected;
end $$;

comment on column acts.act_kind is
  'Citizen-facing classification — derived deterministically from type + title '
  'via compute_act_kind(). Used by Tygodnik "Wchodzi w życie" filter so the '
  'section shows only ustawa_nowa / nowelizacja by default and segregates '
  'tekst_jednolity / obwieszczenie / rozporzadzenie / uchwala_sejmu / inne '
  'into a separate "Aktualizacje prawa" sub-section.';
