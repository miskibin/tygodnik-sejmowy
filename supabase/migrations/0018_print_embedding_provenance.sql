-- 0018_print_embedding_provenance.sql
-- Track WHICH embedding model was last applied to a print and WHEN. The
-- actual vector lives in embeddings(entity_type='print', entity_id=number).
-- These columns are a fast pointer for "is this print embedded yet?"
-- queries without joining embeddings.

alter table prints add column if not exists embedding_model text;
alter table prints add column if not exists embedded_at     timestamptz;

alter table prints add constraint prints_embedding_provenance check (
  embedding_model is null
  or embedded_at is not null
);

create index if not exists prints_embedding_pending_idx on prints(term, number)
  where embedded_at is null;
