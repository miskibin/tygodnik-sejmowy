-- 0008_prints_relationships.sql
-- Drop denormalized process_print[]. Add is_primary/is_additional/parent_number flags.
-- Materialize relationships into print_relationships with hard FKs.
-- Dangling refs go to unresolved_print_refs queue (no silent loss).

-- 1) Drop denormalized array (data redundant w _stage_prints.payload).
alter table prints drop column if exists process_print;

-- 2) Derived flags + parent linkage
alter table prints add column if not exists is_primary boolean not null default false;
alter table prints add column if not exists is_additional boolean not null default false;
alter table prints add column if not exists parent_number text;

-- Hard FK: parent_number must reference an existing print in same term.
-- DEFERRED: parent and child rows arrive via two passes within one transaction.
do $$ begin
  alter table prints add constraint prints_parent_fk
    foreign key (term, parent_number) references prints(term, number)
    deferrable initially deferred;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table prints add constraint prints_additional_consistency
    check ((is_additional = false and parent_number is null)
        or (is_additional = true  and parent_number is not null));
exception when duplicate_object then null; end $$;

-- 3) Edge table
create table if not exists print_relationships (
  id            bigserial primary key,
  term          integer not null references terms(term),
  from_number   text    not null,
  to_number     text    not null,
  relation_type text    not null check (relation_type in ('process','additional')),
  is_self_ref   boolean not null default false,
  ordinal       integer not null default 0,
  unique (term, from_number, to_number, relation_type),
  -- Hard FKs both endpoints. Deferrable: child/parent rebuild inside one txn.
  foreign key (term, from_number) references prints(term, number) on delete cascade deferrable initially deferred,
  foreign key (term, to_number)   references prints(term, number) on delete cascade deferrable initially deferred,
  -- is_self_ref iff endpoints equal.
  check (is_self_ref = (from_number = to_number))
);
create index if not exists print_rel_to_idx on print_relationships(term, to_number);
create index if not exists print_rel_type_idx on print_relationships(term, relation_type);

-- 4) Unresolved queue: dangling targets (cross-resource process refs land here
-- until processes resource ships in Phase D+).
create table if not exists unresolved_print_refs (
  id              bigserial primary key,
  term            integer not null references terms(term),
  from_number     text    not null,
  raw_to_number   text    not null,
  raw_relation    text    not null check (raw_relation in ('process','additional')),
  reason          text    not null,
  detected_at     timestamptz not null default now(),
  resolved_at     timestamptz,
  resolution_note text,
  unique (term, from_number, raw_to_number, raw_relation),
  foreign key (term, from_number) references prints(term, number) on delete cascade
);
create index if not exists unresolved_refs_term_idx on unresolved_print_refs(term)
  where resolved_at is null;

-- 5) Updated load_prints — set is_primary; drop process_print insert.
create or replace function load_prints(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  insert into prints(term, number, title, change_date, delivery_date, document_date,
                     is_primary, is_additional, parent_number,
                     source_path, staged_at, loaded_at)
  select
    s.term,
    s.payload->>'number',
    s.payload->>'title',
    (s.payload->>'changeDate')::timestamptz,
    (s.payload->>'deliveryDate')::date,
    (s.payload->>'documentDate')::date,
    -- is_primary: processPrint exists and first element equals own number
    coalesce((s.payload->'processPrint'->>0) = s.payload->>'number', false),
    false,                          -- is_additional: parents
    null::text,                     -- parent_number: parents have none
    s.source_path,
    s.staged_at,
    now()
  from _stage_prints s
  where s.term = p_term
  on conflict (term, number) do update set
    title = excluded.title,
    change_date = excluded.change_date,
    delivery_date = excluded.delivery_date,
    document_date = excluded.document_date,
    is_primary = excluded.is_primary,
    -- is_additional/parent_number untouched on parents path
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;
  return affected;
end $$;

-- 6) Load additionalPrints children as first-class prints rows.
create or replace function load_prints_additional(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  -- Each parent's additionalPrints[*] becomes a row in prints with is_additional=true,
  -- parent_number set to the parent's number.
  insert into prints(term, number, title, change_date, delivery_date, document_date,
                     is_primary, is_additional, parent_number,
                     source_path, staged_at, loaded_at)
  select
    s.term,
    child->>'number',
    child->>'title',
    (child->>'changeDate')::timestamptz,
    (child->>'deliveryDate')::date,
    (child->>'documentDate')::date,
    false,                        -- children never primary of process
    true,
    s.payload->>'number',         -- parent linkage
    s.source_path || '#additional/' || (child->>'number'),
    s.staged_at,
    now()
  from _stage_prints s
  cross join lateral jsonb_array_elements(coalesce(s.payload->'additionalPrints','[]'::jsonb)) as child
  where s.term = p_term
  on conflict (term, number) do update set
    title = excluded.title,
    change_date = excluded.change_date,
    delivery_date = excluded.delivery_date,
    document_date = excluded.document_date,
    is_additional = excluded.is_additional,
    parent_number = excluded.parent_number,
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;
  return affected;
end $$;

-- 7) Materialize relationships. Process edges from processPrint; additional edges
-- from additionalPrints children. Self-refs persisted with is_self_ref=true. Dangling
-- to_numbers go to unresolved_print_refs (no silent skip).
create or replace function load_print_relationships(p_term integer default 10)
returns integer language plpgsql as $$
declare
  ins_rel integer;
  ins_unr integer;
