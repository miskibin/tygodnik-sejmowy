-- 0026_districts.sql
-- Electoral districts (Polish: okregi wyborcze) + postcode -> district lookup.
-- Source data composed from PKW (district definitions, gmina lists per district)
-- and GUS TERYT (postcode -> gmina). NOT from api.sejm.gov.pl.
--
-- 41 districts for term 10. Re-districting (PKW flagged 11 lose / 9 gain / 1 +2)
-- requires re-import; idempotent loaders handle it.
--
-- Field `district_num` matches the existing mps.district_num convention (which
-- already reflects api.sejm.gov.pl's districtNum). Other agents pulling MP data
-- can FK against districts(term, num) once both resources are populated.

-- ---------- districts ----------
create table if not exists districts (
  id           bigserial primary key,
  term         integer not null references terms(term),
  num          integer not null check (num between 1 and 41),
  name         text    not null,
  voivodeship  text    not null,
  mandates     integer not null check (mandates >= 1),
  seat_city    text,
  source_path  text,
  staged_at    timestamptz,
  loaded_at    timestamptz not null default now(),
  unique (term, num)
);
create index if not exists districts_term_idx on districts(term);

-- ---------- district_postcodes ----------
-- One postcode CAN map to multiple districts when it spans gminas. Caller picks
-- majority. `commune_teryt` is informational (no FK -- TERYT not modelled).
create table if not exists district_postcodes (
  id            bigserial primary key,
  term          integer not null references terms(term),
  postcode      text    not null check (postcode ~ '^\d{2}-\d{3}$'),
  district_num  integer not null,
  commune_teryt text,
  source_path   text,
  staged_at     timestamptz,
  loaded_at     timestamptz not null default now(),
  foreign key (term, district_num) references districts(term, num) deferrable initially deferred,
  unique (term, postcode, district_num)
);
create index if not exists district_postcodes_lookup_idx on district_postcodes(term, postcode);

-- ---------- raw stage tables ----------
create table if not exists _stage_districts (
  id          bigserial primary key,
  term        integer not null,
  natural_id  text    not null,                      -- district num as text
  payload     jsonb   not null,
  source_path text    not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (term, natural_id)
);

create table if not exists _stage_district_postcodes (
  id          bigserial primary key,
  term        integer not null,
  natural_id  text    not null,                      -- "{postcode}__{district_num}"
  payload     jsonb   not null,
  source_path text    not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (term, natural_id)
);

-- ---------- load_districts ----------
create or replace function load_districts(p_term integer default 10)
returns integer language plpgsql as $$
declare affected integer;
begin
  insert into districts(term, num, name, voivodeship, mandates, seat_city,
                        source_path, staged_at, loaded_at)
  select
    s.term,
    (s.payload->>'num')::int,
    s.payload->>'name',
    s.payload->>'voivodeship',
    (s.payload->>'mandates')::int,
    s.payload->>'seat_city',
    s.source_path, s.staged_at, now()
  from _stage_districts s
  where s.term = p_term
  on conflict (term, num) do update set
    name = excluded.name,
    voivodeship = excluded.voivodeship,
    mandates = excluded.mandates,
    seat_city = excluded.seat_city,
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;
  return affected;
end $$;

-- ---------- load_district_postcodes ----------
-- Replace-all per term: postcode -> gmina mappings churn between PKW redistrictings.
create or replace function load_district_postcodes(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
  missing_district text;
begin
  -- Hard-fail on dangling district_num references (would otherwise FK-error
  -- mid-insert and leave a half-loaded state).
  select s.payload->>'postcode' || '/' || (s.payload->>'district_num')
    into missing_district
  from _stage_district_postcodes s
  where s.term = p_term
    and not exists (
      select 1 from districts d
      where d.term = s.term and d.num = (s.payload->>'district_num')::int
    )
  limit 1;
  if missing_district is not null then
    raise exception 'unresolved district_num in district_postcodes: %', missing_district;
  end if;

  delete from district_postcodes where term = p_term;

  insert into district_postcodes(term, postcode, district_num, commune_teryt,
                                 source_path, staged_at, loaded_at)
  select
    s.term,
    s.payload->>'postcode',
    (s.payload->>'district_num')::int,
    s.payload->>'commune_teryt',
    s.source_path, s.staged_at, now()
  from _stage_district_postcodes s
  where s.term = p_term
  on conflict (term, postcode, district_num) do nothing;
  get diagnostics affected = row_count;
  return affected;
end $$;
