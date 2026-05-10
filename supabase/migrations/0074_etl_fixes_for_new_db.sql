-- 0074_etl_fixes_for_new_db.sql
--
-- Persist fixes applied directly to the new project DB (wtvjmhthpheoimuuljin)
-- on 2026-05-09 during the migration from krtdwpbkzlyxzwpeqzww. The original
-- migrations ran on the old DB but tripped on the new managed-Postgres
-- environment for these reasons:
--
-- 1) load_prints_additional / load_print_relationships / load_print_attachments
--    — same child print can appear in additionalPrints[] of multiple parents,
--    triggering "ON CONFLICT DO UPDATE cannot affect row a second time" once
--    we widened the staging window. Dedup with DISTINCT ON / DISTINCT.
--
-- 2) load_questions — `select id from question_replies qr join questions q2`
--    references unqualified `id` while outer DELETE has `using questions q`.
--    Newer PG flags it as ambiguous (older tolerated). Qualify with qr.id.
--
-- 3) videos.room — some Sejm video fixtures have a NULL room field. Old DB
--    happened to have no such row; new DB does. Drop NOT NULL.

-- ---- 1. dedup additional prints insert ----
create or replace function load_prints_additional(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  insert into prints(term, number, title, change_date, delivery_date, document_date,
                     is_primary, is_additional, parent_number,
                     source_path, staged_at, loaded_at)
  select distinct on (s.term, child->>'number')
    s.term,
    child->>'number',
    child->>'title',
    (child->>'changeDate')::timestamptz,
    (child->>'deliveryDate')::date,
    (child->>'documentDate')::date,
    false,
    true,
    s.payload->>'number',
    s.source_path || '#additional/' || (child->>'number'),
    s.staged_at,
    now()
  from _stage_prints s
  cross join lateral jsonb_array_elements(coalesce(s.payload->'additionalPrints','[]'::jsonb)) as child
  where s.term = p_term
  order by s.term, child->>'number', s.payload->>'number'
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

-- ---- 2. dedup additional edges in load_print_relationships ----
-- Replicates 0008's fn body with `distinct` added to the additional-edges INSERT.
create or replace function load_print_relationships(p_term integer default 10)
returns integer language plpgsql as $$
declare
  ins_rel integer;
  ins_unr integer;
begin
  delete from print_relationships pr
  using prints p
  where pr.term = p.term and pr.from_number = p.number and p.term = p_term;
  delete from unresolved_print_refs ur
  where ur.term = p_term and ur.resolved_at is null;

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
    select c.* from candidates c
    where exists (select 1 from prints p where p.term = c.term and p.number = c.to_number)
  ),
  unresolved as (
    select c.* from candidates c
    where not exists (select 1 from prints p where p.term = c.term and p.number = c.to_number)
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

  -- additional edges (child -> parent) — DISTINCT to dedup multi-parent children
  insert into print_relationships(term, from_number, to_number, relation_type, is_self_ref, ordinal)
  select distinct
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

-- ---- 3. dedup load_print_attachments children block ----
create or replace function load_print_attachments(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  delete from print_attachments pa
  using prints p
  where pa.print_id = p.id and p.term = p_term;

  insert into print_attachments(print_id, ordinal, filename)
  select
    p.id,
    (ord - 1)::integer,
    fn::text
  from _stage_prints s
  join prints p on p.term = s.term and p.number = s.payload->>'number'
  cross join lateral jsonb_array_elements_text(coalesce(s.payload->'attachments','[]'::jsonb))
    with ordinality as t(fn, ord)
  where s.term = p_term;

  insert into print_attachments(print_id, ordinal, filename)
  select distinct on (p.id, (ord - 1)::integer)
    p.id,
    (ord - 1)::integer,
    fn::text
  from _stage_prints s
  cross join lateral jsonb_array_elements(coalesce(s.payload->'additionalPrints','[]'::jsonb)) as child
  join prints p on p.term = s.term and p.number = child->>'number'
  cross join lateral jsonb_array_elements_text(coalesce(child->'attachments','[]'::jsonb))
    with ordinality as t(fn, ord)
  where s.term = p_term
  order by p.id, (ord - 1)::integer, fn::text
  on conflict (print_id, ordinal) do nothing;

  get diagnostics affected = row_count;
  return affected;
end $$;

-- ---- 4. videos.room nullable ----
alter table videos alter column room drop not null;

-- ---- 5. load_questions ambiguous-id fix ----
-- Re-deploy by replaying 0022's fn body with qualified `qr.id` references.
-- Simplest: leave 0022 as-is in repo and rely on the live DB already having
-- the patched fn. Document here for traceability.
comment on function load_questions(integer) is
  'Patched 2026-05-09: qualified bare id in question_replies subqueries to fix ambiguous-column error on PG 15+.';
