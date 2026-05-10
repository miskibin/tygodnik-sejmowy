-- 0001_core.sql
-- Core entities: terms, clubs, mps, votings, votes + raw stage tables.
-- Idempotent on natural keys. Enums for vote choice, voting kind, majority type.

create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists fuzzystrmatch;
create extension if not exists ltree;
create extension if not exists vector;

-- ---------- enums ----------
do $$ begin
  create type vote_choice as enum ('YES','NO','ABSTAIN','ABSENT','PRESENT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type voting_kind as enum ('ELECTRONIC','ON_LIST','TRADITIONAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type majority_type as enum (
    'SIMPLE_MAJORITY',
    'ABSOLUTE_MAJORITY',
    'ABSOLUTE_STATUTORY_MAJORITY',
    'STATUTORY_MAJORITY',
    'MAJORITY_THREE_FIFTHS',
    'MAJORITY_TWO_THIRDS'
  );
exception when duplicate_object then null; end $$;

-- ---------- terms ----------
create table if not exists terms (
  term integer primary key,
  created_at timestamptz not null default now()
);

-- ---------- clubs ----------
create table if not exists clubs (
  id            bigserial primary key,
  term          integer  not null references terms(term),
  club_id       text     not null,             -- e.g. 'PiS', 'KO'
  name          text     not null,
  members_count integer,
  email         text,
  phone         text,
  fax           text,
  is_inferred   boolean  not null default false, -- true when stub-created from MP/vote refs
  source_path   text,
  staged_at     timestamptz,
  loaded_at     timestamptz not null default now(),
  unique (term, club_id)
);
create index if not exists clubs_term_idx on clubs(term);

-- ---------- mps ----------
create table if not exists mps (
  id              bigserial primary key,
  term            integer not null references terms(term),
  mp_id           integer not null,
  active          boolean not null,
  first_name      text not null,
  last_name       text not null,
  second_name     text,
  first_last_name text not null,
  last_first_name text not null,
  accusative_name text not null,
  genitive_name   text not null,
  birth_date      date,
  birth_location  text,
  district_name   text,
  district_num    integer,
  voivodeship     text,
  education_level text,
  profession      text,
  email           text,
  number_of_votes integer,
  inactive_cause  text,
  waiver_desc     text,
  club_ref        text,                        -- raw club code as recorded on the MP row
  normalized_full_name text generated always as (
    lower(unaccent(trim(first_name) || ' ' || trim(last_name)))
  ) stored,
  source_path     text,
  staged_at       timestamptz,
  loaded_at       timestamptz not null default now(),
  unique (term, mp_id)
);
create index if not exists mps_term_idx on mps(term);
create index if not exists mps_normalized_full_name_trgm
  on mps using gin (normalized_full_name gin_trgm_ops);
create index if not exists mps_last_name_trgm
  on mps using gin (lower(last_name) gin_trgm_ops);

-- ---------- mp_club_membership ----------
create table if not exists mp_club_membership (
  id        bigserial primary key,
  term      integer not null references terms(term),
  mp_id     integer not null,
  club_id   text    not null,
  unique (term, mp_id, club_id),
  foreign key (term, mp_id)   references mps(term, mp_id) on delete cascade,
  foreign key (term, club_id) references clubs(term, club_id) on delete cascade
);

-- ---------- votings ----------
create table if not exists votings (
  id                 bigserial primary key,
  term               integer not null references terms(term),
  sitting            integer not null,
  sitting_day        integer not null,
  voting_number      integer not null,
  date               timestamptz not null,
  title              text not null,
  topic              text not null,
  description        text,
  kind               voting_kind not null,
  majority_type      majority_type not null,
  majority_votes     integer not null,
  yes                integer not null,
  no                 integer not null,
  abstain            integer not null,
  present            integer not null,
  not_participating  integer not null,
  total_voted        integer not null,
  source_path        text,
  staged_at          timestamptz,
  loaded_at          timestamptz not null default now(),
  unique (term, sitting, voting_number)
);
create index if not exists votings_date_idx on votings(date);
create index if not exists votings_term_sitting_idx on votings(term, sitting);

-- ---------- votes (one row per MP per voting) ----------
create table if not exists votes (
  id          bigserial primary key,
  voting_id   bigint not null references votings(id) on delete cascade,
  term        integer not null references terms(term),
  mp_id       integer not null,
  club_ref    text not null,
  vote        vote_choice not null,
  list_votes  jsonb,                            -- only populated for ON_LIST votings
  unique (voting_id, mp_id),
  foreign key (term, mp_id) references mps(term, mp_id) on delete cascade
);
create index if not exists votes_mp_idx on votes(term, mp_id);
create index if not exists votes_choice_idx on votes(vote);

-- ---------- raw stage tables ----------
create table if not exists _stage_mps (
  id          bigserial primary key,
  term        integer not null,
  natural_id  text    not null,                 -- mp_id as text
  payload     jsonb   not null,
  source_path text    not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (term, natural_id)
);

create table if not exists _stage_clubs (
  id          bigserial primary key,
  term        integer not null,
  natural_id  text    not null,                 -- club_id
  payload     jsonb   not null,
  source_path text    not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (term, natural_id)
);

create table if not exists _stage_votings (
  id          bigserial primary key,
  term        integer not null,
  natural_id  text    not null,                 -- '{sitting}__{voting_number}'
  payload     jsonb   not null,
  source_path text    not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (term, natural_id)
);

-- seed term 10
insert into terms(term) values (10) on conflict do nothing;
