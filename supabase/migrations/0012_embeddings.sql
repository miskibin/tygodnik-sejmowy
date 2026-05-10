-- 0012_embeddings.sql
-- Single typed embeddings table; one row per (entity_type, entity_id, model).
-- Hard CHECK constraint on entity_type — extend by ALTER when new entities ship.
-- HNSW index for cosine similarity (halfvec_cosine_ops).

create table if not exists embeddings (
  entity_type text       not null,
  entity_id   text       not null,
  model       text       not null,
  vec         halfvec(1024) not null,
  created_at  timestamptz not null default now(),
  primary key (entity_type, entity_id, model),
  check (entity_type in ('print','print_attachment','act','mp_bio','process'))
);

-- HNSW: cosine similarity. m=16 (default), ef_construction=64 (default; bump if recall poor).
create index if not exists embeddings_vec_hnsw
  on embeddings using hnsw (vec halfvec_cosine_ops);

-- Filter index for typical "give me embeddings of model X for entity_type Y"
create index if not exists embeddings_type_model_idx on embeddings(entity_type, model);

-- top-k cosine search via HNSW (operator '<=>' for halfvec_cosine_ops)
create or replace function embeddings_top_k(
  p_entity_type text,
  p_model       text,
  p_query       halfvec(1024),
  p_k           integer default 10
) returns table(entity_id text, distance double precision) language sql stable as $$
  select e.entity_id, (e.vec <=> p_query)::double precision as distance
  from embeddings e
  where e.entity_type = p_entity_type and e.model = p_model
  order by e.vec <=> p_query
  limit greatest(p_k, 1);
$$;
