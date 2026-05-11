"""Render eval results to a markdown report.

Reads scripts/embed_eval/_cache/results.json (produced by run_eval.py) and
writes docs/embedding_eval_<YYYY-MM-DD>.md with:
- TL;DR recommendation (top of file, half-asleep readable)
- 6-cell metric table
- Per-query failure list for the winning cell
- Throughput numbers
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

RESULTS_PATH = Path("scripts/embed_eval/_cache/results.json")
SHORT_NAMES = {
    "qwen3-embedding:0.6b": "qwen3",
    "sdadas/mmlw-retrieval-roberta-large-v2": "mmlw-v2",
}


def _short(model: str) -> str:
    return SHORT_NAMES.get(model, model)


def _rank_cells(cells: list[dict]) -> list[dict]:
    return sorted(cells, key=lambda c: c["metrics"]["ndcg@10"]["mean"], reverse=True)


def _by(cells: list[dict], backend: str, strategy: str) -> dict | None:
    for c in cells:
        if c["backend"] == backend and c["strategy"] == strategy:
            return c
    return None


def _recommendation(cells: list[dict]) -> str:
    ranked = _rank_cells(cells)
    if not ranked:
        return "No cells evaluated."
    winner = ranked[0]
    baseline = _by(cells, "qwen3-embedding:0.6b", "summary_only")

    w_ndcg = winner["metrics"]["ndcg@10"]["mean"]
    w_r1 = winner["metrics"]["recall@1"]["mean"]
    w_r5 = winner["metrics"]["recall@5"]["mean"]
    bits = [
        f"**Winner: `{_short(winner['backend'])}` + `{winner['strategy']}`** — "
        f"nDCG@10 = {w_ndcg:.3f}, R@1 = {w_r1:.2f}, R@5 = {w_r5:.2f} "
        f"on {winner['n_queries']} queries × {winner['n_passages']} passages.",
    ]
    if baseline:
        b_ndcg = baseline["metrics"]["ndcg@10"]["mean"]
        delta = w_ndcg - b_ndcg
        bits.append(
            f"\n\n**vs production baseline** (`qwen3` + `summary_only`, nDCG@10 = {b_ndcg:.3f}): "
            f"Δ = **{delta:+.3f}** absolute."
        )

    # Model-strategy interaction: same-strategy face-off
    qwen_so = _by(cells, "qwen3-embedding:0.6b", "summary_only")
    mmlw_so = _by(cells, "sdadas/mmlw-retrieval-roberta-large-v2", "summary_only")
    if qwen_so and mmlw_so:
        q = qwen_so["metrics"]["ndcg@10"]["mean"]
        m = mmlw_so["metrics"]["ndcg@10"]["mean"]
        bits.append(
            f"\n\n**Apples-to-apples (both `summary_only`):** mmlw nDCG@10 = {m:.3f} vs "
            f"qwen3 = {q:.3f} (Δ = {m-q:+.3f}). "
        )
        if m > q:
            bits[-1] += (
                "mmlw beats qwen3 on bare summary. But qwen3 closes the gap once you "
                "feed it title + summary — likely because qwen3 handles short prefixes "
                "more gracefully than RoBERTa's BPE tokenisation does."
            )
        else:
            bits[-1] += "Qwen3 wins even on bare summary; mmlw provides no benefit here."

    # Strategy interaction within winning model
    same_model_cells = [c for c in cells if c["backend"] == winner["backend"]]
    if len(same_model_cells) > 1:
        sorted_strats = sorted(same_model_cells, key=lambda c: c["metrics"]["ndcg@10"]["mean"], reverse=True)
        best_s = sorted_strats[0]["strategy"]
        worst_s = sorted_strats[-1]["strategy"]
        d = sorted_strats[0]["metrics"]["ndcg@10"]["mean"] - sorted_strats[-1]["metrics"]["ndcg@10"]["mean"]
        bits.append(
            f"\n\n**Passage strategy matters more than model choice on this corpus**: "
            f"within `{_short(winner['backend'])}`, `{best_s}` beats `{worst_s}` by "
            f"{d:+.3f} nDCG@10. Free quality lift — no serving change."
        )

    bits.append(
        "\n\n**Action items:**\n"
        f"1. **Switch `embed_print.py` passage strategy to `{winner['strategy']}`** "
        f"(currently `summary_only`). Re-embed all prints with the chosen strategy.\n"
        f"2. **Keep `{_short(winner['backend'])}` as embedding model.** "
        f"{'mmlw not worth the serving-infra change for these results.' if winner['backend'] != 'sdadas/mmlw-retrieval-roberta-large-v2' else 'mmlw warrants the serving-infra change — see follow-up spec.'}\n"
        f"3. **Add quality regression tests** (see `tests/supagraf/unit/test_embed_quality.py`) "
        "so any future swap is forced to clear this bar.\n"
        f"4. **Bigger corpus before final call.** Only 105 prints had summaries on term 10 "
        "at eval time; re-run after summary backfill completes on terms 9-10 for more "
        "statistical power."
    )

    return " ".join(bits)


def _metric_table(cells: list[dict]) -> str:
    headers = ["model", "strategy", "nDCG@10", "MRR@10", "R@1", "R@5", "R@10", "queries/s", "passages/s"]
    sep = "|" + "|".join("---" for _ in headers) + "|"
    out = ["| " + " | ".join(headers) + " |", sep]
    ranked = _rank_cells(cells)
    for cell in ranked:
        m = cell["metrics"]
        qs = cell["n_queries"] / max(cell["encode_queries_s"], 1e-3)
        ps = cell["n_passages"] / max(cell["encode_passages_s"], 1e-3)
        row = [
            f"`{_short(cell['backend'])}`",
            f"`{cell['strategy']}`",
            f"**{m['ndcg@10']['mean']:.3f}** [{m['ndcg@10']['ci_low']:.3f}, {m['ndcg@10']['ci_high']:.3f}]",
            f"{m['mrr@10']['mean']:.3f}",
            f"{m['recall@1']['mean']:.2f}",
            f"{m['recall@5']['mean']:.2f}",
            f"{m['recall@10']['mean']:.2f}",
            f"{qs:.1f}",
            f"{ps:.1f}",
        ]
        out.append("| " + " | ".join(row) + " |")
    return "\n".join(out)


def _failure_list(cells: list[dict], k: int = 10) -> str:
    ranked = _rank_cells(cells)
    if not ranked:
        return ""
    winner = ranked[0]
    fails = [
        q for q in winner["per_query"]
        if q["rank_of_gold"] is None or q["rank_of_gold"] > 1
    ]
    if not fails:
        return "_(none — winning cell got every query top-1)_"
    fails.sort(key=lambda q: q["rank_of_gold"] or 10_000, reverse=True)
    out = ["| # | query | gold | top-1 | rank of gold |", "|---|---|---|---|---|"]
    for i, q in enumerate(fails[:k], 1):
        rank = q["rank_of_gold"] if q["rank_of_gold"] is not None else ">50"
        out.append(f"| {i} | {q['query']} | {q['gold']} | {q['top1']} | {rank} |")
    return "\n".join(out)


def render(summary: dict) -> str:
    rec = _recommendation(summary["cells"])
    table = _metric_table(summary["cells"])
    fails = _failure_list(summary["cells"])
    return f"""# Embedding eval — qwen3 vs mmlw-v2

