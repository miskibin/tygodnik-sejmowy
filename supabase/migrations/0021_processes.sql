-- 0021_processes.sql
-- D2: Sejm legislative processes — top-level processes + recursive process_stages tree
-- + unresolved cross-resource print refs queue + invariants extension.
--
-- Design:
--   * Hard FKs everywhere. committee_id stub-extends committees on missing code
--     (mirrors 0020 subcommittee stub pattern).
--   * Composite hard FK on (term, rapporteur_id) -> mps(term, mp_id) — audit shows
--     all 58 distinct rapporteur IDs resolve in mps(term=10).
--   * print_id hard FK when resolvable; missing prints land in
--     unresolved_process_print_refs queue (mirrors 0008 unresolved_print_refs).
--   * Self-ref parent_id w/ CHECK + recursive cycle invariant.

-- ---------- processes ----------
create table if not exists processes (
  id                          bigserial primary key,
  term                        integer not null references terms(term),
  number                      text    not null,
  title                       text    not null,
  title_final                 text,
  description                 text,
  document_type               text,
  document_type_enum          text,                       -- BILL|DRAFT_RESOLUTION|... (data-driven)
  document_date               date,
  closure_date                date,
  process_start_date          date,
  change_date                 timestamptz,
  web_generated_date          timestamptz,
  ue_flag                     text,                       -- 'NO'|'ENFORCEMENT' per audit (NOT a bool)
  passed                      boolean,
  principle_of_subsidiarity   boolean,
  shorten_procedure           boolean,
  legislative_committee       boolean,
  urgency_status              text,
  rcl_link                    text,
  rcl_num                     text,
  eli                         text,
  address                     text,
  display_address             text,
  comments                    text,
  prints_considered_jointly   text[],
  links                       text[],
  source_path                 text,
  staged_at                   timestamptz,
  loaded_at                   timestamptz not null default now(),
  unique (term, number),
  check (term > 0),
  check (urgency_status is null or urgency_status in ('NORMAL','URGENT')),
  check (ue_flag is null or ue_flag in ('NO','YES','ENFORCEMENT'))
);
create index if not exists processes_term_idx on processes(term);

-- ---------- process_stages ----------
-- Recursive tree. parent_id NULL for root; ord preserves array order; depth 0=root.
-- committee_id is the resolved FK (stubs ensure resolution); committee_code is
-- the raw code informational. print_id likewise; unresolved go to queue.
create table if not exists process_stages (
  id                bigserial primary key,
  process_id        bigint  not null references processes(id) on delete cascade,
  parent_id         bigint  references process_stages(id) on delete cascade,
  ord               integer not null,
  depth             integer not null check (depth >= 0),
  term              integer not null,                     -- denormalized for composite FK to mps
  stage_name        text    not null,
  stage_type        text,                                 -- nullable: 25 fixtures lack it
  stage_date        date,
  committee_code    text,                                 -- raw value (informational)
  committee_id      bigint references committees(id) on delete restrict,
  print_number      text,                                 -- raw value (informational)
  print_id          bigint references prints(id) on delete restrict,
  rapporteur_id     integer,                              -- API id; composite FK below
  rapporteur_name   text,
  proposal          text,
  sub_committee     boolean,
  minority_motions  integer,
  report_file       text,
  node_type         text,                                 -- inner "type" (NORMAL|...); informational
  sitting_num       integer,
  decision          text,
  comment           text,
  text_after3       text,
  position          text,
  omitted_inconsistent boolean,
  organ             text,
  other_documents   jsonb,
  continued_on      date[],
  voting            jsonb,                                -- Voting children carry a nested voting blob
  report_date       date,
  remarks           text,
  loaded_at         timestamptz not null default now(),
  check (parent_id is null or parent_id <> id),
  check (committee_code is null or committee_id is not null), -- hard: any code must resolve
  -- Composite hard FK: rapporteur_id resolves on mps(term, mp_id).
  foreign key (term, rapporteur_id) references mps(term, mp_id) on delete restrict
);
create index if not exists process_stages_process_idx on process_stages(process_id);
create index if not exists process_stages_parent_idx on process_stages(parent_id);
create index if not exists process_stages_committee_idx on process_stages(committee_id);
create index if not exists process_stages_print_idx on process_stages(print_id);

