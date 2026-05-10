-- 0025_proceedings.sql
-- Sittings + per-day transcripts + statements with optional HTML body extraction.
-- Audit: 9 entity files (49..57). 29 day-transcripts. 5 days carry HTML statement
-- bodies (proc 49 + 50). 6609 total statements; 243 with memberID=0 (non-MP
-- speaker, e.g. minister) -> NULL mp_id with name/function preserved.

-- ---------- proceedings ----------
create table if not exists proceedings (
  id           bigserial primary key,
  term         integer not null references terms(term),
  number       integer not null,
  title        text not null,
  current      boolean not null,
  dates        date[] not null check (cardinality(dates) > 0),
  agenda_html  text not null,
  source_path  text not null,
  staged_at    timestamptz,
  loaded_at    timestamptz not null default now(),
  unique (term, number)
);
create index if not exists proceedings_term_idx on proceedings(term);

-- ---------- proceeding_days ----------
create table if not exists proceeding_days (
  id             bigserial primary key,
  proceeding_id  bigint not null references proceedings(id) on delete cascade,
  date           date not null,
  source_path    text not null,
  unique (proceeding_id, date)
);
create index if not exists proceeding_days_pid_idx on proceeding_days(proceeding_id);

-- ---------- proceeding_statements ----------
create table if not exists proceeding_statements (
  id                bigserial primary key,
  proceeding_day_id bigint not null references proceeding_days(id) on delete cascade,
  num               integer not null,
  term              integer not null,
  mp_id             integer,
  speaker_name      text not null,
  function          text not null,
  rapporteur        boolean not null,
  secretary         boolean not null,
  unspoken          boolean not null,
  start_datetime    timestamptz,
  end_datetime      timestamptz,
  body_text         text,
  body_html         text,
  unique (proceeding_day_id, num),
  check (mp_id is null or mp_id > 0),
  foreign key (term, mp_id) references mps(term, mp_id)
);
create index if not exists proceeding_statements_day_idx on proceeding_statements(proceeding_day_id);
create index if not exists proceeding_statements_mp_idx on proceeding_statements(term, mp_id);

-- ---------- raw stage ----------
create table if not exists _stage_proceedings (
  id          bigserial primary key,
  term        integer not null,
  number      integer not null,
  payload     jsonb not null,
  source_path text not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (term, number)
);

-- ---------- load_proceedings ----------
-- Idempotent rebuild. Upsert proceedings; nuke + reinsert child days/statements
-- for each proceeding (cascade handles cleanup). Returns count of proceedings.
create or replace function load_proceedings(p_term integer default 10)
returns integer language plpgsql as $$
declare
  s record; d_obj jsonb; stmt jsonb; pid bigint; did bigint; affected integer := 0;
begin
  for s in select * from _stage_proceedings where term = p_term order by number loop
    insert into proceedings(term, number, title, current, dates, agenda_html,
                            source_path, staged_at, loaded_at)
    values (s.term,
            (s.payload->>'number')::int,
            s.payload->>'title',
            (s.payload->>'current')::boolean,
            (select array_agg((d::text)::date order by (d::text)::date)
             from jsonb_array_elements_text(s.payload->'dates') d),
            s.payload->>'agenda_html',
            s.source_path, s.staged_at, now())
    on conflict (term, number) do update set
      title = excluded.title,
      current = excluded.current,
      dates = excluded.dates,
      agenda_html = excluded.agenda_html,
      source_path = excluded.source_path,
      staged_at = excluded.staged_at,
      loaded_at = now()
    returning id into pid;

    delete from proceeding_days where proceeding_id = pid;

    for d_obj in select * from jsonb_array_elements(s.payload->'days') loop
      insert into proceeding_days(proceeding_id, date, source_path)
      values (pid, (d_obj->>'date')::date, d_obj->>'source_path')
      returning id into did;

      for stmt in select * from jsonb_array_elements(d_obj->'statements') loop
        insert into proceeding_statements(
          proceeding_day_id, num, term, mp_id, speaker_name, function,
          rapporteur, secretary, unspoken,
          start_datetime, end_datetime, body_text, body_html
        ) values (
          did,
          (stmt->>'num')::int,
          s.term,
          nullif((stmt->>'mp_id')::int, 0),
          stmt->>'speaker_name',
          coalesce(stmt->>'function',''),
          (stmt->>'rapporteur')::boolean,
          (stmt->>'secretary')::boolean,
          (stmt->>'unspoken')::boolean,
          nullif(stmt->>'start_datetime','')::timestamptz,
          nullif(stmt->>'end_datetime','')::timestamptz,
          stmt->>'body_text',
          stmt->>'body_html'
        );
      end loop;
    end loop;
    affected := affected + 1;
  end loop;
  return affected;
end $$;

-- ---------- assert_invariants extension ----------
-- Append proceedings counters. Preserves all upstream fields from 0024 verbatim.
-- Postgres caps function args at 100 (50 jsonb pairs). Build in two halves
-- and merge with `||` to leave headroom as more resources are added.
create or replace function assert_invariants(p_term integer default 10)
returns jsonb language plpgsql stable as $$
declare result jsonb; part2 jsonb;
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
         where term = p_term and resolved_at is null)
  ) into result;

  select jsonb_build_object(
    'videos_total',
        (select count(*) from videos where term = p_term),
    'videos_by_type',
        (select coalesce(jsonb_object_agg(t, n), '{}'::jsonb)
         from (select type as t, count(*) as n
               from videos where term = p_term group by type) x),
    'videos_committee_orphans',
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
        (select count(*) from videos
         where term = p_term and committee_code is null),
    'videos_transcribed_count',
        (select count(*) from videos where term = p_term and transcribe),
    'video_committees_total',
        (select count(*) from video_committees vc
         join videos v on v.id = vc.video_id
         where v.term = p_term),
    -- proceedings (added in 0025)
    'proceedings_total',
        (select count(*) from proceedings where term = p_term),
    'proceeding_days_total',
        (select count(*) from proceeding_days d
         join proceedings p on p.id = d.proceeding_id
         where p.term = p_term),
    'proceeding_statements_total',
        (select count(*) from proceeding_statements where term = p_term),
    'proceeding_statements_nonmp',
        (select count(*) from proceeding_statements
         where term = p_term and mp_id is null),
    'proceeding_statements_with_body',
        (select count(*) from proceeding_statements
         where term = p_term and body_text is not null),
    'proceeding_dates_without_day',
        (select count(*) from proceedings p, unnest(p.dates) dt
         where p.term = p_term
           and not exists (select 1 from proceeding_days d
                           where d.proceeding_id = p.id and d.date = dt))
  ) into part2;
  return result || part2;
end $$;
