-- 0108 — targeted loaders for the incremental updater.
--
-- load_proceedings / load_votings / load_votes rebuild the whole term on every
-- call: 75 sittings × ~600 statements, 2M vote rows. Through PostgREST that
-- is far beyond Cloudflare's 100 s gateway limit and even with a direct DSN it
-- is minutes of work for a day that changed one sitting. The updater knows
-- exactly which sittings changed, so it calls these per-sitting variants;
-- the whole-term functions stay for `--full` / `--skip-fetch` runs.
--
--   load_proceeding(p_term, p_number)        one sitting (body of 0091's loop)
--   load_proceedings(p_term)                 now loops over load_proceeding
--   load_votings_sitting(p_term, p_sitting)  votings of one sitting (0107 topic fallback)
--   load_votes_sitting(p_term, p_sitting)    per-MP votes of one sitting

create or replace function public.load_proceeding(p_term integer, p_number integer)
returns integer language plpgsql as $$
declare
  s record; d_obj jsonb; stmt jsonb; ai jsonb; r text;
  pid bigint; did bigint; aid bigint; affected integer := 0;
begin
  for s in select * from _stage_proceedings where term = p_term and number = p_number loop
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

    for d_obj in select * from jsonb_array_elements(s.payload->'days') loop
      insert into proceeding_days(proceeding_id, date, source_path)
      values (pid, (d_obj->>'date')::date, d_obj->>'source_path')
      on conflict (proceeding_id, date) do update set
        source_path = excluded.source_path
      returning id into did;

      -- Statements: upstream-sourced columns only; LLM enrichment columns and
      -- search_tsv are deliberately left alone (see 0091).
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
        )
        on conflict (proceeding_day_id, num) do update set
          term = excluded.term,
          mp_id = excluded.mp_id,
          speaker_name = excluded.speaker_name,
          function = excluded.function,
          rapporteur = excluded.rapporteur,
          secretary = excluded.secretary,
          unspoken = excluded.unspoken,
          start_datetime = excluded.start_datetime,
          end_datetime = excluded.end_datetime,
          body_text = excluded.body_text,
          body_html = excluded.body_html;
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

create or replace function public.load_proceedings(p_term integer default 10)
returns integer language plpgsql as $$
declare
  n integer; affected integer := 0;
begin
  for n in select number from _stage_proceedings where term = p_term order by number loop
    affected := affected + public.load_proceeding(p_term, n);
  end loop;
  return affected;
end $$;

create or replace function public.load_votings_sitting(p_term integer, p_sitting integer)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  insert into votings(term, sitting, sitting_day, voting_number, date, title,
                      topic, description, kind, majority_type, majority_votes,
                      yes, no, abstain, present, not_participating,
                      total_voted, source_path, staged_at, loaded_at)
  select
    s.term,
    (s.payload->>'sitting')::integer,
    (s.payload->>'sittingDay')::integer,
    (s.payload->>'votingNumber')::integer,
    (s.payload->>'date')::timestamptz,
    s.payload->>'title',
    coalesce(s.payload->>'topic', s.payload->>'title'),
    s.payload->>'description',
    (s.payload->>'kind')::voting_kind,
    (s.payload->>'majorityType')::majority_type,
    (s.payload->>'majorityVotes')::integer,
    (s.payload->>'yes')::integer,
    (s.payload->>'no')::integer,
    (s.payload->>'abstain')::integer,
    (s.payload->>'present')::integer,
    (s.payload->>'notParticipating')::integer,
    (s.payload->>'totalVoted')::integer,
    s.source_path,
    s.staged_at,
    now()
  from _stage_votings s
  where s.term = p_term and (s.payload->>'sitting')::integer = p_sitting
  on conflict (term, sitting, voting_number) do update set
    sitting_day = excluded.sitting_day,
    date = excluded.date,
    title = excluded.title,
    topic = excluded.topic,
    description = excluded.description,
    kind = excluded.kind,
    majority_type = excluded.majority_type,
    majority_votes = excluded.majority_votes,
    yes = excluded.yes,
    no = excluded.no,
    abstain = excluded.abstain,
    present = excluded.present,
    not_participating = excluded.not_participating,
    total_voted = excluded.total_voted,
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;
  return affected;
end $$;

create or replace function public.load_votes_sitting(p_term integer, p_sitting integer)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  insert into votes(voting_id, term, mp_id, club_ref, vote, list_votes)
  select
    v.id,
    v.term,
    (vr->>'MP')::integer,
    vr->>'club',
    (vr->>'vote')::vote_choice,
    case when vr ? 'listVotes' then vr->'listVotes' else null end
  from _stage_votings s
  join votings v
    on v.term = s.term
   and v.sitting = (s.payload->>'sitting')::integer
   and v.voting_number = (s.payload->>'votingNumber')::integer,
       jsonb_array_elements(s.payload->'votes') as vr
  where s.term = p_term and (s.payload->>'sitting')::integer = p_sitting
  on conflict (voting_id, mp_id) do update set
    club_ref = excluded.club_ref,
    vote = excluded.vote,
    list_votes = excluded.list_votes;
  get diagnostics affected = row_count;
  return affected;
end $$;
