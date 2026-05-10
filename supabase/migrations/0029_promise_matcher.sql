-- 0029_promise_matcher.sql
-- Promise -> print candidate matcher. Surfaces top-k similar prints per
-- promise via cosine similarity over the existing embeddings table; flags
-- them as 'pending' for human review. Confirmed candidates become the
-- evidence chain in the Obietnica vs glosowanie ledger.
--
-- COORDINATION NOTE: extends the embeddings.entity_type CHECK constraint to
-- include 'promise'. The Sejm-API agent owns the embeddings table; if both
-- agents apply migrations independently, this ALTER must be re-applied
-- after any embedding-table refactor on their side.
-- Mirror change in supagraf/enrich/embed.py:ALLOWED_ENTITY_TYPES.

-- ---------- extend embeddings.entity_type CHECK ----------
alter table embeddings drop constraint if exists embeddings_entity_type_check;
alter table embeddings add constraint embeddings_entity_type_check
  check (entity_type in (
    'print','print_attachment','act','mp_bio','process','promise'
  ));

-- ---------- promise_print_candidates ----------
-- One row per (promise, print, model). Pending until a reviewer confirms or
-- rejects. Re-running the matcher is idempotent: pending rows refresh their
-- similarity; confirmed/rejected rows are not touched.
create table if not exists promise_print_candidates (
  id            bigserial primary key,
  promise_id    bigint  not null references promises(id) on delete cascade,
  print_term    integer not null,
  print_number  text    not null,
  model         text    not null,
  similarity    numeric(5,4) not null check (similarity >= 0 and similarity <= 1),
  distance      numeric(5,4) not null check (distance >= 0),
  status        text    not null default 'pending'
                check (status in ('pending','confirmed','rejected')),
  reviewer      text,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (promise_id, print_term, print_number, model),
  foreign key (print_term, print_number) references prints(term, number) on delete cascade
);
create index if not exists promise_print_candidates_promise_idx
  on promise_print_candidates(promise_id);
create index if not exists promise_print_candidates_pending_idx
  on promise_print_candidates(status) where status = 'pending';

-- ---------- match_promise_to_prints ----------
-- Reads the promise's embedding, runs cosine top-k against prints, and
-- inserts/refreshes pending candidates above the similarity threshold.
-- Returns the number of rows inserted or refreshed.
--
-- p_max_distance defaults to 0.35 (== similarity >= 0.65), matching the
-- threshold called out in PLAN.md for the obietnica matcher.
create or replace function match_promise_to_prints(
  p_promise_id    bigint,
  p_term          integer default 10,
  p_top_k         integer default 25,
  p_max_distance  numeric default 0.35,
  p_model         text    default 'nomic-embed-text-v2-moe'
) returns integer language plpgsql as $$
declare
  promise_vec halfvec(1024);
  affected integer := 0;
begin
  -- Promise vector lookup. The matcher is a no-op until the promise has been
  -- embedded (run `enrich promises --kind embed` first).
  select vec into promise_vec
  from embeddings
  where entity_type = 'promise'
    and entity_id = p_promise_id::text
    and model = p_model;

  if promise_vec is null then
    raise exception 'no embedding for promise % (model %)', p_promise_id, p_model;
  end if;

  -- Print embeddings store entity_id = prints.number only (no term prefix);
  -- scope via the prints table's (term, number) unique key.
  with topk as (
    select
      pr.term      as print_term,
      pr.number    as print_number,
      (e.vec <=> promise_vec)::numeric(5,4) as distance,
      (1 - (e.vec <=> promise_vec))::numeric(5,4) as similarity
    from embeddings e
    join prints pr on pr.term = p_term and pr.number = e.entity_id
    where e.entity_type = 'print'
      and e.model = p_model
      and (e.vec <=> promise_vec) <= p_max_distance
    order by e.vec <=> promise_vec
    limit p_top_k
  )
  insert into promise_print_candidates(promise_id, print_term, print_number,
                                       model, similarity, distance, status)
  select p_promise_id, t.print_term, t.print_number, p_model,
         t.similarity, t.distance, 'pending'
  from topk t
  on conflict (promise_id, print_term, print_number, model) do update set
    -- Refresh similarity numbers but never demote a reviewer's verdict.
    similarity = excluded.similarity,
    distance = excluded.distance,
    status = case
      when promise_print_candidates.status in ('confirmed','rejected')
        then promise_print_candidates.status
      else 'pending'
    end;
  get diagnostics affected = row_count;
  return affected;
end $$;
