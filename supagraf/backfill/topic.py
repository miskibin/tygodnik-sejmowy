"""Atlas A8: keyword-based classifier for prints.topic.

Title-driven (cheap, deterministic, no LLM). Polish words run through
``unaccent`` + ``lower`` so we match `mieszkań`, `Mieszkań`, `mieszkan` alike.
Multi-keyword scoring → max-vote bucket; ties broken by keyword-list order
(deliberate: more specific buckets like `mieszkania` come before generic
`podatki`).

Idempotent: only updates rows where ``topic IS NULL``. To re-classify after
prompt iteration, operator must NULL the column manually.

Bucket assignment is INTENTIONALLY title-only — the print summary is LLM
output and re-classifying via summary would couple two enrichment jobs.
"""
from __future__ import annotations

import re
import unicodedata

from loguru import logger

from supagraf.db import supabase

KEYWORDS: dict[str, tuple[str, ...]] = {
    "mieszkania":     ("mieszkani", "lokum", "nieruchomosc", "czynsz", "lokator", "spoldziel"),
    "zdrowie":        ("zdrow", "lekarz", "szpital", "nfz", "pacjent", " lek ", "leki", "leku", "lekow", "farmac"),
    "energetyka":     ("energi", "prad", "gaz", "paliw", "oze", "wegl", "atom", "ropa", "ropn", "elektrowni"),
    "obrona":         ("obronnos", "wojsk", "armia", "sil zbrojnych", "nato", "ukrain", "weteran", "policj"),
    "rolnictwo":      ("roln", "wies", "gospodarstw", "produkcj", "arimr", "krus", "hodowl", "uprawi", "myslis", "wedkar"),
    "edukacja":       ("szkol", "edukacj", "nauczyciel", " student", "uczel", "przedszkol", "oswiat", "egzamin"),
    "sprawiedliwosc": ("sad ", "sady", "sadu", "sadow", "prokuratur", "kodeks", "karn", "cywiln", "przestepstw", "wiezi", "trybunal", "sedzi"),
    "podatki":        ("podatek", "podatk", "vat", " cit", " pit", "akcyz", "daniny", "danin", "niefiskaln"),
}
TOPIC_ORDER = list(KEYWORDS.keys())  # tie-break order


def _normalize(text: str) -> str:
    """Lowercase + strip Polish diacritics. ``unicodedata.normalize`` produces
    decomposed form; we drop combining marks. Wrapped in spaces so word-boundary
    keyword matching is reliable (single regex per call would be cleaner but
    the keyword tables are tiny so substring is fine).
    """
    nfkd = unicodedata.normalize("NFKD", text)
    no_diacritics = "".join(c for c in nfkd if not unicodedata.combining(c))
    return f" {no_diacritics.lower()} "


def classify(title: str) -> str:
    """Return the best-matching topic for a print title. Falls back to 'inne'."""
    haystack = _normalize(title)
    scores: dict[str, int] = {}
    for topic, keywords in KEYWORDS.items():
        scores[topic] = sum(1 for kw in keywords if kw in haystack)
    best = max(TOPIC_ORDER, key=lambda t: (scores[t], -TOPIC_ORDER.index(t)))
    return best if scores[best] > 0 else "inne"


def backfill_topic(*, term: int = 10, dry_run: bool = False) -> dict[str, int]:
    """Populate prints.topic for rows where it's NULL.

    Returns counts per topic + skipped/updated.
    """
    client = supabase()
    rows = (
        client.table("prints")
        .select("id, number, title")
        .eq("term", term)
        .is_("topic", "null")
        .execute()
        .data
        or []
    )
    counts: dict[str, int] = {t: 0 for t in TOPIC_ORDER}
    counts["_total_seen"] = len(rows)
    counts["_updated"] = 0

    for r in rows:
        topic = classify(r["title"] or "")
        counts[topic] = counts.get(topic, 0) + 1
        if dry_run:
            continue
        # Update one row at a time — 543 prints is small, no need for batch.
        client.table("prints").update({"topic": topic}).eq("id", r["id"]).execute()
        counts["_updated"] += 1

    logger.info("backfill_topic term={} {}", term, counts)
    return counts