-- ---------- unresolved_process_print_refs ----------
-- print_number values that don't resolve in prints(term, number) — symmetric to
-- 0008 unresolved_print_refs. resolved_at NULL = open.
create table if not exists unresolved_process_print_refs (
  id                bigserial primary key,
  term              integer not null references terms(term),
  process_number    text    not null,
  stage_id          bigint  references process_stages(id) on delete cascade,
  raw_print_number  text    not null,
  raw_stage_name    text,
  raw_stage_type    text,
  reason            text    not null,
  detected_at       timestamptz not null default now(),
  resolved_at       timestamptz,
  resolution_note   text,
  unique (term, process_number, raw_print_number, raw_stage_name)
);
create index if not exists unresolved_proc_print_term_idx
  on unresolved_process_print_refs(term) where resolved_at is null;

-- ---------- raw stage table ----------
create table if not exists _stage_processes (
  id          bigserial primary key,
  term        integer not null,
  natural_id  text    not null,                           -- process number
  payload     jsonb   not null,
  source_path text    not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (term, natural_id)
);

-- ---------- helpers: insert one stage subtree, returning rows count ----------
-- Recursive plpgsql: insert one stage node, then recurse over its children.
-- Cleaner than chained CTEs because we need the parent's just-assigned id to
-- be available for child rows. Process stages tree is shallow (max depth ~1
-- in current data) so call depth is bounded.
create or replace function _insert_process_stage(
  p_process_id bigint,
  p_term       integer,
  p_parent_id  bigint,
  p_depth      integer,
  p_ord        integer,
  p_node       jsonb
) returns integer language plpgsql as $$
declare
  new_id   bigint;
  total    integer := 1;
  child    jsonb;
  c_idx    integer;
  c_committee_id bigint;
  c_print_id bigint;
begin
  -- Resolve committee_id and print_id at row time. Committees may be stubbed.
  select id into c_committee_id
  from committees
  where term = p_term and code = p_node->>'committeeCode'
  limit 1;

  if (p_node->>'committeeCode') is not null
     and (p_node->>'committeeCode') <> ''
     and c_committee_id is null then
    -- Should not happen: stubs were extended in load_processes step 2.
    raise exception 'process_stages: committee_code % not in committees(term=%)',
      p_node->>'committeeCode', p_term;
  end if;

  select id into c_print_id
  from prints
  where term = p_term and number = p_node->>'printNumber'
  limit 1;

  insert into process_stages(
    process_id, parent_id, ord, depth, term,
    stage_name, stage_type, stage_date,
    committee_code, committee_id,
    print_number, print_id,
    rapporteur_id, rapporteur_name, proposal,
    sub_committee, minority_motions, report_file, node_type,
    sitting_num, decision, comment, text_after3, position,
    omitted_inconsistent, organ, other_documents, continued_on,
    voting, report_date, remarks
  ) values (
    p_process_id, p_parent_id, p_ord, p_depth, p_term,
    p_node->>'stageName',
    p_node->>'stageType',
    nullif(p_node->>'date','')::date,
    p_node->>'committeeCode',
    c_committee_id,
    p_node->>'printNumber',
    c_print_id,
    nullif(p_node->>'rapporteurID','')::integer,
    p_node->>'rapporteurName',
    p_node->>'proposal',
    case when p_node ? 'subCommittee' then (p_node->>'subCommittee')::boolean end,
    nullif(p_node->>'minorityMotions','')::integer,
    p_node->>'reportFile',
    p_node->>'type',
    nullif(p_node->>'sittingNum','')::integer,
    p_node->>'decision',
    p_node->>'comment',
    p_node->>'textAfter3',
    p_node->>'position',
    case when p_node ? 'omittedInconsistent' then (p_node->>'omittedInconsistent')::boolean end,
    p_node->>'organ',
    p_node->'otherDocuments',
    case when p_node ? 'continuedOn'
         then array(select jsonb_array_elements_text(p_node->'continuedOn'))::date[] end,
    p_node->'voting',
    nullif(p_node->>'reportDate','')::date,
    p_node->>'remarks'
  ) returning id into new_id;

  -- Recurse children.
  if jsonb_typeof(p_node->'children') = 'array' then
    c_idx := 0;
    for child in select value from jsonb_array_elements(p_node->'children')
    loop
      total := total + _insert_process_stage(
        p_process_id, p_term, new_id, p_depth + 1, c_idx, child
      );
      c_idx := c_idx + 1;
    end loop;
  end if;

  return total;
