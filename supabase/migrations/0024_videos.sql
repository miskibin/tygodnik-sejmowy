-- 0024_videos.sql
-- E3: Sejm video transmissions (committees, plenary, conferences).
-- Natural id: unid (long hex). Hard FK to committees(id) via junction
-- video_committees(role IN 'committee'|'subcommittee'). Load fn splits
-- comma-joined committee strings ("PSN, PSR" / "ESK03S, SUE02S"), stub-extends
-- committees on any miss (mirrors 0021 pattern), and HARD FAILS if anything
-- still doesn't resolve. No silent dangling.
--
-- Audit-derived enums:
--   type ∈ ('komisja','podkomisja','posiedzenie','konferencja','inne')
--
-- Audit shape: 1000 entity files. Fields: room, startDateTime, title,
--   transcribe, type, unid (1000); playerLink, playerLinkIFrame, videoLink (985);
--   endDateTime (956); description (902); committee (574); subcommittee (179);
--   otherVideoLinks (41 — array of URLs); audio (4).

-- ---------- videos ----------
create table if not exists videos (
  id                  bigserial primary key,
  term                integer not null references terms(term),
  unid                text    not null,
  type                text    not null,
  title               text    not null,
  description         text,
  room                text    not null,
  start_datetime      timestamptz not null,
  end_datetime        timestamptz,
  transcribe          boolean not null default false,
  committee_code      text,                                  -- raw (may be comma-joined)
  subcommittee_code   text,                                  -- raw (may be comma-joined)
  player_link         text,
  player_link_iframe  text,
  video_link          text,
  other_video_links   text[],
  audio               text,
  source_path         text,
  staged_at           timestamptz,
  loaded_at           timestamptz not null default now(),
  unique (term, unid),
  check (term > 0),
  check (type in ('komisja','podkomisja','posiedzenie','konferencja','inne'))
);
create index if not exists videos_term_idx on videos(term);
create index if not exists videos_start_idx on videos(start_datetime);
create index if not exists videos_type_idx on videos(type);

-- ---------- video_committees (hard-FK junction) ----------
-- One row per (video, committee_code, role). Comma-joined codes split into
-- multiple rows. role distinguishes 'committee' vs 'subcommittee' field origin.
create table if not exists video_committees (
  video_id      bigint  not null references videos(id) on delete cascade,
  committee_id  bigint  not null references committees(id) on delete restrict,
  role          text    not null,
  primary key (video_id, committee_id, role),
  check (role in ('committee','subcommittee'))
);
create index if not exists video_committees_committee_idx on video_committees(committee_id);

-- ---------- raw stage ----------
create table if not exists _stage_videos (
  id          bigserial primary key,
  term        integer not null,
  natural_id  text    not null,                              -- unid
  payload     jsonb   not null,
  source_path text    not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (term, natural_id)
);

