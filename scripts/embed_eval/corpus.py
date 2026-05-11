"""Load eval corpus from Supabase.

Single source of truth for the print sample used by the eval. Frozen via
seed + ordered query so runs are reproducible.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from loguru import logger

from supagraf.db import supabase

CORPUS_CACHE = Path("scripts/embed_eval/_cache/corpus.json")
PAGE_SIZE = 1000

PRINT_FIELDS = [
    "number",
    "term",
    "title",
    "short_title",
    "summary",
    "topic_tags",
    "persona_tags",
    "topic",
    "impact_punch",
]


@dataclass(frozen=True)
class PrintRow:
    number: str
    term: int
    title: str
    short_title: str | None
    summary: str
    topic_tags: list[str]
    persona_tags: list[str]
    topic: str | None
    impact_punch: str | None

    def as_dict(self) -> dict:
        return {
            "number": self.number,
            "term": self.term,
            "title": self.title,
            "short_title": self.short_title,
            "summary": self.summary,
            "topic_tags": self.topic_tags,
            "persona_tags": self.persona_tags,
            "topic": self.topic,
            "impact_punch": self.impact_punch,
        }


def _fetch_term(term: int, limit: int) -> list[PrintRow]:
    """Fetch up to `limit` prints from `term`, ordered by number ASC.

    Order matters for reproducibility: the same query yields the same
    sample regardless of when it runs.
    """
    rows: list[PrintRow] = []
    offset = 0
    fields_str = ",".join(PRINT_FIELDS)
    while len(rows) < limit:
        page_size = min(PAGE_SIZE, limit - len(rows))
        r = (
            supabase()
            .table("prints")
            .select(fields_str)
            .eq("term", term)
            .not_.is_("summary", "null")
            .order("number")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = r.data or []
        if not batch:
            break
        for row in batch:
            summary = (row.get("summary") or "").strip()
            if not summary:
                continue
            rows.append(
                PrintRow(
                    number=str(row["number"]),
                    term=row["term"],
                    title=row.get("title") or "",
                    short_title=row.get("short_title"),
                    summary=summary,
                    topic_tags=row.get("topic_tags") or [],
                    persona_tags=row.get("persona_tags") or [],
                    topic=row.get("topic"),
                    impact_punch=row.get("impact_punch"),
                )
            )
        offset += page_size
        if len(batch) < page_size:
            break
    return rows


def load_corpus(term: int = 10, limit: int = 500, use_cache: bool = True) -> list[PrintRow]:
    if use_cache and CORPUS_CACHE.exists():
        logger.info(f"loading corpus from cache {CORPUS_CACHE}")
        data = json.loads(CORPUS_CACHE.read_text(encoding="utf-8"))
        if data.get("term") == term and data.get("limit") == limit:
            return [PrintRow(**r) for r in data["rows"]]
    logger.info(f"fetching corpus from DB term={term} limit={limit}")
    rows = _fetch_term(term, limit)
    CORPUS_CACHE.parent.mkdir(parents=True, exist_ok=True)
    CORPUS_CACHE.write_text(
        json.dumps(
            {"term": term, "limit": limit, "rows": [r.as_dict() for r in rows]},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    logger.info(f"cached {len(rows)} prints to {CORPUS_CACHE}")
    return rows


def iter_print_numbers(rows: Iterable[PrintRow]) -> list[str]:
    return [r.number for r in rows]
