"""Backfill links between prints and real committee sittings."""
from __future__ import annotations

import html
import re
import time
from typing import Iterable

from loguru import logger

from supagraf.db import supabase

# Agenda strings carry variants like:
#   "druki nr 2459, 2461 oraz 2461-A"
#   "z druku nr 3112"
# We accept nominative + common inflected "druku".
_AGENDA_DRUK_RE = re.compile(
    r"druk(?:i|u)?\s+nr\s+([0-9A-Za-z\-/,\s]+?)(?=[\)\.\;:]|$)",
    re.IGNORECASE,
)
_NUMBER_TOKEN_RE = re.compile(r"\b(\d+(?:[-/][A-Za-z0-9]+)?)\b")


def _chunked(items: list[dict], size: int = 500) -> Iterable[list[dict]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _fetch_all(
    table: str,
    select: str,
    *,
    eq: dict | None = None,
    not_is: dict | None = None,
    page_size: int = 1000,
) -> list[dict]:
    client = supabase()
    out: list[dict] = []
    start = 0
    while True:
        q = client.table(table).select(select)
        if eq:
            for k, v in eq.items():
                q = q.eq(k, v)
        if not_is:
            for k, v in not_is.items():
                q = q.not_.is_(k, v)
        rows = _execute_with_retry(lambda: q.range(start, start + page_size - 1).execute().data or [])
        if not rows:
            break
        out.extend(rows)
        if len(rows) < page_size:
            break
        start += page_size
    return out


def _is_transient_postgrest_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return (
        "503" in msg
        or "502" in msg
        or "504" in msg
        or "service temporarily unavailable" in msg
    )


def _execute_with_retry(fn, attempts: int = 4):
    last: Exception | None = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as exc:  # PostgREST APIError shape is not stable here.
            last = exc
            if not _is_transient_postgrest_error(exc) or i == attempts - 1:
                raise
            time.sleep(1.0 * (i + 1))
    if last:
        raise last
    raise RuntimeError("unreachable")


def _extract_agenda_print_numbers(agenda_html: str | None) -> list[str]:
    """Extract druk numbers mentioned in committee agenda HTML."""
    if not agenda_html:
        return []
    text = html.unescape(re.sub(r"<[^>]+>", " ", agenda_html))
    out: list[str] = []
    for m in _AGENDA_DRUK_RE.finditer(text):
        chunk = m.group(1)
        for token in _NUMBER_TOKEN_RE.findall(chunk):
            if token not in out:
                out.append(token)
    return out


def backfill_print_committee_sitting_links(*, term: int = 10, dry_run: bool = False) -> dict[str, int]:
    """Populate print_committee_sitting_links from committee_sittings.agenda_html.

    Matching strategy:
      1) Parse each agenda for "druk nr ..." references.
      2) Resolve tokens against prints(term, number).
      3) Upsert one link per (print_id, sitting_id, source='agenda_regex').
    """
    client = supabase()

    prints = _fetch_all("prints", "id,term,number", eq={"term": term})
    print_by_key = {(p["term"], p["number"]): p["id"] for p in prints}

    sittings = _fetch_all(
        "committee_sittings",
        "id,term,agenda_html",
        eq={"term": term},
        not_is={"agenda_html": "null"},
    )

    existing = _fetch_all(
        "print_committee_sitting_links",
        "print_id,sitting_id,source",
    )
    existing_keys = {(r["print_id"], r["sitting_id"], r["source"]) for r in existing}

    dedup: dict[tuple[int, int, str], dict] = {}
    matched_tokens = 0
    unmatched_tokens = 0
    for s in sittings:
        nums = _extract_agenda_print_numbers(s.get("agenda_html"))
        for num in nums:
            print_id = print_by_key.get((term, num))
            if print_id is None:
                unmatched_tokens += 1
                continue
            matched_tokens += 1
            key = (print_id, s["id"], "agenda_regex")
            dedup[key] = {
                "print_id": print_id,
                "sitting_id": s["id"],
                "source": "agenda_regex",
                "confidence": 0.85,
                "matched_print_number": num,
            }

    rows = list(dedup.values())
    new_keys = [k for k in dedup.keys() if k not in existing_keys]
    if not dry_run and rows:
        for batch in _chunked(rows, 500):
            _execute_with_retry(
                lambda: client.table("print_committee_sitting_links").upsert(
                    batch,
                    on_conflict="print_id,sitting_id,source",
                ).execute()
            )

    logger.info(
        "committee_sitting_links term={} sittings={} candidates={} new={} "
        "matched_tokens={} unmatched_tokens={}",
        term, len(sittings), len(rows), len(new_keys), matched_tokens, unmatched_tokens,
    )

    return {
        "inserted": 0 if dry_run else len(new_keys),
        "updated": 0,
        "skipped": len(rows) - len(new_keys),
        "candidates": len(rows),
        "sittings_scanned": len(sittings),
        "matched_tokens": matched_tokens,
        "unmatched_tokens": unmatched_tokens,
    }

