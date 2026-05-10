-- Force full re-embed under qwen3-embedding:0.6b.
--
-- Old nomic-embed-text-v2-moe rows stay in the embeddings table (unique key
-- includes ``model``) so historical cosine queries still work; new qwen rows
-- are added side-by-side. Stamping columns get cleared so the per-job pending
-- filters pick up every row again.

-- Prints — clear marker so `enrich prints --kind embed` re-processes all.
update prints
set embedded_at = null,
    embedding_model = null
where embedded_at is not null;

-- Proceeding statements — same pattern.
update proceeding_statements
set embedded_at = null,
    embedding_model = null
where embedded_at is not null;

-- Promises — embed_promise's pending filter is "promise.id has no embeddings
-- row of entity_type='promise'" so we just delete the old nomic rows.
delete from embeddings
where entity_type = 'promise'
  and model = 'nomic-embed-text-v2-moe';

-- Verify
select 'prints'    as t, count(*) filter (where embedded_at is not null) as embedded, count(*) total from prints
union all
select 'statements' as t, count(*) filter (where embedded_at is not null), count(*) from proceeding_statements
union all
select 'promises'   as t, (select count(*) from embeddings where entity_type='promise'), count(*) from promises;