end $$;

-- ---------- load_processes ----------
-- 1) processes upsert
-- 2) stub-extend committees for any missing committeeCode in stages
-- 3) wipe + reinsert stages for the term (snapshot semantics)
-- 4) queue unresolved print refs
-- 5) truncate stage table
create or replace function load_processes(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected     integer;
  proc         record;
  s_idx        integer;
  stage_node   jsonb;
begin
  -- 1) processes
  insert into processes(
    term, number, title, title_final, description,
    document_type, document_type_enum,
    document_date, closure_date, process_start_date,
    change_date, web_generated_date,
    ue_flag, passed, principle_of_subsidiarity,
    shorten_procedure, legislative_committee, urgency_status,
    rcl_link, rcl_num, eli, address, display_address, comments,
    prints_considered_jointly, links,
    source_path, staged_at, loaded_at
  )
  select
    s.term,
    s.payload->>'number',
    s.payload->>'title',
    s.payload->>'titleFinal',
    s.payload->>'description',
    s.payload->>'documentType',
    s.payload->>'documentTypeEnum',
    nullif(s.payload->>'documentDate','')::date,
    nullif(s.payload->>'closureDate','')::date,
    nullif(s.payload->>'processStartDate','')::date,
    nullif(s.payload->>'changeDate','')::timestamptz,
    nullif(s.payload->>'webGeneratedDate','')::timestamptz,
    s.payload->>'UE',
    case when s.payload ? 'passed' and (s.payload->>'passed') is not null
         then (s.payload->>'passed')::boolean end,
    case when s.payload ? 'principleOfSubsidiarity'
         then (s.payload->>'principleOfSubsidiarity')::boolean end,
    case when s.payload ? 'shortenProcedure'
         then (s.payload->>'shortenProcedure')::boolean end,
    case when s.payload ? 'legislativeCommittee'
         then (s.payload->>'legislativeCommittee')::boolean end,
    s.payload->>'urgencyStatus',
    s.payload->>'rclLink',
    s.payload->>'rclNum',
    s.payload->>'ELI',
    s.payload->>'address',
    s.payload->>'displayAddress',
    s.payload->>'comments',
    case when s.payload ? 'printsConsideredJointly'
         then array(select jsonb_array_elements_text(s.payload->'printsConsideredJointly')) end,
    case when s.payload ? 'links'
         then array(select jsonb_array_elements_text(s.payload->'links')) end,
    s.source_path,
    s.staged_at,
    now()
  from _stage_processes s
  where s.term = p_term
  on conflict (term, number) do update set
    title = excluded.title,
    title_final = excluded.title_final,
    description = excluded.description,
    document_type = excluded.document_type,
    document_type_enum = excluded.document_type_enum,
    document_date = excluded.document_date,
    closure_date = excluded.closure_date,
    process_start_date = excluded.process_start_date,
    change_date = excluded.change_date,
    web_generated_date = excluded.web_generated_date,
    ue_flag = excluded.ue_flag,
    passed = excluded.passed,
    principle_of_subsidiarity = excluded.principle_of_subsidiarity,
    shorten_procedure = excluded.shorten_procedure,
    legislative_committee = excluded.legislative_committee,
    urgency_status = excluded.urgency_status,
    rcl_link = excluded.rcl_link,
    rcl_num = excluded.rcl_num,
    eli = excluded.eli,
    address = excluded.address,
    display_address = excluded.display_address,
    comments = excluded.comments,
    prints_considered_jointly = excluded.prints_considered_jointly,
    links = excluded.links,
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;

  -- 2) Stub-extend committees for any committeeCode appearing in stages but
  --    not yet in committees. Mirrors 0020 stub pattern. Walks tree recursively
  --    via a recursive CTE that descends into children[].
  with recursive walk(node) as (
    select jsonb_array_elements(coalesce(sp.payload->'stages','[]'::jsonb))
    from _stage_processes sp where sp.term = p_term
    union all
    select jsonb_array_elements(coalesce(w.node->'children','[]'::jsonb))
    from walk w
    where jsonb_typeof(w.node->'children') = 'array'
  )
  insert into committees(term, code, name, is_stub, loaded_at)
  select distinct
    p_term,
    w.node->>'committeeCode',
    w.node->>'committeeCode',
    true,
    now()
  from walk w
  where (w.node->>'committeeCode') is not null
    and (w.node->>'committeeCode') <> ''
  on conflict (term, code) do nothing;

  -- 3) stages: replace-all for term (snapshot semantics).
  delete from process_stages ps
  using processes p
  where ps.process_id = p.id and p.term = p_term;

  -- 3a) Per-process recursive insert. Iterates each process's stages array,
  --     calls _insert_process_stage which recurses children.
  for proc in
    select sp.payload as payload, p.id as process_id
    from _stage_processes sp
    join processes p on p.term = sp.term and p.number = sp.payload->>'number'
    where sp.term = p_term
  loop
    s_idx := 0;
    if jsonb_typeof(proc.payload->'stages') = 'array' then
      for stage_node in select value from jsonb_array_elements(proc.payload->'stages')
      loop
        perform _insert_process_stage(
          proc.process_id, p_term, null::bigint, 0, s_idx, stage_node
        );
        s_idx := s_idx + 1;
      end loop;
    end if;
  end loop;

  -- 4) Queue unresolved print refs (print_number set but print_id NULL).
  -- Wipe open entries first so a re-run produces a fresh queue (mirrors 0008).
  delete from unresolved_process_print_refs
  where term = p_term and resolved_at is null;

  insert into unresolved_process_print_refs(
    term, process_number, stage_id, raw_print_number, raw_stage_name, raw_stage_type, reason
  )
  select
    p.term,
    p.number,
    ps.id,
    ps.print_number,
    ps.stage_name,
    ps.stage_type,
    'print_number not in prints; cross-resource or sentinel'
  from process_stages ps
  join processes p on p.id = ps.process_id
  where p.term = p_term
    and ps.print_number is not null
    and ps.print_id is null
  on conflict (term, process_number, raw_print_number, raw_stage_name) do update set
    detected_at = now(),
    resolved_at = null,
    resolution_note = null;

  -- 5) Truncate stage. Per pattern in committees/prints loaders: leave staging
  --    in place so re-running stage+load is cheap. (Other loaders also leave it.)

  return affected;
end $$;

-- ---------- cycle invariant ----------
-- Recursive walk over process_stages.parent_id. Counts distinct stage rows
-- participating in a cycle. Mirrors process_edge_cycle_count from 0008.
create or replace function process_stage_cycle_count(p_term integer default 10)
returns integer language sql stable as $$
  with recursive edges as (
    select ps.id as child_id, ps.parent_id
    from process_stages ps
    join processes p on p.id = ps.process_id
    where p.term = p_term and ps.parent_id is not null
  ),
  walk(start_id, curr_id, depth, path, found_cycle) as (
    select e.child_id, e.parent_id, 1, array[e.child_id, e.parent_id], false
    from edges e
    union all
    select w.start_id, n.parent_id, w.depth + 1, w.path || n.parent_id,
           n.parent_id = any(w.path)
    from walk w
    join edges n on n.child_id = w.curr_id
    where not w.found_cycle and w.depth < 50 and n.parent_id is not null
  )
  select coalesce(count(distinct start_id), 0)::integer
  from walk where found_cycle;
$$;

-- ---------- assert_invariants extension ----------
-- Append processes fields. Existing fields preserved verbatim from 0020.
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
    -- processes (added in 0021)
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
  return result;
end $$;
