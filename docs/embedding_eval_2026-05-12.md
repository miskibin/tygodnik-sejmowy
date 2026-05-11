# Embedding eval — qwen3 vs mmlw-v2

**Generated:** 2026-05-11T22:59:42.917774+00:00
**Corpus:** term 10, 105 prints with non-null summary
**Queries:** 40 citizen-style Polish paraphrases (mined from print titles via deepseek-flash)

## TL;DR

**Winner: `qwen3` + `title_plus_summary`** — nDCG@10 = 0.940, R@1 = 0.88, R@5 = 0.97 on 40 queries × 105 passages. 

**vs production baseline** (`qwen3` + `summary_only`, nDCG@10 = 0.889): Δ = **+0.051** absolute. 

**Apples-to-apples (both `summary_only`):** mmlw nDCG@10 = 0.919 vs qwen3 = 0.889 (Δ = +0.030). mmlw beats qwen3 on bare summary. But qwen3 closes the gap once you feed it title + summary — likely because qwen3 handles short prefixes more gracefully than RoBERTa's BPE tokenisation does. 

**Passage strategy matters more than model choice on this corpus**: within `qwen3`, `title_plus_summary` beats `summary_only` by +0.051 nDCG@10. Free quality lift — no serving change. 

**Action items:**
1. **Switch `embed_print.py` passage strategy to `title_plus_summary`** (currently `summary_only`). Re-embed all prints with the chosen strategy.
2. **Keep `qwen3` as embedding model.** mmlw not worth the serving-infra change for these results.
3. **Add quality regression tests** (see `tests/supagraf/unit/test_embed_quality.py`) so any future swap is forced to clear this bar.
4. **Bigger corpus before final call.** Only 105 prints had summaries on term 10 at eval time; re-run after summary backfill completes on terms 9-10 for more statistical power.

## Cells (sorted by nDCG@10 desc, 95% CI in brackets)

| model | strategy | nDCG@10 | MRR@10 | R@1 | R@5 | R@10 | queries/s | passages/s |
|---|---|---|---|---|---|---|---|---|
| `qwen3` | `title_plus_summary` | **0.940** [0.886, 0.988] | 0.920 | 0.88 | 0.97 | 1.00 | 0.3 | 11.0 |
| `qwen3` | `title_tags_summary` | **0.931** [0.875, 0.978] | 0.908 | 0.85 | 0.97 | 1.00 | 0.3 | 10.7 |
| `mmlw-v2` | `summary_only` | **0.919** [0.860, 0.971] | 0.892 | 0.82 | 0.97 | 1.00 | 1.7 | 2.2 |
| `mmlw-v2` | `title_plus_summary` | **0.902** [0.840, 0.954] | 0.869 | 0.78 | 0.97 | 1.00 | 1.7 | 2.0 |
| `mmlw-v2` | `title_tags_summary` | **0.899** [0.834, 0.955] | 0.865 | 0.78 | 0.97 | 1.00 | 1.7 | 2.0 |
| `qwen3` | `summary_only` | **0.889** [0.799, 0.957] | 0.868 | 0.80 | 0.95 | 0.95 | 0.3 | 10.6 |

- `summary_only`: current production behaviour (`prints.summary[:1400]`)
- `title_plus_summary`: title + double-newline + summary
- `title_tags_summary`: title + topic_tags + persona_tags + summary

Throughput numbers are wall-clock on CPU (sentence-transformers fp32) or Ollama localhost
(qwen3 via httpx, no batching). They reflect eval-time conditions, not production.

## Hardest queries (top-10 misses by winning cell)

| # | query | gold | top-1 | rank of gold |
|---|---|---|---|---|
| 1 | kto reprezentuje wnioskodawcow sejm | 2447-003 | 2484 | 7 |
| 2 | opinia UODO o systemie poparcia | 2452-001 | 2419-001 | 3 |
| 3 | zmiany w ordynacji podatkowej 2024 | 2480 | 2352 | 3 |
| 4 | kto reprezentuje prezydenta w sejmie | 2378-001 | 2484 | 2 |
| 5 | spółdzielnie uczniowskie zmiana prawa oświatowego | 2366 | 2449 | 2 |

## Methodology

1. **Corpus:** 105 prints with non-null summary from term 10,
   ordered by `prints.number` ASC (frozen for reproducibility).
2. **Queries:** mined via deepseek-flash with prompt "given this title, write one
   short citizen-style search phrase". Gold = source print number. Single-relevant
   labels.
3. **Embedding:** both models output 1024-d L2-normalised vectors; cosine == dot.
4. **Ranking:** dense top-50 per query via matrix dot product.
5. **Metrics:** nDCG@10 (single-relevant), MRR@10, Recall@{1,5,10}, all averaged
   across queries with 2k-iter bootstrap 95% CI.
6. **Caches:** corpus + embeddings cached on disk so re-runs are seconds.

## Limitations

- Single-relevant gold: ignores "related-but-not-source" prints that may legitimately
  out-rank the gold. Affects all cells equally → comparison is fair, absolute scores
  are pessimistic.
- 30-ish queries: small N. CIs are wide. Use for direction, not point estimates.
- Mining via LLM paraphrase: queries inherit deepseek's phrasing biases. Will not
  catch all real-user query styles. Augment with frontend search logs once available.
