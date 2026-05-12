-- 0083_committee_sittings.sql
-- Phase 1 committee deepening: sittings metadata + agenda HTML + video links.
-- Source: GET /sejm/term{N}/committees/{code}/sittings → array of sittings.
-- Each sitting has nested video[] (komisja|podkomisja stream URLs).
-- Replace-all per term on load: sittings are an authoritative snapshot
-- (status can flip FINISHED→ONGOING, agenda may be edited mid-cycle).

-- ---------- committee_sittings ----------
create table if not exists committee_sittings (
  id            bigserial primary key,
  committee_id  bigint  not null references committees(id) on delete cascade,
  term          integer not null references terms(term),
  num           integer not null,
  date          date,
  start_at      timestamptz,
  end_at        timestamptz,
  room          text,
  status        text,
  closed        boolean not null default false,
  remote        boolean not null default false,
  agenda_html   text,
  source_path   text,
  captured_at   timestamptz,
  staged_at     timestamptz,
  loaded_at     timestamptz not null default now(),
  unique (committee_id, num),
  check (term > 0),
  check (status is null or status in ('FINISHED','ONGOING','PLANNED'))
);
create index if not exists committee_sittings_committee_idx on committee_sittings(committee_id);
create index if not exists committee_sittings_date_idx      on committee_sittings(date desc);
create index if not exists committee_sittings_term_idx      on committee_sittings(term);

-- ---------- committee_sitting_videos ----------
create table if not exists committee_sitting_videos (
  id          bigserial primary key,
  sitting_id  bigint  not null references committee_sittings(id) on delete cascade,
  unid        text    not null,
  video_link  text,
  player_link text,
  transcribe  boolean not null default false,
  video_type  text,
  unique (sitting_id, unid)
);
create index if not exists committee_sitting_videos_sitting_idx on committee_sitting_videos(sitting_id);

-- ---------- raw stage ----------
-- One stage row per committee. payload = {"code": "...", "sittings": [...]}.
create table if not exists _stage_committee_sittings (
  id          bigserial primary key,
  term        integer not null,
  natural_id  text    not null,
  payload     jsonb   not null,
  source_path text    not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (term, natural_id)
);

-- ---------- load_committee_sittings ----------
-- Idempotent upsert keyed on (committee_id, num). Preserves stable `id`
-- across daily runs (any downstream FK survives), mutates rows in place for
-- status/agenda/end_at drift, no-ops on unchanged rows.
create or replace function load_committee_sittings(p_term integer default 10)
returns integer language plpgsql as $$
declare affected integer;
begin
  with ins as (
    insert into committee_sittings(committee_id, term, num, date, start_at, end_at,
                                   room, status, closed, remote, agenda_html,
                                   source_path, captured_at, staged_at, loaded_at)
    select
      c.id,
      s.term,
      (sit->>'num')::int,
      nullif(sit->>'date','')::date,
      nullif(sit->>'startDateTime','')::timestamptz,
      nullif(sit->>'endDateTime','')::timestamptz,
      nullif(sit->>'room',''),
      nullif(sit->>'status',''),
      coalesce((sit->>'closed')::bool, false),
      coalesce((sit->>'remote')::bool, false),
      nullif(sit->>'agenda',''),
      s.source_path,
      s.captured_at,
      s.staged_at,
      now()
    from _stage_committee_sittings s
    join committees c on c.term = s.term and c.code = s.payload->>'code'
    cross join lateral jsonb_array_elements(coalesce(s.payload->'sittings','[]'::jsonb)) as sit
    where s.term = p_term
      and sit ? 'num'
    on conflict (committee_id, num) do update set
      date        = excluded.date,
      start_at    = excluded.start_at,
      end_at      = excluded.end_at,
      room        = excluded.room,
      status      = excluded.status,
      closed      = excluded.closed,
      remote      = excluded.remote,
      agenda_html = excluded.agenda_html,
      source_path = excluded.source_path,
      captured_at = excluded.captured_at,
      staged_at   = excluded.staged_at,
      loaded_at   = excluded.loaded_at
    returning 1
  )
  select count(*) into affected from ins;

  insert into committee_sitting_videos(sitting_id, unid, video_link, player_link,
                                       transcribe, video_type)
  select
    cs.id,
    v->>'unid',
    v->>'videoLink',
    v->>'playerLink',
    coalesce((v->>'transcribe')::bool, false),
    v->>'type'
  from _stage_committee_sittings s
  join committees c on c.term = s.term and c.code = s.payload->>'code'
  cross join lateral jsonb_array_elements(coalesce(s.payload->'sittings','[]'::jsonb)) as sit
  join committee_sittings cs on cs.committee_id = c.id and cs.num = (sit->>'num')::int
  cross join lateral jsonb_array_elements(coalesce(sit->'video','[]'::jsonb)) as v
  where s.term = p_term
    and v->>'unid' is not null and v->>'unid' <> ''
  on conflict (sitting_id, unid) do update set
    video_link  = excluded.video_link,
    player_link = excluded.player_link,
    transcribe  = excluded.transcribe,
    video_type  = excluded.video_type;

  return affected;
end $$;

-- (assert_invariants intentionally NOT extended here — see 0009/0019 pattern;
-- field additions belong in their own follow-up migration that knows the
-- full prior jsonb shape, to avoid clobbering fields added between 0019..NN.)
