-- ============================================================================
-- 0036_acts.sql -- ELI acts (Polish legal acts).
-- Source: api.sejm.gov.pl/eli/acts/{publisher}/{year}/{position}
-- Natural key: eli_id ("DU/2025/1900") -- globally unique.
-- ----------------------------------------------------------------------------
-- API field shape (verified from real responses):
--   ELI                 -> eli_id
--   publisher           -> publisher (e.g. "DU")
--   year, pos           -> year, position
--   type                -> type ("Ustawa", "Rozporzadzenie", "Obwieszczenie", ...)
--   title               -> title
--   status              -> status (Polish, "obowiazujacy" / "uchylony" / ...)
--   inForce             -> in_force (enum-like text "IN_FORCE"/"REPEALED"/...)
--   announcementDate    -> announcement_date  (date the act was issued)
--   promulgation        -> promulgation_date  (date published in Dz.U.)
--   legalStatusDate     -> legal_status_date  (date of the inForce status)
--   changeDate          -> change_date        (timestamptz of last metadata refresh)
--   address             -> address            (e.g. "WDU20250001900")
--   display_address     -> display_address    (e.g. "Dz.U. 2025 poz. 1900")
--   keywords            -> keywords (array)
-- The full response also has prints[], references{}, directives[], texts[] -- those
-- are persisted on the staging payload and shredded by load functions.
-- ============================================================================

create table if not exists acts (
  id                  bigserial primary key,
  eli_id              text not null unique,
  term                integer references terms(term),  -- nullable: many acts pre-date term 10
  publisher           text not null,
  year                integer not null,
  position            integer not null,
  type                text not null,
  title               text not null,
  status              text,
  in_force            text,                        -- "IN_FORCE" / "REPEALED" / ...
  announcement_date   date,
  promulgation_date   date,
  legal_status_date   date,
  change_date         timestamptz,
  address             text,
  display_address     text,
  keywords            text[] not null default '{}',
  source_url          text not null,
  source_path         text not null,
  staged_at           timestamptz,
  loaded_at           timestamptz not null default now(),
  unique (publisher, year, position),
  check (year > 1800 and year < 2200),
  check (position > 0)
);
create index if not exists acts_eli_idx        on acts(eli_id);
create index if not exists acts_year_idx       on acts(year desc);
create index if not exists acts_status_idx     on acts(status);
create index if not exists acts_in_force_idx   on acts(in_force);
create index if not exists acts_type_idx       on acts(type);

create table if not exists _stage_acts (
  id          bigserial primary key,
  eli_id      text not null,
  payload     jsonb not null,
  source_path text not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (eli_id)
);

-- load_acts -- shred staged acts payloads into acts; idempotent on (publisher, year, position).
-- Argument-less to match the load orchestrator, which passes p_term to every fn.
-- We accept p_term to keep the signature uniform but ignore it (acts are
-- term-agnostic; term is derived per-row from the act itself when relevant).
create or replace function load_acts(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  insert into acts(
    eli_id, term, publisher, year, position, type, title, status, in_force,
    announcement_date, promulgation_date, legal_status_date, change_date,
    address, display_address, keywords, source_url, source_path, staged_at, loaded_at
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
    staged_at         = excluded.staged_at,
    loaded_at         = now();
  get diagnostics affected = row_count;
  return affected;
end $$;