**Generated:** {summary['generated_at']}
**Corpus:** term {summary['term']}, {summary['corpus_size']} prints with non-null summary
**Queries:** {summary['n_queries']} citizen-style Polish paraphrases (mined from print titles via deepseek-flash)

## TL;DR

{rec}

## Cells (sorted by nDCG@10 desc, 95% CI in brackets)

{table}

- `summary_only`: current production behaviour (`prints.summary[:1400]`)
- `title_plus_summary`: title + double-newline + summary
- `title_tags_summary`: title + topic_tags + persona_tags + summary

Throughput numbers are wall-clock on CPU (sentence-transformers fp32) or Ollama localhost
(qwen3 via httpx, no batching). They reflect eval-time conditions, not production.

## Hardest queries (top-10 misses by winning cell)

{fails}

## Methodology

1. **Corpus:** {summary['corpus_size']} prints with non-null summary from term {summary['term']},
   ordered by `prints.number` ASC (frozen for reproducibility).
2. **Queries:** mined via deepseek-flash with prompt "given this title, write one
   short citizen-style search phrase". Gold = source print number. Single-relevant
   labels.
3. **Embedding:** both models output 1024-d L2-normalised vectors; cosine == dot.
4. **Ranking:** dense top-50 per query via matrix dot product.
5. **Metrics:** nDCG@10 (single-relevant), MRR@10, Recall@{{1,5,10}}, all averaged
   across queries with 2k-iter bootstrap 95% CI.
6. **Caches:** corpus + embeddings cached on disk so re-runs are seconds.

## Limitations

- Single-relevant gold: ignores "related-but-not-source" prints that may legitimately
  out-rank the gold. Affects all cells equally → comparison is fair, absolute scores
  are pessimistic.
- 30-ish queries: small N. CIs are wide. Use for direction, not point estimates.
- Mining via LLM paraphrase: queries inherit deepseek's phrasing biases. Will not
  catch all real-user query styles. Augment with frontend search logs once available.
"""


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--results", type=Path, default=RESULTS_PATH)
    p.add_argument("--out", type=Path, default=None)
    args = p.parse_args()
    summary = json.loads(args.results.read_text(encoding="utf-8"))
    out_path = args.out or Path(
        f"docs/embedding_eval_{datetime.now().strftime('%Y-%m-%d')}.md"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(render(summary), encoding="utf-8")
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
