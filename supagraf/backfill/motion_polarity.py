"""Re-classify votings.motion_polarity from votings.topic.

The migration 0087 ships a SQL function `classify_motion_polarity()` and a
trigger that auto-tags new rows. This module is the operator escape hatch:
when the regex set is widened (new motion phrasings appear in upstream data),
running this CLI re-tags every row whose current label disagrees with the
updated Python regex. Patterns here MUST stay in sync with the SQL function;
the unit test asserts both classify the same fixtures identically.

Idempotent: only updates rows where the recomputed label differs from the
stored one. Safe to re-run.
"""
from __future__ import annotations

import re

from loguru import logger

from supagraf.db import supabase

# Polarity values mirror the CHECK in migration 0087.
# Order matters: first match wins (mirrors SQL CASE).
PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("reject",    re.compile(r"wniosek o odrzuceni|wniosku o odrzuceni|odrzuceni[ea] (projekt|ustaw)", re.IGNORECASE)),
    ("minority",  re.compile(r"wniosek mniejszo|wnioski mniejszo|wniosku mniejszo", re.IGNORECASE)),
    ("amendment", re.compile(r"^poprawk|^poprawce|^poprawki|^poprawkę", re.IGNORECASE)),
    ("pass",      re.compile(r"całość projekt|całości projekt|głosowanie nad całością|całość ustaw", re.IGNORECASE)),
    ("procedural", re.compile(r"głosowanie kworum|kandydatur|wybór |powołani[ea]|odwołani[ea]|wniosek o przerw|wniosek o uzupełni|porządek dzienn|porządku dzienn|reasumpcj", re.IGNORECASE)),
)


def classify(topic: str | None) -> str | None:
    """Mirror of the SQL classify_motion_polarity. NULL on ambiguous —
    never default to 'pass' (would invent alignment claims).
    """
    if not topic or not topic.strip():
        return None
    for label, pattern in PATTERNS:
        if pattern.search(topic):
            return label
    return None


def backfill_motion_polarity(*, term: int | None = None, dry_run: bool = False) -> dict[str, int]:
    """Re-tag votings whose motion_polarity disagrees with current regex.

    The DB trigger handles fresh inserts; this is for retroactive corrections
    after pattern tweaks. Pass term=None to scan all terms.
    """
    client = supabase()
    query = client.table("votings").select("id, topic, motion_polarity")
    if term is not None:
        query = query.eq("term", term)
    rows = query.limit(50_000).execute().data or []

    counts: dict[str, int] = {label: 0 for label, _ in PATTERNS}
    counts["null"] = 0
    counts["_total_seen"] = len(rows)
    counts["_updated"] = 0
    counts["_unchanged"] = 0

    for r in rows:
        new_label = classify(r.get("topic"))
        bucket = new_label if new_label else "null"
        counts[bucket] = counts.get(bucket, 0) + 1
        if new_label == r.get("motion_polarity"):
            counts["_unchanged"] += 1
            continue
        if dry_run:
            continue
        client.table("votings").update({"motion_polarity": new_label}).eq("id", r["id"]).execute()
        counts["_updated"] += 1

    logger.info("backfill_motion_polarity term={} {}", term, counts)
    return counts