-- ---------- load_videos ----------
-- Atomic. Order:
--   1) upsert videos (raw fields, raw committee_code/subcommittee_code as-is)
--   2) collect every distinct split code (committee + subcommittee) →
--      stub-extend committees on any miss (mirrors 0021)
--   3) HARD FAIL if anything STILL unresolved (defensive — should never trigger
--      after step 2; same belt-and-braces style as 0019 subCommittees)
--   4) replace-all video_committees for the term (snapshot semantics)
--   5) leave stage in place (consistent with other loaders)
create or replace function load_videos(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected     integer;
  missing_code text;
begin
  -- 1) videos upsert.
  insert into videos(
    term, unid, type, title, description, room,
    start_datetime, end_datetime, transcribe,
    committee_code, subcommittee_code,
    player_link, player_link_iframe, video_link,
    other_video_links, audio,
    source_path, staged_at, loaded_at
  )
  select
    s.term,
    s.payload->>'unid',
    s.payload->>'type',
    s.payload->>'title',
    s.payload->>'description',
    s.payload->>'room',
    (s.payload->>'startDateTime')::timestamptz,
    nullif(s.payload->>'endDateTime','')::timestamptz,
    coalesce((s.payload->>'transcribe')::boolean, false),
    s.payload->>'committee',
    s.payload->>'subcommittee',
    s.payload->>'playerLink',
    s.payload->>'playerLinkIFrame',
    s.payload->>'videoLink',
    case when s.payload ? 'otherVideoLinks'
         then array(select jsonb_array_elements_text(s.payload->'otherVideoLinks')) end,
    s.payload->>'audio',
    s.source_path,
    s.staged_at,
    now()
  from _stage_videos s
  where s.term = p_term
  on conflict (term, unid) do update set
    type = excluded.type,
    title = excluded.title,
    description = excluded.description,
    room = excluded.room,
    start_datetime = excluded.start_datetime,
    end_datetime = excluded.end_datetime,
    transcribe = excluded.transcribe,
    committee_code = excluded.committee_code,
    subcommittee_code = excluded.subcommittee_code,
    player_link = excluded.player_link,
    player_link_iframe = excluded.player_link_iframe,
    video_link = excluded.video_link,
    other_video_links = excluded.other_video_links,
    audio = excluded.audio,
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;

  -- 2) Stub-extend committees for any split code missing in committees(term, code).
  -- Splits comma-joined values; trims whitespace via regexp.
  with split_codes as (
    select distinct trim(c) as code
    from _stage_videos s
    cross join lateral (
      select unnest(string_to_array(coalesce(s.payload->>'committee',''),  ',')) as c
      union all
      select unnest(string_to_array(coalesce(s.payload->>'subcommittee',''), ',')) as c
    ) x
    where s.term = p_term
      and trim(c) <> ''
  )
  insert into committees(term, code, name, is_stub, loaded_at)
  select p_term, sc.code, sc.code, true, now()
  from split_codes sc
  on conflict (term, code) do nothing;

  -- 3) Defensive: hard-fail if any code still unresolved. Should never trigger
  -- after step 2; this is the no-silent-dangling guarantee.
  with split_codes as (
    select distinct trim(c) as code
    from _stage_videos s
    cross join lateral (
      select unnest(string_to_array(coalesce(s.payload->>'committee',''),  ',')) as c
      union all
      select unnest(string_to_array(coalesce(s.payload->>'subcommittee',''), ',')) as c
    ) x
    where s.term = p_term
      and trim(c) <> ''
  )
  select sc.code into missing_code
  from split_codes sc
  where not exists (
    select 1 from committees c where c.term = p_term and c.code = sc.code
  )
  limit 1;
  if missing_code is not null then
    raise exception 'load_videos: unresolved committee code %', missing_code;
  end if;

  -- 4) video_committees: replace-all for the term (snapshot semantics).
  delete from video_committees vc
  using videos v
  where vc.video_id = v.id and v.term = p_term;

  -- 4a) committee role.
  insert into video_committees(video_id, committee_id, role)
  select distinct
    v.id,
    c.id,
    'committee'
  from videos v
  cross join lateral unnest(string_to_array(coalesce(v.committee_code,''), ',')) as raw(code)
  join committees c on c.term = v.term and c.code = trim(raw.code)
  where v.term = p_term
    and v.committee_code is not null
    and trim(raw.code) <> ''
  on conflict (video_id, committee_id, role) do nothing;

  -- 4b) subcommittee role.
  insert into video_committees(video_id, committee_id, role)
  select distinct
    v.id,
    c.id,
    'subcommittee'
  from videos v
  cross join lateral unnest(string_to_array(coalesce(v.subcommittee_code,''), ',')) as raw(code)
  join committees c on c.term = v.term and c.code = trim(raw.code)
  where v.term = p_term
    and v.subcommittee_code is not null
    and trim(raw.code) <> ''
  on conflict (video_id, committee_id, role) do nothing;

  return affected;
end $$;

