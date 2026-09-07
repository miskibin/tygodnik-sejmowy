"""Enrichment orchestration for the daily updater.

Two entry points, both concurrent (DeepSeek allows 2 500 in-flight flash
requests; Sejm's document backend and our own Supabase are the real limits,
so the default pool is small):

  enrich_pending_prints()      — unified LLM pass over prints missing
                                 `impact_punch` (one call per print).
  enrich_pending_statements()  — flash pass over statements of the most
                                 recent sittings that actually have
                                 un-enriched statements.

Policies that used to live in `cli._run_kind_for_prints`:
  * a print with no usable attachment, a GUID-shaped number, or one that is
    gone upstream is *skipped*, not failed — nothing to retry tomorrow;
  * repeated failures back off: a print that failed >= FAILURE_BACKOFF_MAX
    times inside FAILURE_BACKOFF_DAYS is left alone until the window slides
    (the failure rows are still in `enrichment_failures` for diagnosis);
  * when the Sejm document backend is down, every attachment fetch fails
    after a long hang — after OUTAGE_THRESHOLD such failures in one run the
    remaining prints are left pending instead of burning an hour.
"""
from __future__ import annotations

import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from loguru import logger

from supagraf.db import supabase

DEFAULT_WORKERS = int(os.environ.get("SUPAGRAF_ENRICH_WORKERS", "4"))
OUTAGE_THRESHOLD = int(os.environ.get("SUPAGRAF_FETCH_OUTAGE_THRESHOLD", "8"))
FAILURE_BACKOFF_MAX = int(os.environ.get("SUPAGRAF_ENRICH_FAILURE_BACKOFF_MAX", "3"))
FAILURE_BACKOFF_DAYS = int(os.environ.get("SUPAGRAF_ENRICH_FAILURE_BACKOFF_DAYS", "14"))
# How many sittings back to look for un-enriched statements. The Marshal
# schedules sittings ahead of time, so the highest-numbered proceeding often
# has no transcripts yet.
UTTERANCE_SITTING_LOOKBACK = int(os.environ.get("SUPAGRAF_UTTERANCE_SITTING_LOOKBACK", "3"))

# A handful of `prints.number` values are Lotus/Domino document GUIDs rather
# than Sejm print numbers. api.sejm.gov.pl has no /prints/<guid>/ path.
_GUID_NUMBER_RE = re.compile(r"^[0-9A-Fa-f]{32}$")


@dataclass
class EnrichStats:
    ok: int = 0
    failed: int = 0
    skipped: int = 0
    backoff: int = 0
    aborted: bool = False
    errors: list[tuple[str, str]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "ok": self.ok, "failed": self.failed, "skipped": self.skipped,
            "backoff": self.backoff, "aborted": self.aborted,
            "errors": self.errors[:20],
        }


def resolve_print_document(print_row: dict) -> str | None:
    """Best attachment relpath for a print: .docx (clean text) over .pdf.

    Returns 'sejm/prints/{number}__{filename}' or None when there is nothing
    to read (no document attachment, GUID number).
    """
    number = (print_row.get("number") or "").strip()
    if not number or _GUID_NUMBER_RE.match(number):
        return None
    atts = sorted(print_row.get("attachments") or [], key=lambda a: a.get("ordinal", 0))
    docx_match = pdf_match = None
    for a in atts:
        fn = (a.get("filename") or "").strip()
        if not fn:
            continue
        low = fn.lower()
        if docx_match is None and low.endswith(".docx"):
            docx_match = fn
        elif pdf_match is None and low.endswith(".pdf"):
            pdf_match = fn
    chosen = docx_match or pdf_match
    return f"sejm/prints/{number}__{chosen}" if chosen else None


def pending_prints(term: int, limit: int = 0) -> list[dict]:
    """Prints of `term` that still lack the unified enrichment.

    `impact_punch` is the last column the unified writer sets, so its absence
    is the pending marker (partial index from 0018). SUPAGRAF_LLM_TESTING_FROM_DATE
    narrows the scan to recently changed prints during prompt roll-outs.
    """
    q = (
        supabase().table("prints")
        .select("id, term, number, attachments:print_attachments(filename, ordinal)")
        .eq("term", term)
        .is_("impact_punch", "null")
        .order("change_date", desc=True)
    )
    testing_from = os.environ.get("SUPAGRAF_LLM_TESTING_FROM_DATE")
    if testing_from:
        q = q.gte("change_date", testing_from)
    if limit > 0:
        q = q.limit(limit)
    return q.execute().data or []


