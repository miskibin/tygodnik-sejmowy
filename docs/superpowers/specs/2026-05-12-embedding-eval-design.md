# Embedding Model Eval: qwen3 vs mmlw — design

Date: 2026-05-12
Status: spec → implementation in same session (user approved end-to-end execution)

## Goal

Decide whether to swap default print-embedding model from
`qwen3-embedding:0.6b` (Ollama, 1024-d) to
`sdadas/mmlw-retrieval-roberta-large-v2` (sentence-transformers, 1024-d, Polish-specialised).

Decision criteria (priority order):
1. **Retrieval quality** — nDCG@10, MRR@10, Recall@{1,5,10} on Polish citizen-style queries
2. **Quality per token** — same metrics divided by inference cost (params × tokens)
3. **Speed** — batch throughput passages/sec on CPU and (if available) GPU

Out of scope: serving infra for mmlw if it wins. That's a separate brainstorm. This spec
delivers only the **go/no-go evidence** plus **regression tests** so any future swap can't
silently degrade quality.

## Why this matters

- Corpus is ~200M tokens (prints + summaries + statements + promises) — re-embedding the
  whole base is a non-trivial GPU/IO bill. Wrong model = wasted bill + worse retrieval
  forever (until next swap).
- Embeddings power **ETL only** (promise→print matching, similar-print detection). No
  frontend realtime search anymore. So per-query latency is irrelevant; batch throughput
  + quality dominate.
- `frontend/lib/db/search.ts::vectorSearch` is now dead code (no callers). Flagged for
  deletion as separate task.

## Components

### 1. Query mining script — `scripts/embed_eval/mine_queries.py`
- Pull ~50 random prints from term 10 with non-null `summary`, distributed across
  distinct `process_id` so queries aren't clustered.
- For each, call deepseek-v4-flash with a paraphrase prompt: "Given this print title,
  write a one-sentence citizen-style question or phrase someone would search to find this
  bill." Plain Polish, lowercase, no quote marks.
- Emit `tests/fixtures/embed_eval/queries_pl.jsonl` —
  `{query, expected_print_number, source_title, mining_method, gold: true|false}`.
- User reviews. We keep 30 best (flip `gold: true`). The rest stay as silver-quality for
  bulk metrics.

### 2. mmlw backend — `scripts/embed_eval/mmlw_backend.py`
- `SentenceTransformer("sdadas/mmlw-retrieval-roberta-large-v2")`
- `encode_queries(texts)` prepends `[query]: ` per model card
- `encode_passages(texts)` no prefix
- fp16 + CUDA if available, else fp32 CPU. Batch size 8 (RoBERTa-large is ~1.6 GB fp32 →
  fits even modest VRAM at small batch).
- Eval-only; does NOT touch `supagraf/enrich/embed.py`.

### 3. qwen backend — `scripts/embed_eval/qwen_backend.py`
- Thin wrapper over existing `supagraf.enrich.embed.embed_text` with the qwen model name.
- Same `encode_queries` / `encode_passages` interface (both call qwen, no prefix —
  qwen3-embedding does not document a query prefix).

### 4. Passage strategy variants — `scripts/embed_eval/passage_builders.py`
- `summary_only` — current behaviour: `prints.summary[:MAX_INPUT_CHARS]`
- `title_plus_summary` — `f"{title}\n\n{summary}"`
- `title_subjects_summary` — `f"{title}\nTagi: {', '.join(subjects)}\n\n{summary}"`

Tests which textual representation retrieves better, independent of model.

### 5. Eval orchestrator — `scripts/embed_eval/run_eval.py`
- Loads ~500 print passages (recent term, summary present).
- Cross product: `{qwen, mmlw} × {summary_only, title_plus_summary, title_subjects_summary}`
  = **6 cells**.
- For each cell: embed corpus + 30 queries, compute cosine top-k vs each query, score.
- Cache embedded corpus to local pickle keyed on (model, strategy, content_sha256). Re-run
  is cheap.

### 6. Scorer — `scripts/embed_eval/metrics.py`
- nDCG@10 (single-relevant), MRR@10, Recall@{1,5,10}
- Mean across queries + bootstrap 95% CI

### 7. Report — `docs/embedding_eval_2026-05-12.md`
- Markdown table: 6 cells × 5 metrics. Winner highlighted.
- Per-query failure list: which queries the winner still misses (debug seed).
- Decision and recommended next steps.

### 8. Tests
- `tests/supagraf/unit/test_embed_quality.py` — frozen mini-corpus of 10 prints + 5
  queries baked into repo. Uses **pre-computed reference vectors** stored as fixtures
  (no live model call). Asserts top-1 hit rate. Catches dim/normalization regressions.
  Always runs.
- `tests/supagraf/e2e/test_embed_quality_live.py` — same mini-corpus, but hits live
  default backend. Skipped unless `RUN_EMBED_QUALITY=1`. Compares against
  baseline scores checked into repo so a model swap is forced to be a deliberate update.
- Extensions to `tests/supagraf/unit/test_embed.py` — assert truncation at
  `MAX_INPUT_CHARS`, dim invariant, passage-vs-query prefix path (when mmlw lands).

## Non-goals

- Replace `embed.py` default. We do NOT change the production embedding pipeline in
  this PR. After the report, user picks whether to migrate; migration is a separate
  spec (needs serving choice — FastAPI sidecar / vLLM / Ollama-shim).
- Re-embed 200M tokens. Eval corpus is ~500 prints.
- Frontend changes. `vectorSearch` deletion tracked separately.

## Risks

- **mmlw is 0.4B fp32 = 1.6 GB on disk**, downloads on first run. If sentence-transformers
  install fails on py3.10/Windows, fall back to direct HF transformers loader.
- **Ollama must be running** for qwen comparison. If not, eval skips qwen and reports
  partial.
- **Query mining via deepseek** depends on `DEEPSEEK_API_KEY`. If missing, fall back to
  template-mined queries (title → "co mówi {short_title}?") for a degraded but
  functional eval.

## Done when

- 6-cell eval report committed to `docs/`
- Test files committed and passing (unit + e2e gated)
- Recommendation paragraph at top of report so user can read it half-asleep
