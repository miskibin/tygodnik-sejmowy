"""ETL watermark gate — short-circuit fetches for sealed entities.

A "sealed" entity is one we've fully captured and committed to never
re-fetch. Two sources:

  1. Bulk-seal in migration 0099 for terms 1-9 (historical, lifecycle
     frozen at term boundary) plus term-10 historical (proceedings with
     all bodies present, votings with non-zero total_voted, finished
     committee sittings, acts older than 14 days).
  2. Per-entity predicates fired at fetch time for live term 10.

Keys are entity-scoped TEXT — see migration 0099 header for the format
per entity.

The in-process cache (`_SEALED_CACHE`) is loaded once per (process, entity)
and updated synchronously on `seal()` so a fetcher loop that seals as it
goes doesn't re-fetch the same item on a later iteration.
"""
from __future__ import annotations

from typing import Iterable

from supagraf.db import supabase

_SEALED_CACHE: dict[str, set[str]] = {}
_PAGE = 1000
_UPSERT_CHUNK = 500


def load_sealed(entity: str) -> set[str]:
    """Return the set of sealed keys for `entity`, caching per process.

    Paginates 1000 rows at a time (PostgREST hard cap) until a short read.
    """
    cached = _SEALED_CACHE.get(entity)
    if cached is not None:
        return cached

    cli = supabase()
    keys: set[str] = set()
    offset = 0
    while True:
        rows = (
            cli.table("etl_watermarks")
            .select("key")
            .eq("entity", entity)
            .order("key")
            .range(offset, offset + _PAGE - 1)
            .execute()
            .data
            or []
        )
        if not rows:
            break
        keys.update(r["key"] for r in rows)
        if len(rows) < _PAGE:
            break
        offset += len(rows)
    _SEALED_CACHE[entity] = keys
    return keys


def is_sealed(entity: str, key: str) -> bool:
    return key in load_sealed(entity)


def seal(entity: str, key: str, source: str = "predicate") -> None:
    """Upsert a single (entity, key) into etl_watermarks and update the cache."""
    cli = supabase()
    cli.table("etl_watermarks").upsert(
        {"entity": entity, "key": key, "source": source},
        on_conflict="entity,key",
    ).execute()
    load_sealed(entity).add(key)


def bulk_seal(entity: str, keys: Iterable[str], source: str) -> int:
    """Upsert `keys` for `entity` in chunks of 500; returns total written."""
    cli = supabase()
    cache = load_sealed(entity)
    buf: list[dict] = []
    total = 0
    keys_list = list(keys)
    for k in keys_list:
        buf.append({"entity": entity, "key": k, "source": source})
        if len(buf) >= _UPSERT_CHUNK:
            cli.table("etl_watermarks").upsert(buf, on_conflict="entity,key").execute()
            total += len(buf)
            cache.update(row["key"] for row in buf)
            buf = []
    if buf:
        cli.table("etl_watermarks").upsert(buf, on_conflict="entity,key").execute()
        total += len(buf)
        cache.update(row["key"] for row in buf)
    return total