def recent_failure_counts(fn_name: str, entity_type: str, days: int = FAILURE_BACKOFF_DAYS) -> dict[str, int]:
    """entity_id → number of failures of `fn_name` within the last `days`."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    counts: dict[str, int] = {}
    page, offset = 1000, 0
    while True:
        rows = (
            supabase().table("enrichment_failures")
            .select("entity_id")
            .eq("fn_name", fn_name)
            .eq("entity_type", entity_type)
            .gte("ts", cutoff)
            .order("id")
            .range(offset, offset + page - 1)
            .execute()
            .data or []
        )
        for r in rows:
            counts[r["entity_id"]] = counts.get(r["entity_id"], 0) + 1
        if len(rows) < page:
            break
        offset += page
    return counts


class _Outage:
    """Shared 'upstream is down' switch for the worker pool."""

    def __init__(self, threshold: int):
        self.threshold = threshold
        self._n = 0
        self._lock = threading.Lock()
        self.tripped = False

    def record_fetch_failure(self) -> None:
        with self._lock:
            self._n += 1
            if self._n >= self.threshold:
                self.tripped = True

    def record_success(self) -> None:
        with self._lock:
            self._n = 0


def _classify_print_error(e: Exception) -> str:
    """'skipped' for inherent-to-source conditions, 'failed' otherwise."""
    from supagraf.enrich.pdf_fetch import PrintGoneError

    msg = str(e)
    if isinstance(e, PrintGoneError):
        return "skipped"
    if "0 chars" in msg or "scanned PDF" in msg or "no .pdf attachment" in msg or "empty extracted text" in msg:
        return "skipped"
    return "failed"


def _enrich_one_print(row: dict, outage: _Outage, stats: EnrichStats, lock: threading.Lock) -> None:
    from supagraf.enrich.pdf_fetch import PdfFetchError, PrintGoneError
    from supagraf.enrich.print_unified import enrich_print_unified

    number = row["number"]
    if outage.tripped:
        return
    relpath = resolve_print_document(row)
    if relpath is None:
        logger.warning("print {} has no document attachment — skipping", number)
        with lock:
            stats.skipped += 1
        return
    try:
        enrich_print_unified(
            entity_type="print", entity_id=number, pdf_relpath=relpath,
            term=int(row.get("term", 10)),
        )
    except Exception as e:  # noqa: BLE001 — recorded, loop continues
        if isinstance(e, PdfFetchError) and not isinstance(e, PrintGoneError):
            outage.record_fetch_failure()
        kind = _classify_print_error(e)
        with lock:
            if kind == "skipped":
                stats.skipped += 1
                logger.warning("print {} skipped ({}): {}", number, type(e).__name__, str(e)[:200])
            else:
                stats.failed += 1
                stats.errors.append((number, repr(e)[:300]))
                logger.error("print {} failed: {!r}", number, e)
        return
    outage.record_success()
    with lock:
        stats.ok += 1


def enrich_pending_prints(*, term: int = 10, limit: int = 0, workers: int = DEFAULT_WORKERS) -> EnrichStats:
    """Unified LLM enrichment over every pending print, `workers` at a time."""
    stats = EnrichStats()
    rows = pending_prints(term, limit)
    if not rows:
        logger.info("enrich prints: nothing pending (term={})", term)
        return stats
    failures = recent_failure_counts("print_unified", "print")
    todo: list[dict] = []
    for r in rows:
        if failures.get(r["number"], 0) >= FAILURE_BACKOFF_MAX:
            stats.backoff += 1
            continue
        todo.append(r)
    logger.info(
        "enrich prints: {} pending, {} in failure backoff, {} to run (workers={})",
        len(rows), stats.backoff, len(todo), workers,
    )
    outage = _Outage(OUTAGE_THRESHOLD)
    lock = threading.Lock()
    with ThreadPoolExecutor(max_workers=max(1, workers), thread_name_prefix="enrich-print") as pool:
        futures = [pool.submit(_enrich_one_print, r, outage, stats, lock) for r in todo]
        for i, fut in enumerate(as_completed(futures), 1):
            fut.result()  # worker swallows its own errors; this surfaces bugs
            if i % 10 == 0 or i == len(futures):
                logger.info("enrich prints: {}/{} done (ok={} failed={} skipped={})",
                            i, len(futures), stats.ok, stats.failed, stats.skipped)
    if outage.tripped:
        stats.aborted = True
        logger.error(
            "enrich prints: {} consecutive attachment fetch failures — upstream looks down; "
            "remaining prints left pending for the next run", OUTAGE_THRESHOLD,
        )
    return stats


# ---- statements --------------------------------------------------------------


def sittings_with_pending_statements(term: int, lookback: int = UTTERANCE_SITTING_LOOKBACK) -> list[int]:
    """Most recent sitting numbers (newest first) that have un-enriched statements."""
    from supagraf.enrich.utterance_enrich import fetch_pending_statements

    recent = (
        supabase().table("proceedings")
        .select("number")
        .eq("term", term)
        .order("number", desc=True)
        .limit(lookback)
        .execute()
        .data or []
    )
    out: list[int] = []
    for row in recent:
        s = int(row["number"])
        if fetch_pending_statements(term=term, sitting_num=s, limit=1):
            out.append(s)
    return out


def enrich_pending_statements(
    *, term: int = 10, sitting: int | None = None, limit: int = 0,
    workers: int = DEFAULT_WORKERS, llm_model: str | None = None,
) -> EnrichStats:
    """Flash enrichment of statements. Default scope: the newest sitting that
    has pending statements (historical sittings are intentionally not
    backfilled by the daily — thousands of rows)."""
    from supagraf.enrich.llm import _resolve_prompt
    from supagraf.enrich.utterance_enrich import (
        PROMPT_NAME, UTTERANCE_LLM_MODEL, enrich_one_statement, fetch_pending_statements,
    )

    stats = EnrichStats()
    model = llm_model or UTTERANCE_LLM_MODEL
    if sitting is None:
        candidates = sittings_with_pending_statements(term)
        if not candidates:
            logger.info("enrich statements: no recent sitting with pending statements")
            return stats
        sitting = candidates[0]
    pending = fetch_pending_statements(term=term, sitting_num=sitting, limit=limit)
    if not pending:
        logger.info("enrich statements: nothing pending for sitting {}", sitting)
        return stats
    prompt = _resolve_prompt(PROMPT_NAME)
    logger.info("enrich statements: sitting={} pending={} model={} workers={}",
                sitting, len(pending), model, workers)
    lock = threading.Lock()

    def _one(r: dict) -> None:
        sid = str(r["id"])
        try:
            enrich_one_statement(
                entity_type="proceeding_statement", entity_id=sid,
                body_text=r.get("body_text") or "",
                prompt_version=prompt.version, prompt_sha256=prompt.sha256,
                llm_model=model,
            )
        except Exception as e:  # noqa: BLE001
            with lock:
                stats.failed += 1
                stats.errors.append((sid, repr(e)[:300]))
            logger.error("statement {} failed: {!r}", sid, e)
            return
        with lock:
            stats.ok += 1

    with ThreadPoolExecutor(max_workers=max(1, workers), thread_name_prefix="enrich-stmt") as pool:
        futures = [pool.submit(_one, r) for r in pending]
        for i, fut in enumerate(as_completed(futures), 1):
            fut.result()
            if i % 50 == 0 or i == len(futures):
                logger.info("enrich statements: {}/{} (ok={} failed={})", i, len(futures), stats.ok, stats.failed)
    return stats


# ---- embeddings --------------------------------------------------------------


def embed_pending_prints(*, term: int = 10, limit: int = 0) -> EnrichStats:
    """qwen3 embedding for prints that have a summary but no vector yet."""
    from supagraf.enrich.embed_print import embed_print

    stats = EnrichStats()
    q = (supabase().table("prints").select("number").eq("term", term)
         .is_("embedded_at", "null").not_.is_("summary", "null"))
    rows = (q.limit(limit) if limit > 0 else q).execute().data or []
    for r in rows:
        try:
            embed_print(entity_type="print", entity_id=r["number"])
            stats.ok += 1
        except Exception as e:  # noqa: BLE001 — audited by @with_model_run, loop continues
            stats.failed += 1
            stats.errors.append((r["number"], repr(e)[:300]))
            logger.error("embed print {} failed: {!r}", r["number"], e)
    return stats
