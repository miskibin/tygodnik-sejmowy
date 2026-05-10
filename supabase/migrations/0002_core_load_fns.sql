-- 0002_core_load_fns.sql
-- Pure-SQL transform/load functions: read _stage_* → upsert into typed tables.
-- Each function is idempotent. Runs in dependency order: clubs → inferred clubs
-- → mps → mp_club_membership → votings → votes.

-- ---------- load_clubs ----------
create or replace function load_clubs(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  insert into clubs(term, club_id, name, members_count, email, phone, fax,
                    is_inferred, source_path, staged_at, loaded_at)
  select
    s.term,
    s.payload->>'id',
    s.payload->>'name',
    nullif(s.payload->>'membersCount','')::integer,
    s.payload->>'email',
    s.payload->>'phone',
    s.payload->>'fax',
    false,
    s.source_path,
    s.staged_at,
    now()
  from _stage_clubs s
  where s.term = p_term
  on conflict (term, club_id) do update set
    name = excluded.name,
    members_count = excluded.members_count,
    email = excluded.email,
    phone = excluded.phone,
    fax = excluded.fax,
    is_inferred = false,
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;
  return affected;
end $$;

-- ---------- discover & insert inferred clubs from MPs/votes ----------
create or replace function load_inferred_clubs(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  with refs as (
    -- club codes referenced on MP rows
    select distinct s.payload->>'club' as club_id
    from _stage_mps s where s.term = p_term and s.payload ? 'club'
    union
    -- club codes referenced inside vote rows
    select distinct (v->>'club') as club_id
    from _stage_votings s,
         jsonb_array_elements(s.payload->'votes') as v
    where s.term = p_term
  )
  insert into clubs(term, club_id, name, is_inferred)
  select p_term, refs.club_id, refs.club_id, true
  from refs
  where refs.club_id is not null
    and refs.club_id <> ''
    and not exists (
      select 1 from clubs c
      where c.term = p_term and c.club_id = refs.club_id
    )
  on conflict (term, club_id) do nothing;
  get diagnostics affected = row_count;
  return affected;
end $$;

-- ---------- load_mps ----------
create or replace function load_mps(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  insert into mps(term, mp_id, active, first_name, last_name, second_name,
                  first_last_name, last_first_name, accusative_name,
                  genitive_name, birth_date, birth_location, district_name,
                  district_num, voivodeship, education_level, profession,
                  email, number_of_votes, inactive_cause, waiver_desc,
                  club_ref, source_path, staged_at, loaded_at)
  select
    s.term,
    (s.payload->>'id')::integer,
    (s.payload->>'active')::boolean,
    s.payload->>'firstName',
    s.payload->>'lastName',
    s.payload->>'secondName',
    s.payload->>'firstLastName',
    s.payload->>'lastFirstName',
    s.payload->>'accusativeName',
    s.payload->>'genitiveName',
    nullif(s.payload->>'birthDate','')::date,
    s.payload->>'birthLocation',
    s.payload->>'districtName',
    nullif(s.payload->>'districtNum','')::integer,
    s.payload->>'voivodeship',
    s.payload->>'educationLevel',
    s.payload->>'profession',
    s.payload->>'email',
    nullif(s.payload->>'numberOfVotes','')::integer,
    s.payload->>'inactiveCause',
    s.payload->>'waiverDesc',
    s.payload->>'club',
    s.source_path,
    s.staged_at,
    now()
  from _stage_mps s
  where s.term = p_term
  on conflict (term, mp_id) do update set
    active = excluded.active,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    second_name = excluded.second_name,
    first_last_name = excluded.first_last_name,
    last_first_name = excluded.last_first_name,
    accusative_name = excluded.accusative_name,
    genitive_name = excluded.genitive_name,
    birth_date = excluded.birth_date,
    birth_location = excluded.birth_location,
    district_name = excluded.district_name,
    district_num = excluded.district_num,
    voivodeship = excluded.voivodeship,
    education_level = excluded.education_level,
    profession = excluded.profession,
    email = excluded.email,
    number_of_votes = excluded.number_of_votes,
    inactive_cause = excluded.inactive_cause,
    waiver_desc = excluded.waiver_desc,
    club_ref = excluded.club_ref,
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;
  return affected;
end $$;

-- ---------- load_mp_club_membership (current snapshot) ----------
create or replace function load_mp_club_membership(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  insert into mp_club_membership(term, mp_id, club_id)
  select m.term, m.mp_id, m.club_ref
  from mps m
  where m.term = p_term
    and m.club_ref is not null
    and exists (
      select 1 from clubs c
      where c.term = m.term and c.club_id = m.club_ref
    )
  on conflict (term, mp_id, club_id) do nothing;
  get diagnostics affected = row_count;
  return affected;
end $$;

-- ---------- load_votings ----------
create or replace function load_votings(p_term integer default 10)
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
    s.payload->>'topic',
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
  where s.term = p_term
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

-- ---------- load_votes (one row per (voting, mp)) ----------
create or replace function load_votes(p_term integer default 10)
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
  where s.term = p_term
  on conflict (voting_id, mp_id) do update set
    club_ref = excluded.club_ref,
    vote = excluded.vote,
    list_votes = excluded.list_votes;
  get diagnostics affected = row_count;
  return affected;
end $$;

-- ---------- run_core_load (orchestrator) ----------
create or replace function run_core_load(p_term integer default 10)
returns table(step text, affected integer) language plpgsql as $$
begin
  return query select 'load_clubs',              load_clubs(p_term);
  return query select 'load_inferred_clubs',     load_inferred_clubs(p_term);
  return query select 'load_mps',                load_mps(p_term);
  return query select 'load_mp_club_membership', load_mp_club_membership(p_term);
  return query select 'load_votings',            load_votings(p_term);
  return query select 'load_votes',              load_votes(p_term);
end $$;