-- ---------- assert_invariants extension ----------
-- Append videos fields. Preserve all upstream fields verbatim from 0023 / 0021.
-- Note: 0023_bills.sql may add bills_* fields; we re-create here using the same
-- structure, so any concurrent bills-related additions need to be merged at the
-- assert_invariants level. Caveman approach: keep it append-only on top of the
-- 0021 baseline (bills agent will rebase its own assert_invariants similarly).
create or replace function assert_invariants(p_term integer default 10)
returns jsonb language plpgsql stable as $$
declare result jsonb;
begin
  with vsizes as (
    select voting_id, count(*) n from votes group by voting_id
  ),
  agg as (
    select voting_id,
      count(*) filter (where vote='YES')      as yes_a,
      count(*) filter (where vote='NO')       as no_a,
      count(*) filter (where vote='ABSTAIN')  as abstain_a,
      count(*) filter (where vote='PRESENT')  as present_a,
      count(*) filter (where vote='ABSENT')   as absent_a,
      count(*)                                as total_a
    from votes group by voting_id
  ),
  mismatches as (
    select count(*) filter (where v.yes <> a.yes_a)                         as yes_mismatch,
           count(*) filter (where v.no <> a.no_a)                           as no_mismatch,
           count(*) filter (where v.abstain <> a.abstain_a)                 as abstain_mismatch,
           count(*) filter (where v.present <> a.present_a)                 as present_mismatch,
           count(*) filter (where v.not_participating <> a.absent_a)        as not_participating_mismatch,
           count(*) filter (where v.total_voted <> (a.yes_a+a.no_a+a.abstain_a+a.present_a)) as total_voted_mismatch
    from votings v join agg a on a.voting_id = v.id
    where v.term = p_term
  )
  select jsonb_build_object(
    'mps_total',          (select count(*) from mps where term = p_term),
    'clubs_total',        (select count(*) from clubs where term = p_term),
    'inferred_clubs',     (select count(*) from clubs where term = p_term and is_inferred),
    'votings_total',      (select count(*) from votings where term = p_term),
    'votes_total',        (select count(*) from votes where term = p_term),
    'memberships_total',  (select count(*) from mp_club_membership where term = p_term),
    'mps_with_multiple_memberships',
        (select count(*) from (select mp_id from mp_club_membership
                               where term = p_term group by mp_id
                               having count(*) > 1) x),
    'distinct_mps_voted', (select count(distinct mp_id) from votes where term = p_term),
    'orphan_votes_no_voting',
        (select count(*) from votes v
         left join votings vt on vt.id = v.voting_id
         where v.term = p_term and vt.id is null),
    'orphan_votes_no_mp',
        (select count(*) from votes v
         left join mps m on m.term = v.term and m.mp_id = v.mp_id
         where v.term = p_term and m.id is null),
    'orphan_membership_no_mp',
        (select count(*) from mp_club_membership x
         left join mps m on m.term = x.term and m.mp_id = x.mp_id
         where x.term = p_term and m.id is null),
    'orphan_membership_no_club',
        (select count(*) from mp_club_membership x
         left join clubs c on c.term = x.term and c.club_id = x.club_id
         where x.term = p_term and c.id is null),
    'votings_where_yes_no_abstain_present_neq_total_voted',
        (select count(*) from votings v
         where v.term = p_term and (v.yes+v.no+v.abstain+v.present) <> v.total_voted),
    'votings_where_total_voted_plus_not_participating_neq_voting_size',
        (select count(*) from votings v
         left join vsizes vs on vs.voting_id = v.id
         where v.term = p_term and vs.n is not null
           and (v.total_voted + v.not_participating) <> vs.n),
    'tally_mismatches', (select to_jsonb(m.*) from mismatches m),
    'min_voting_date',  (select min(date) from votings where term = p_term),
    'max_voting_date',  (select max(date) from votings where term = p_term),
    'prints_total',
        (select count(*) from prints where term = p_term),
    'prints_primary_count',
        (select count(*) from prints where term = p_term and is_primary),
    'prints_additional_count',
        (select count(*) from prints where term = p_term and is_additional),
    'print_relationships_total',
        (select count(*) from print_relationships where term = p_term),
    'unresolved_print_refs_open',
        (select count(*) from unresolved_print_refs where term = p_term and resolved_at is null),
    'prints_additional_orphan',
        (select count(*) from prints c
         where c.term = p_term and c.is_additional
           and not exists (
             select 1 from prints p
             where p.term = c.term and p.number = c.parent_number
           )),
    'print_cycles_count', process_edge_cycle_count(p_term),
    'committees_total',
        (select count(*) from committees where term = p_term),
    'committees_first_class',
        (select count(*) from committees where term = p_term and not is_stub),
    'committees_stub',
        (select count(*) from committees where term = p_term and is_stub),
    'committee_members_total',
        (select count(*) from committee_members where term = p_term),
    'committee_member_orphans',
        (select count(*) from committee_members cm
         left join mps m on m.term = cm.term and m.mp_id = cm.mp_id
         where cm.term = p_term and m.id is null),
    'committee_subcommittees_total',
        (select count(*) from committee_subcommittees sub
         join committees p on p.id = sub.parent_id
         where p.term = p_term),
    'committee_subcommittee_self_refs',
        (select count(*) from committee_subcommittees where parent_id = child_id),
    'processes_total',
        (select count(*) from processes where term = p_term),
    'process_stages_total',
        (select count(*) from process_stages ps
         join processes p on p.id = ps.process_id
         where p.term = p_term),
    'process_stages_orphan_committee',
        (select count(*) from process_stages ps
         join processes p on p.id = ps.process_id
         where p.term = p_term
           and ps.committee_code is not null
           and ps.committee_id is null),
    'process_stages_resolved_print_count',
        (select count(*) from process_stages ps
         join processes p on p.id = ps.process_id
         where p.term = p_term and ps.print_id is not null),
    'process_stages_unresolved_print_count',
        (select count(*) from process_stages ps
         join processes p on p.id = ps.process_id
         where p.term = p_term and ps.print_number is not null and ps.print_id is null),
    'process_stage_cycles_count', process_stage_cycle_count(p_term),
    'unresolved_process_print_refs_open',
        (select count(*) from unresolved_process_print_refs
         where term = p_term and resolved_at is null),
    -- videos (added in 0024)
    'videos_total',
        (select count(*) from videos where term = p_term),
    'videos_by_type',
        (select coalesce(jsonb_object_agg(t, n), '{}'::jsonb)
         from (select type as t, count(*) as n
               from videos where term = p_term group by type) x),
    'videos_committee_orphans',
        -- rows where committee_code present but no junction row (should be 0)
        (select count(*) from videos v
         where v.term = p_term
           and v.committee_code is not null
           and not exists (
             select 1 from video_committees vc
             where vc.video_id = v.id and vc.role = 'committee'
           )),
    'videos_subcommittee_orphans',
        (select count(*) from videos v
         where v.term = p_term
           and v.subcommittee_code is not null
           and not exists (
             select 1 from video_committees vc
             where vc.video_id = v.id and vc.role = 'subcommittee'
           )),
    'videos_no_committee_count',
        -- informational: videos without any committee field (e.g. plenary)
        (select count(*) from videos
         where term = p_term and committee_code is null),
    'videos_transcribed_count',
        (select count(*) from videos where term = p_term and transcribe),
    'video_committees_total',
        (select count(*) from video_committees vc
         join videos v on v.id = vc.video_id
         where v.term = p_term)
  ) into result;
  return result;
end $$;
