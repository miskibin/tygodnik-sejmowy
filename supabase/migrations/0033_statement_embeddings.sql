-- 0033_statement_embeddings.sql
-- Per-statement embeddings for "Mowa" (utterance) search across proceedings.
-- Extends embeddings.entity_type CHECK to include 'proceeding_statement', and
-- adds provenance columns on proceeding_statements (mirrors prints pattern from
-- 0018_print_embedding_provenance.sql).
--
-- COORDINATION NOTE: this re-issues the embeddings.entity_type CHECK previously
-- set in 0029_promise_matcher.sql. Preserves all existing types. Mirror in
-- supagraf/enrich/embed.py:ALLOWED_ENTITY_TYPES.

-- ---------- extend embeddings.entity_type CHECK ----------
alter table embeddings drop constraint if exists embeddings_entity_type_check;
alter table embeddings add constraint embeddings_entity_type_check
  check (entity_type in (
    'print', 'print_attachment', 'act', 'mp_bio', 'process', 'promise',
    'proceeding_statement'
  ));

-- ---------- proceeding_statements provenance ----------
alter table proceeding_statements
  add column if not exists embedding_model text,
  add column if not exists embedded_at     timestamptz;

-- Symmetric to prints_embedding_provenance (0018): if model is set, timestamp
-- must be too. Allows both NULL (not yet embedded) or both set.
alter table proceeding_statements
  drop constraint if exists proceeding_statements_embedding_provenance;
alter table proceeding_statements
  add constraint proceeding_statements_embedding_provenance check (
    embedding_model is null or embedded_at is not null
  );

-- Pending = body_text exists but embedding has not yet been computed.
-- Matches the partial-index pattern from 0018.
create index if not exists statement_embedding_pending_idx
  on proceeding_statements (id)
  where embedded_at is null and body_text is not null;
