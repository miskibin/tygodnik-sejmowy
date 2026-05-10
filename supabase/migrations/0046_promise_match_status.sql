-- 0046_promise_match_status.sql
-- LLM re-ranker layer for the promise -> print matcher.
--
-- The cosine similarity matcher (0029_promise_matcher.sql) is broken in
-- production: 99% of true-positive promise/print pairs sit between cosine
-- distance 0.4 and 0.5 with qwen3-embedding:0.6b on Polish text. Lowering
-- the threshold pulls in too many noisy candidates, so we add an LLM
-- re-ranker classifier that labels each shortlisted candidate as
-- 'confirmed', 'candidate' or 'rejected'.
--
-- Without re-rank, status stays NULL on a row (raw cosine candidate from
-- vector search). After re-rank, the LLM verdict + a 1-line rationale +
-- timestamp + model are persisted alongside the original similarity score.
--
-- Mirror change: supagraf/enrich/promise_matcher.py:rerank_promise_matches.

-- ---------- columns -----------------------------------------------------
alter table promise_print_candidates
  add column if not exists match_status text
  check (match_status is null or match_status in ('confirmed','candidate','rejected'));

alter table promise_print_candidates
  add column if not exists match_rationale text;

alter table promise_print_candidates
  add column if not exists reranked_at timestamptz;

alter table promise_print_candidates
  add column if not exists reranked_model text;

create index if not exists promise_print_candidates_status_idx
  on promise_print_candidates (promise_id, match_status);

-- ---------- re-tune threshold ------------------------------------------
-- The PL/pgSQL function in 0029 defaulted p_max_distance = 0.35 (similarity
-- >= 0.65), which yielded near-zero matches because qwen3-embedding:0.6b
-- packs Polish text in the 0.4-0.5 cosine band. New default is 0.55. The
-- LLM re-ranker downstream filters out the false positives this admits.
create or replace function match_promise_to_prints(
  p_promise_id    bigint,
  p_term          integer default 10,
  p_top_k         integer default 25,
  p_max_distance  numeric default 0.55,
  p_model         text    default 'nomic-embed-text-v2-moe'
) returns integer language plpgsql as $$
declare
  promise_vec halfvec(1024);
  affected integer := 0;
begin
  select vec into promise_vec
  from embeddings
  where entity_type = 'promise'
    and entity_id = p_promise_id::text
    and model = p_model;

  if promise_vec is null then
    raise exception 'no embedding for promise % (model %)', p_promise_id, p_model;
  end if;

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
