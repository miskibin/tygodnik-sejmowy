-- 0023_bills.sql
-- E2: Sejm bills (RPW projects).
-- Flat resource: one row per RPW number. Hard FK on print when resolvable;
-- unresolved print refs land in unresolved_bill_print_refs (mirrors 0008/0021).
-- CHECK enums derived from actual fixture audit (175 RPW_*.json files):
--   applicant_type:   DEPUTIES|GOVERNMENT|PRESIDENT|COMMITTEE|PRESIDIUM|SENATE
--   submission_type:  BILL|DRAFT_RESOLUTION|BILL_AMENDMENT|RESOLUTION_AMENDMENT
--   status:           ACTIVE|NOT_PROCEEDED
-- All observed fields modeled (extra="forbid" upstream).

-- ---------- bills ----------
create table if not exists bills (
  id                              bigserial primary key,
  term                            integer not null references terms(term),
  number                          text    not null,                  -- slash form: 'RPW/10073/2026'
  title                           text    not null,
  description                     text,
  applicant_type                  text    not null,
  submission_type                 text    not null,
  status                          text    not null,
  eu_related                      boolean not null,
  public_consultation             boolean not null,
  consultation_results            boolean not null,
  date_of_receipt                 date    not null,
  print_number                    text,                              -- raw value (informational)
  print_id                        bigint references prints(id) on delete restrict,
  senders_number                  text,                              -- e.g. 'RM-0610-38-26'
  public_consultation_start_date  date,
  public_consultation_end_date    date,
  source_path                     text,
  staged_at                       timestamptz,
  loaded_at                       timestamptz not null default now(),
  unique (term, number),
  check (term > 0),
  check (applicant_type in ('DEPUTIES','GOVERNMENT','PRESIDENT','COMMITTEE','PRESIDIUM','SENATE')),
  check (submission_type in ('BILL','DRAFT_RESOLUTION','BILL_AMENDMENT','RESOLUTION_AMENDMENT')),
  check (status in ('ACTIVE','NOT_PROCEEDED')),
  -- print_id resolved iff print_number set; both null OR both not null when resolvable.
  -- (Unresolved cases: print_number set but print_id NULL → queued; allowed.)
  check (print_id is null or print_number is not null)
);
create index if not exists bills_term_idx on bills(term);
create index if not exists bills_print_idx on bills(print_id);
create index if not exists bills_status_idx on bills(status);

-- ---------- unresolved_bill_print_refs ----------
-- Mirrors 0008 unresolved_print_refs / 0021 unresolved_process_print_refs.
create table if not exists unresolved_bill_print_refs (
  id                bigserial primary key,
  term              integer not null references terms(term),
  bill_number       text    not null,
  bill_id           bigint  references bills(id) on delete cascade,
  raw_print_number  text    not null,
  reason            text    not null,
  detected_at       timestamptz not null default now(),
  resolved_at       timestamptz,
  resolution_note   text,
  unique (term, bill_number, raw_print_number)
);
create index if not exists unresolved_bill_print_term_idx
  on unresolved_bill_print_refs(term) where resolved_at is null;

-- ---------- raw stage ----------
create table if not exists _stage_bills (
  id          bigserial primary key,
  term        integer not null,
  natural_id  text    not null,                                       -- bill 'number' (slash form)
  payload     jsonb   not null,
  source_path text    not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (term, natural_id)
);

-- ---------- load_bills ----------
-- Atomic: shred jsonb → bills, resolve print_id by lookup, queue unresolved.
-- ON CONFLICT (term, number) DO UPDATE — full upsert (snapshot semantics).
create or replace function load_bills(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  -- 1) Upsert bills, resolving print_id at insert time.
  insert into bills(
    term, number, title, description,
    applicant_type, submission_type, status,
    eu_related, public_consultation, consultation_results,
    date_of_receipt,
    print_number, print_id,
    senders_number,
    public_consultation_start_date, public_consultation_end_date,
    source_path, staged_at, loaded_at
  )
  select
    s.term,
    s.payload->>'number',
    s.payload->>'title',
    s.payload->>'description',
    s.payload->>'applicantType',
    s.payload->>'submissionType',
    s.payload->>'status',
    (s.payload->>'euRelated')::boolean,
    (s.payload->>'publicConsultation')::boolean,
    (s.payload->>'consultationResults')::boolean,
    (s.payload->>'dateOfReceipt')::date,
    s.payload->>'print',
    p.id,
    s.payload->>'sendersNumber',
    nullif(s.payload->>'publicConsultationStartDate','')::date,
    nullif(s.payload->>'publicConsultationEndDate','')::date,
    s.source_path,
    s.staged_at,
    now()
  from _stage_bills s
  left join prints p on p.term = s.term and p.number = s.payload->>'print'
  where s.term = p_term
  on conflict (term, number) do update set
    title = excluded.title,
    description = excluded.description,
    applicant_type = excluded.applicant_type,
    submission_type = excluded.submission_type,
    status = excluded.status,
    eu_related = excluded.eu_related,
    public_consultation = excluded.public_consultation,
    consultation_results = excluded.consultation_results,
    date_of_receipt = excluded.date_of_receipt,
    print_number = excluded.print_number,
    print_id = excluded.print_id,
    senders_number = excluded.senders_number,
    public_consultation_start_date = excluded.public_consultation_start_date,
    public_consultation_end_date = excluded.public_consultation_end_date,
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;

  -- 2) Queue unresolved print refs (print_number set, print_id NULL).
  -- Wipe open queue first so re-runs produce a fresh snapshot (mirrors 0008/0021).
  delete from unresolved_bill_print_refs
  where term = p_term and resolved_at is null;

  insert into unresolved_bill_print_refs(
    term, bill_number, bill_id, raw_print_number, reason
  )
  select
    b.term,
    b.number,
    b.id,
    b.print_number,
    'print_number not in prints; cross-resource or sentinel'
  from bills b
  where b.term = p_term
    and b.print_number is not null
    and b.print_id is null
  on conflict (term, bill_number, raw_print_number) do update set
    bill_id = excluded.bill_id,
    detected_at = now(),
    resolved_at = null,
    resolution_note = null;

  -- 3) Truncate stage. Per pattern in committees/processes: leave staging in
  --    place so re-running stage+load is cheap. Other loaders also leave it.

  return affected;
end $$;

-- ---------- assert_invariants extension ----------
-- Append bills fields. Existing fields preserved verbatim from 0021.
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
    -- bills (added in 0023)
    'bills_total',
        (select count(*) from bills where term = p_term),
    'bills_by_status',
        (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb)
         from (select status, count(*) c from bills where term = p_term group by status) x),
    'bills_eu_related_count',
        (select count(*) from bills where term = p_term and eu_related),
    'bills_with_print_count',
        (select count(*) from bills where term = p_term and print_id is not null),
    'bills_unresolved_print_count',
        (select count(*) from bills where term = p_term
           and print_number is not null and print_id is null),
    'unresolved_bill_print_refs_open',
        (select count(*) from unresolved_bill_print_refs
         where term = p_term and resolved_at is null)
  ) into result;
  return result;
end $$;
