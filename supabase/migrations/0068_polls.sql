-- 0068_polls.sql
-- Sejm-only opinion polls. Wikipedia EN primary. Schema per user spec
-- (simpler than research plan §3): no poll_parties lookup, no _stage_polls.

create table if not exists pollsters (
  code                  text primary key,
  name_full             text not null,
  website               text,
  methodology_default   text,
  bias_assessment       text,
  country               text not null default 'PL',
  loaded_at             timestamptz not null default now()
);

create table if not exists polls (
  id                    bigserial primary key,
  pollster              text not null references pollsters(code),
  conducted_at_start    date not null,
  conducted_at_end      date not null,
  published_at          date,
  sample_size           int,
  methodology           text,
  source                text not null,
  source_url            text not null,
  source_path           text,
  election_target       text not null default 'sejm',
  staged_at             timestamptz,
  loaded_at             timestamptz,
  check (conducted_at_end >= conducted_at_start),
  check (sample_size is null or sample_size > 0),
  check (source in ('wikipedia_en','wikipedia_pl','manual')),
  check (election_target = 'sejm'),
  unique (pollster, conducted_at_end, sample_size, election_target)
);

create index if not exists polls_pollster_end_idx
  on polls (pollster, conducted_at_end desc);
create index if not exists polls_party_end_idx
  on polls (conducted_at_end desc);
-- Hot-path partial for current-term polling. Constant cutoff (post-2023
-- election); now()-based predicate would require IMMUTABLE marker.
create index if not exists polls_recent_idx
  on polls (conducted_at_end desc)
  where conducted_at_end >= date '2025-01-01';

create table if not exists poll_results (
  poll_id        bigint not null references polls(id) on delete cascade,
  party_code     text   not null,
  percentage     numeric(5,2),
  seats_estimate int,
  primary key (poll_id, party_code),
  check (percentage is null or (percentage >= 0 and percentage <= 100))
);

create index if not exists poll_results_party_idx
  on poll_results (party_code, poll_id);

-- Pollster seed. Codes are the canonical ones the parser maps Wikipedia
-- header text into. 'Aggregator' is a fallback bucket for rows whose
-- pollster cell is the article's own moving-average row.
insert into pollsters (code, name_full, website) values
  ('IBRiS',           'Instytut Badań Rynkowych i Społecznych', 'https://ibris.pl'),
  ('CBOS',            'Centrum Badania Opinii Społecznej',     'https://www.cbos.pl'),
  ('Kantar',          'Kantar Public Polska',                  'https://www.kantarpublic.com'),
  ('Pollster',        'Pollster',                              null),
  ('OpiniaSpektrum',  'Opinia Spektrum',                       null),
  ('Opinia24',        'Opinia24',                              null),
  ('UnitedSurveys',   'United Surveys (DRB)',                  null),
  ('SocialChanges',   'Social Changes',                        null),
  ('OGB',             'Ogólnopolska Grupa Badawcza',           null),
  ('IBSP',            'Instytut Badań Spraw Publicznych',      null),
  ('Estymator',       'Estymator',                             null),
  ('IPSOS',           'Ipsos Polska',                          'https://www.ipsos.com/pl-pl'),
  ('PBS',             'PBS sp. z o.o.',                        'https://www.pbs.pl'),
  ('Sondaz.pl',       'Sondaz.pl',                             null),
  ('ResearchPartner', 'Research Partner',                      null),
  ('CBMIndicator',    'CBM Indicator',                         null),
  ('Aggregator',      'Aggregator (no pollster identified)',   null)
on conflict (code) do update
  set name_full = excluded.name_full,
      website   = coalesce(excluded.website, pollsters.website);