begin
  -- Wipe + reinsert (relations are derived; cheap to rebuild).
  delete from print_relationships pr
  using prints p
  where pr.term = p.term and pr.from_number = p.number and p.term = p_term;
  delete from unresolved_print_refs ur
  where ur.term = p_term and ur.resolved_at is null;

  -- ---- process edges (from _stage_prints.payload->'processPrint')
  with candidates as (
    select
      s.term,
      s.payload->>'number'        as from_number,
      pp                          as to_number,
      (ord - 1)::integer          as ordinal
    from _stage_prints s
    cross join lateral jsonb_array_elements_text(coalesce(s.payload->'processPrint','[]'::jsonb))
      with ordinality as t(pp, ord)
    where s.term = p_term
  ),
  resolvable as (
    select c.*
    from candidates c
    where exists (
      select 1 from prints p
      where p.term = c.term and p.number = c.to_number
    )
  ),
  unresolved as (
    select c.*
    from candidates c
    where not exists (
      select 1 from prints p
      where p.term = c.term and p.number = c.to_number
    )
  ),
  ins_rel_q as (
    insert into print_relationships(term, from_number, to_number, relation_type, is_self_ref, ordinal)
    select term, from_number, to_number, 'process',
           (from_number = to_number),
           ordinal
    from resolvable
    on conflict (term, from_number, to_number, relation_type) do update set
      ordinal = excluded.ordinal,
      is_self_ref = excluded.is_self_ref
    returning 1
  ),
  ins_unr_q as (
    insert into unresolved_print_refs(term, from_number, raw_to_number, raw_relation, reason)
    select term, from_number, to_number, 'process',
           'to_number not in prints; likely cross-resource ref to processes (Phase D+)'
    from unresolved
    on conflict (term, from_number, raw_to_number, raw_relation) do update set
      detected_at = now(),
      resolved_at = null,
      resolution_note = null
    returning 1
  )
  select (select count(*) from ins_rel_q), (select count(*) from ins_unr_q)
  into ins_rel, ins_unr;

  -- ---- additional edges (child -> parent; children all resolve since
  -- load_prints_additional ran first; FK validates regardless).
  insert into print_relationships(term, from_number, to_number, relation_type, is_self_ref, ordinal)
  select
    s.term,
    child->>'number',
    s.payload->>'number',
    'additional',
    false,
    0
  from _stage_prints s
  cross join lateral jsonb_array_elements(coalesce(s.payload->'additionalPrints','[]'::jsonb)) as child
  where s.term = p_term
  on conflict (term, from_number, to_number, relation_type) do update set
    ordinal = 0,
    is_self_ref = false;

  return ins_rel;
end $$;

-- 8) Cycle invariant — counts distinct non-self-ref process edges that participate
-- in a true cycle (path of length >=2 returning to a visited node). Self-refs are
-- intentional and excluded — they're tracked via is_self_ref flag, not as cycles.
create or replace function process_edge_cycle_count(p_term integer default 10)
returns integer language sql stable as $$
  with recursive non_self as (
    select from_number, to_number
    from print_relationships
    where term = p_term and relation_type = 'process' and not is_self_ref
  ),
  walk(start_n, curr_n, depth, path, found_cycle) as (
    select e.from_number, e.to_number, 1, array[e.from_number, e.to_number],
           false
    from non_self e
    union all
    select w.start_n, n.to_number, w.depth + 1, w.path || n.to_number,
           n.to_number = any(w.path)
    from walk w
    join non_self n on n.from_number = w.curr_n
    where not w.found_cycle and w.depth < 50
  )
  select coalesce(count(distinct start_n), 0)::integer
  from walk where found_cycle;
$$;
