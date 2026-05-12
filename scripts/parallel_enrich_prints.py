"""Parallel runner for print_unified enrichment.

Uses ThreadPoolExecutor since the LLM call dominates wall-clock and Ollama/
deepseek requests are I/O-bound — Python's GIL is released around the
network calls so threads are the right tool here.

Mirrors the pending-query logic from supagraf.cli but with:
  * concurrent execution (default 12 workers)
  * progress reporting every 25 completed prints
  * env-driven date filter (SUPAGRAF_LLM_TESTING_FROM_DATE)
  * env-driven model override (SUPAGRAF_LLM_MODEL_PRO/FLASH)

Usage:
    SUPAGRAF_LLM_MODEL_PRO=deepseek-v4-flash \\
    SUPAGRAF_LLM_TESTING_FROM_DATE=2025-01-01 \\
    .venv/Scripts/python.exe -u -m scripts.parallel_enrich_prints --term 10 --workers 12

CLI flags:
    --term INT         Sejm term (default 10)
    --workers INT      thread pool size (default 12)
    --limit INT        cap prints processed (0 = no cap)
    --kind STR         'unified' (default) or 'embed'
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

from loguru import logger

from supagraf.cli import _pending_query, _resolve_pdf_relpath, _runner_for, EnrichKind


@dataclass
class Result:
    number: str
    status: str  # ok | failed | skipped
    error: str | None = None


def _run_one(kind: EnrichKind, row: dict) -> Result:
    """Mirror of supagraf.cli._run_kind_for_prints inner loop. Returns Result."""
    runner = _runner_for(kind)
    needs_pdf = kind != EnrichKind.embed
    kwargs = {"entity_type": "print", "entity_id": row["number"]}
    if needs_pdf:
        kwargs["term"] = row.get("term", 10)
        rp = _resolve_pdf_relpath(row)
        if rp is None:
            return Result(number=row["number"], status="skipped", error="no .pdf attachment")
        try:
            runner(pdf_relpath=rp, **kwargs)
            return Result(number=row["number"], status="ok")
        except Exception as e:
            msg = str(e)
            if "0 chars" in msg or "scanned PDF" in msg or "no .pdf attachment" in msg:
                return Result(number=row["number"], status="skipped", error=type(e).__name__)
            return Result(number=row["number"], status="failed", error=f"{type(e).__name__}: {msg[:200]}")
    else:
        # embed path — no PDF
        try:
            runner(**kwargs)
            return Result(number=row["number"], status="ok")
        except Exception as e:
            return Result(number=row["number"], status="failed", error=f"{type(e).__name__}: {str(e)[:200]}")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--term", type=int, default=10)
    p.add_argument("--workers", type=int, default=12)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--kind", choices=["unified", "embed"], default="unified")
    args = p.parse_args()

    kind = EnrichKind.unified if args.kind == "unified" else EnrichKind.embed
    logger.info(
        "model_override SUPAGRAF_LLM_MODEL_PRO={} SUPAGRAF_LLM_MODEL_FLASH={} "
        "date_filter SUPAGRAF_LLM_TESTING_FROM_DATE={}",
        os.environ.get("SUPAGRAF_LLM_MODEL_PRO"),
        os.environ.get("SUPAGRAF_LLM_MODEL_FLASH"),
        os.environ.get("SUPAGRAF_LLM_TESTING_FROM_DATE"),
    )
    # PostgREST caps each request at ~1000 rows. Paginate via .range() so we
    # actually fetch all pending prints, not just the first page.
    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        q = _pending_query(kind, args.term)
        if args.limit > 0:
            remaining = args.limit - len(rows)
            if remaining <= 0:
                break
            page_size = min(page_size, remaining)
        q = q.range(offset, offset + page_size - 1)
        batch = q.execute().data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
        if args.limit > 0 and len(rows) >= args.limit:
            break
    n = len(rows)
    if not n:
        logger.info("no pending prints (term={}, kind={})", args.term, args.kind)
        return 0

    logger.info("=== parallel enrich: {} prints, {} workers, kind={} ===", n, args.workers, args.kind)
    t0 = time.time()
    ok = failed = skipped = 0
    failures: list[Result] = []

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(_run_one, kind, row) for row in rows]
        for i, fut in enumerate(as_completed(futures), 1):
            r = fut.result()
            if r.status == "ok":
                ok += 1
            elif r.status == "skipped":
                skipped += 1
            else:
                failed += 1
                failures.append(r)
                logger.warning("[{}/{}] {}: {} — {}", i, n, r.number, r.status, r.error)
            if i % 25 == 0 or i == n:
                elapsed = time.time() - t0
                rate = i / max(elapsed, 1e-3)
                eta_s = (n - i) / max(rate, 1e-3)
                logger.info(
                    "[{}/{}] ok={} failed={} skipped={} | {:.1f}/s ETA {:.0f}s",
                    i, n, ok, failed, skipped, rate, eta_s,
                )

    elapsed = time.time() - t0
    logger.success(
        "DONE in {:.0f}s ({:.2f}/s) | ok={} failed={} skipped={}",
        elapsed, n / max(elapsed, 1e-3), ok, failed, skipped,
    )
    if failures:
        logger.info("failures:")
        for r in failures[:30]:
            logger.info("  {}: {}", r.number, r.error)
    return 0 if failed == 0 else 3


if __name__ == "__main__":
    sys.exit(main())
