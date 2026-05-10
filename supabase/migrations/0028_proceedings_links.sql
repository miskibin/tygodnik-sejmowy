-- 0028_proceedings_links.sql
-- Shred proceedings.agenda_html into structured agenda_items + junction tables
-- linking to processes/prints. Mirrors unresolved-ref pattern from 0008/0021/0023.
-- Also hard-FKs votings(term, sitting) -> proceedings(term, number) (0 orphans).

create table if not exists agenda_items (
  id            bigserial primary key,
  proceeding_id bigint not null references proceedings(id) on delete cascade,
  ord           integer not null,
  title         text not null,
  raw_html      text not null,
  unique (proceeding_id, ord)
);
create index if not exists agenda_items_pid_idx on agenda_items(proceeding_id);

create table if not exists agenda_item_processes (
  agenda_item_id bigint  not null references agenda_items(id) on delete cascade,
  term           integer not null,
  process_id     text    not null,
  primary key (agenda_item_id, term, process_id),
  foreign key (term, process_id) references processes(term, number)
);
create index if not exists aip_proc_idx on agenda_item_processes(term, process_id);

create table if not exists agenda_item_prints (
  agenda_item_id bigint  not null references agenda_items(id) on delete cascade,
  term           integer not null,
  print_number   text    not null,
  primary key (agenda_item_id, term, print_number),
  foreign key (term, print_number) references prints(term, number)
);
create index if not exists aip_print_idx on agenda_item_prints(term, print_number);

create table if not exists unresolved_agenda_process_refs (
  id             bigserial primary key,
  agenda_item_id bigint  not null references agenda_items(id) on delete cascade,
  term           integer not null,
  process_id     text    not null,
  detected_at    timestamptz not null default now(),
  resolved_at    timestamptz,
  unique (agenda_item_id, term, process_id)
);
create index if not exists unres_agenda_proc_term_idx
  on unresolved_agenda_process_refs(term) where resolved_at is null;

create table if not exists unresolved_agenda_print_refs (
  id             bigserial primary key,
  agenda_item_id bigint  not null references agenda_items(id) on delete cascade,
  term           integer not null,
  print_number   text    not null,
  detected_at    timestamptz not null default now(),
  resolved_at    timestamptz,
  unique (agenda_item_id, term, print_number)
);
create index if not exists unres_agenda_print_term_idx
  on unresolved_agenda_print_refs(term) where resolved_at is null;

alter table votings drop constraint if exists votings_proceedings_fk;
alter table votings
  add constraint votings_proceedings_fk
    foreign key (term, sitting) references proceedings(term, number);

create or replace function load_proceedings(p_term integer default 10)
returns integer language plpgsql as $$
declare
  s record; d_obj jsonb; stmt jsonb; ai jsonb; r text;
  pid bigint; did bigint; aid bigint; affected integer := 0;
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

    delete from agenda_items where proceeding_id = pid;
    for ai in select * from jsonb_array_elements(coalesce(s.payload->'agenda_items','[]'::jsonb)) loop
      insert into agenda_items(proceeding_id, ord, title, raw_html)
      values (pid, (ai->>'ord')::int, ai->>'title', ai->>'raw_html')
      returning id into aid;

      for r in select jsonb_array_elements_text(coalesce(ai->'process_refs','[]'::jsonb)) loop
        if exists (select 1 from processes where term = p_term and number = r) then
          insert into agenda_item_processes(agenda_item_id, term, process_id)
          values (aid, p_term, r)
          on conflict do nothing;
        else
          insert into unresolved_agenda_process_refs(agenda_item_id, term, process_id)
          values (aid, p_term, r)
          on conflict (agenda_item_id, term, process_id) do update set
            detected_at = now(), resolved_at = null;
        end if;
      end loop;

      for r in select jsonb_array_elements_text(coalesce(ai->'print_refs','[]'::jsonb)) loop
        if exists (select 1 from prints where term = p_term and number = r) then
          insert into agenda_item_prints(agenda_item_id, term, print_number)
          values (aid, p_term, r)
          on conflict do nothing;
        else
          insert into unresolved_agenda_print_refs(agenda_item_id, term, print_number)
          values (aid, p_term, r)
          on conflict (agenda_item_id, term, print_number) do update set
            detected_at = now(), resolved_at = null;
        end if;
      end loop;
    end loop;

    affected := affected + 1;
  end loop;
  return affected;
end $$;

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
                           where d.proceeding_id = p.id and d.date = dt)),
    'agenda_items_count',
        (select count(*) from agenda_items ai
         join proceedings p on p.id = ai.proceeding_id
         where p.term = p_term),
    'agenda_item_processes_count',
        (select count(*) from agenda_item_processes where term = p_term),
    'agenda_item_prints_count',
        (select count(*) from agenda_item_prints where term = p_term),
    'unresolved_agenda_process_refs_open',
        (select count(*) from unresolved_agenda_process_refs
         where term = p_term and resolved_at is null),
    'unresolved_agenda_print_refs_open',
        (select count(*) from unresolved_agenda_print_refs
         where term = p_term and resolved_at is null),
    'votings_proc_orphans',
        (select count(*) from votings v
         left join proceedings p on p.term = v.term and p.number = v.sitting
         where v.term = p_term and p.id is null)
  ) into part2;
  return result || part2;
end $$;
