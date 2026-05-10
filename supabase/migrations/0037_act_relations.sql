-- ============================================================================
-- 0037_act_relations.sql -- cross-act references (amends / derogated_by / ...)
-- Source: api.sejm.gov.pl/eli/acts/.../detail.references
-- The API returns references{} keyed by Polish category names like
--   "Akty zmienione", "Akty uchylone", "Tekst jednolity dla aktu", ...
-- We normalize these into a canonical relation_type enum (text + CHECK).
-- Note: avoid keying CASE on raw Polish strings with diacritics inside the
-- Postgres source (encoding round-trips through Supabase MCP can be lossy);
-- prefer ILIKE with ASCII-prefix patterns where possible.
-- ============================================================================

create table if not exists act_relations (
  id              bigserial primary key,
  source_act_id   bigint not null references acts(id) on delete cascade,
  relation_type   text   not null check (relation_type in (
    'amends','amended_by','derogated_by','derogates','consolidates',
    'implements','executed_by','interprets','consolidated_by',
    'legal_basis','legal_basis_article','related'
  )),
  target_act_id   bigint references acts(id) on delete cascade,
  target_eli_id   text,
  raw_category    text,                  -- original Polish key from API
  raw_article     text,                  -- e.g. "art. 16 ust. 1"
  since           date,
  loaded_at       timestamptz not null default now(),
  -- self-cycle prevention: act cannot directly relate to itself
  check (target_act_id is null or source_act_id <> target_act_id),
  -- one of target_act_id OR target_eli_id must be set
  check (target_act_id is not null or target_eli_id is not null)
);
-- Unique index (not constraint) so we can use coalesce()/expressions.
create unique index if not exists act_relations_unq
  on act_relations(source_act_id, relation_type,
                   coalesce(target_eli_id, target_act_id::text),
                   coalesce(raw_article, ''));
create index if not exists act_relations_src_idx on act_relations(source_act_id);
create index if not exists act_relations_tgt_idx on act_relations(target_act_id) where target_act_id is not null;
create index if not exists act_relations_type_idx on act_relations(relation_type);

create table if not exists unresolved_act_relations (
  id              bigserial primary key,
  source_act_id   bigint not null references acts(id) on delete cascade,
  relation_type   text   not null,
  target_eli_id   text   not null,
  raw_category    text,
  raw_article     text,
  detected_at     timestamptz not null default now(),
  resolved_at     timestamptz,
  resolution_note text
);
create unique index if not exists unresolved_act_relations_unq
  on unresolved_act_relations(source_act_id, relation_type, target_eli_id, coalesce(raw_article, ''));
create index if not exists unresolved_act_rel_open_idx
  on unresolved_act_relations(detected_at desc) where resolved_at is null;

create or replace function _normalize_act_relation(raw_category text)
returns text language sql immutable as $$
  select case
    when raw_category = 'Akty zmienione'                  then 'amends'
    when raw_category ilike 'Akty zmieniaj%'              then 'amended_by'
    when raw_category = 'Akty uchylone'                   then 'derogates'
    when raw_category ilike 'Akty uchylaj%'               then 'derogated_by'
    when raw_category = 'Tekst jednolity dla aktu'        then 'consolidates'
    when raw_category = 'Akt jednolity'                   then 'consolidated_by'
    when raw_category ilike 'Inf. o teksc%'               then 'consolidated_by'
    when raw_category ilike 'Inf. o teks%jednolit%'       then 'consolidated_by'
    when raw_category = 'Akty wykonawcze'                 then 'executed_by'
    when raw_category ilike 'Akty wykonuj%'               then 'implements'
    when raw_category = 'Akty wykonywane'                 then 'implements'
    when raw_category = 'Podstawa prawna'                 then 'legal_basis'
    when raw_category = 'Podstawa prawna z art.'          then 'legal_basis_article'
    when raw_category = 'Wyrok TK'                        then 'related'
    when raw_category = 'Orzeczenie TK'                   then 'related'
    when raw_category = 'Interpretacja'                   then 'interprets'
    else 'related'
  end;
$$;

-- load_act_relations -- shred relations from staged payload into act_relations
-- (resolved targets) and unresolved_act_relations (targets we don't have yet).
-- Idempotent: wipes prior rows for the source_acts before re-inserting.
create or replace function load_act_relations(p_term integer default 10)
returns integer language plpgsql as $$
declare
  ins_resolved integer := 0;
  ins_unresolved integer := 0;
begin
  delete from act_relations
  where source_act_id in (
    select a.id from acts a join _stage_acts s on s.eli_id = a.eli_id
  );
  delete from unresolved_act_relations
  where source_act_id in (
    select a.id from acts a join _stage_acts s on s.eli_id = a.eli_id
  );

  with rels as (
    select
      a.id                                  as source_act_id,
      cat.key                               as raw_category,
      _normalize_act_relation(cat.key)      as relation_type,
      ref->>'id'                            as target_eli_id,
      nullif(ref->>'art','')                as raw_article,
      nullif(ref->>'date','')::date         as since
    from _stage_acts s
    join acts a on a.eli_id = s.eli_id,
         jsonb_each(coalesce(s.payload->'references','{}'::jsonb)) as cat,
         jsonb_array_elements(case when jsonb_typeof(cat.value) = 'array'
                                   then cat.value
                                   else '[]'::jsonb end) ref
    where ref ? 'id'
  ),
  resolved as (
    insert into act_relations(
      source_act_id, relation_type, target_act_id, target_eli_id,
      raw_category, raw_article, since
    )
    select
      r.source_act_id, r.relation_type, ta.id, r.target_eli_id,
      r.raw_category, r.raw_article, r.since
    from rels r
    join acts ta on ta.eli_id = r.target_eli_id
    where r.source_act_id <> ta.id  -- self-cycle guard
    on conflict do nothing
    returning 1
  ),
  unresolved as (
    insert into unresolved_act_relations(
      source_act_id, relation_type, target_eli_id, raw_category, raw_article
    )
    select
      r.source_act_id, r.relation_type, r.target_eli_id, r.raw_category, r.raw_article
    from rels r
    left join acts ta on ta.eli_id = r.target_eli_id
    where ta.id is null
    on conflict do nothing
    returning 1
  )
  select (select count(*) from resolved), (select count(*) from unresolved)
    into ins_resolved, ins_unresolved;

  return ins_resolved + ins_unresolved;
end $$;
