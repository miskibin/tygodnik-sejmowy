-- 0019_committees.sql
-- Sejm committees: top-level committees + member roster (FK mps) + subcommittee adjacency.
-- Hard FKs everywhere; subcommittee resolution HARD FAILS on missing code (no silent skip).
-- mp_id FK targets mps(term, mp_id) (composite) — same convention as votes/mp_club_membership.

-- ---------- committees ----------
create table if not exists committees (
  id                bigserial primary key,
  term              integer not null references terms(term),
  code              text    not null,                          -- e.g. 'ASW'
  name              text    not null,
  name_genitive     text,
  type              text,
  scope             text,
  phone             text,
  appointment_date  date,
  composition_date  date,
  source_path       text,
  staged_at         timestamptz,
  loaded_at         timestamptz not null default now(),
  unique (term, code),
  check (term > 0),
  check (type is null or type in ('STANDING','EXTRAORDINARY','INVESTIGATIVE'))
);
create index if not exists committees_term_idx on committees(term);

-- ---------- committee_members ----------
-- club_short is informational snapshot (may include legacy/inferred values like 'niez.');
-- NOT an FK so we don't reject historic captures.
create table if not exists committee_members (
  id            bigserial primary key,
  committee_id  bigint  not null references committees(id) on delete cascade,
  term          integer not null references terms(term),
  mp_id         integer not null,
  club_short    text,
  function      text,
  loaded_at     timestamptz not null default now(),
  unique (committee_id, mp_id),
  foreign key (term, mp_id) references mps(term, mp_id) on delete restrict
);
create index if not exists committee_members_committee_idx on committee_members(committee_id);
create index if not exists committee_members_mp_idx on committee_members(term, mp_id);

-- ---------- committee_subcommittees adjacency ----------
create table if not exists committee_subcommittees (
  parent_id  bigint not null references committees(id) on delete cascade,
  child_id   bigint not null references committees(id) on delete cascade,
  primary key (parent_id, child_id),
  check (parent_id <> child_id)
);
create index if not exists committee_subcommittees_child_idx on committee_subcommittees(child_id);

-- ---------- raw stage ----------
create table if not exists _stage_committees (
  id          bigserial primary key,
  term        integer not null,
  natural_id  text    not null,                                -- committee code
  payload     jsonb   not null,
  source_path text    not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (term, natural_id)
);

-- ---------- load_committees ----------
-- Atomic: any unresolved subcommittee code raises EXCEPTION → caller's txn rolls back.
-- Three passes inside one function:
--   1) upsert committees
--   2) replace-all members (delete + insert; roster snapshot is authoritative)
--   3) replace-all subcommittee edges; HARD FAIL on dangling codes.
create or replace function load_committees(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
  missing_code text;
begin
  -- 1) committees
  insert into committees(term, code, name, name_genitive, type, scope, phone,
                         appointment_date, composition_date,
                         source_path, staged_at, loaded_at)
  select
    s.term,
    s.payload->>'code',
    s.payload->>'name',
    s.payload->>'nameGenitive',
    s.payload->>'type',
    s.payload->>'scope',
    s.payload->>'phone',
    nullif(s.payload->>'appointmentDate','')::date,
    nullif(s.payload->>'compositionDate','')::date,
    s.source_path,
    s.staged_at,
    now()
  from _stage_committees s
  where s.term = p_term
  on conflict (term, code) do update set
    name = excluded.name,
    name_genitive = excluded.name_genitive,
    type = excluded.type,
    scope = excluded.scope,
    phone = excluded.phone,
    appointment_date = excluded.appointment_date,
    composition_date = excluded.composition_date,
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;

  -- 2) members: replace-all (snapshot semantics — roster swaps are common)
  delete from committee_members cm
  using committees c
  where cm.committee_id = c.id and c.term = p_term;

  insert into committee_members(committee_id, term, mp_id, club_short, function)
  select
    c.id,
    s.term,
    (m->>'id')::integer,
    m->>'club',
    m->>'function'
  from _stage_committees s
  join committees c on c.term = s.term and c.code = s.payload->>'code'
  cross join lateral jsonb_array_elements(coalesce(s.payload->'members','[]'::jsonb)) as m
  where s.term = p_term;

  -- 3) subcommittee edges: replace-all + HARD FAIL on missing codes.
  delete from committee_subcommittees sub
  using committees c
  where sub.parent_id = c.id and c.term = p_term;

  -- Detect any child code that doesn't resolve to a committees row in this term.
  select s.payload->>'code' || '/' || (sc::text)
    into missing_code
  from _stage_committees s
  cross join lateral jsonb_array_elements_text(coalesce(s.payload->'subCommittees','[]'::jsonb)) as sc
  where s.term = p_term
    and not exists (
      select 1 from committees c
      where c.term = s.term and c.code = sc
    )
  limit 1;
  if missing_code is not null then
    raise exception 'unresolved subcommittee code: %', missing_code;
  end if;

  insert into committee_subcommittees(parent_id, child_id)
  select
    p.id,
    ch.id
  from _stage_committees s
  join committees p on p.term = s.term and p.code = s.payload->>'code'
  cross join lateral jsonb_array_elements_text(coalesce(s.payload->'subCommittees','[]'::jsonb)) as sc
  join committees ch on ch.term = s.term and ch.code = sc
  where s.term = p_term
    and p.id <> ch.id
  on conflict (parent_id, child_id) do nothing;

  return affected;
end $$;

-- ---------- assert_invariants extension ----------
-- Append committees fields. Existing fields preserved verbatim from 0009.
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
    -- committees fields (added in 0019)
    'committees_total',
        (select count(*) from committees where term = p_term),
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
        (select count(*) from committee_subcommittees where parent_id = child_id)
  ) into result;
  return result;
end $$;
