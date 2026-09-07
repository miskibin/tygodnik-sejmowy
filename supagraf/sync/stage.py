"""`_stage_*` access for the updater: contract validation, batched upserts,
and the cheap index reads that drive client-side change detection.

Stage rows keep the exact upstream JSON (`payload`) plus provenance:
`source_path` now carries the upstream URL instead of a fixture path, and
`captured_at` the fetch time. The SQL loaders read nothing else.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Type

from loguru import logger
from postgrest.exceptions import APIError
from pydantic import BaseModel
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from supagraf.db import supabase

PAGE = 1000
BATCH = 25


@dataclass
class SyncResult:
    resource: str
    listed: int = 0        # items seen in the upstream index/list
    fetched: int = 0       # detail requests actually made
    changed: int = 0       # rows that differed from what the stage held
    upserted: int = 0      # rows written
    skipped: int = 0       # unchanged / sealed / filtered out
    errors: list[tuple[str, str]] = field(default_factory=list)
    notes: dict[str, Any] = field(default_factory=dict)

    @property
    def dirty(self) -> bool:
        return self.upserted > 0

    def to_counts(self) -> dict:
        d = {
            "listed": self.listed, "fetched": self.fetched, "changed": self.changed,
            "upserted": self.upserted, "skipped": self.skipped, "errors": len(self.errors),
        }
        d.update(self.notes)
        if self.errors:
            d["error_sample"] = self.errors[:5]
        return d


def canonical_json(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def same_payload(a: Any, b: Any) -> bool:
    return canonical_json(a) == canonical_json(b)


def validate(model: Type[BaseModel] | None, payload: Any) -> str | None:
    """Return an error string when payload violates the contract, else None."""
    if model is None:
        return None
    try:
        model.model_validate(payload)
        return None
    except Exception as e:  # noqa: BLE001 — pydantic ValidationError or worse
        return f"schema: {e!r}"[:500]


@retry(
    retry=retry_if_exception_type(APIError),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
def _upsert(table: str, batch: list[dict], on_conflict: str) -> int:
    r = supabase().table(table).upsert(batch, on_conflict=on_conflict).execute()
    return len(r.data or [])


def upsert_rows(table: str, rows: list[dict], *, on_conflict: str = "term,natural_id",
                batch_size: int = BATCH, errors: list[tuple[str, str]] | None = None) -> int:
    """Batched upsert with retry; a failed batch is recorded, not raised."""
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            total += _upsert(table, batch, on_conflict)
        except Exception as e:  # noqa: BLE001
            msg = f"upsert {table} batch[{len(batch)}]: {e!r}"[:500]
            logger.error(msg)
            if errors is not None:
                errors.append((table, msg))
            else:
                raise
    return total


def stage_row(*, term: int, natural_id: str, payload: Any, source_url: str,
              captured_at: str | None = None) -> dict:
    return {
        "term": term,
        "natural_id": natural_id,
        "payload": payload,
        "source_path": source_url,
        "captured_at": captured_at or datetime.now(timezone.utc).isoformat(),
    }


def read_index(table: str, term: int | None, *, json_key: str | None = None,
               key_col: str = "natural_id") -> dict[str, str | None]:
    """{natural_id: payload->>json_key} for every row of `table` (paginated).

    With `json_key=None` the value is None — callers only need membership.
    """
    sel = key_col if json_key is None else f"{key_col}, v:payload->>{json_key}"
    out: dict[str, str | None] = {}
    offset = 0
    while True:
        q = supabase().table(table).select(sel)
        if term is not None:
            q = q.eq("term", term)
        rows = q.order(key_col).range(offset, offset + PAGE - 1).execute().data or []
        for r in rows:
            out[str(r[key_col])] = r.get("v") if json_key else None
        if len(rows) < PAGE:
            break
        offset += PAGE
    return out


def read_payloads(table: str, term: int | None, *, key_col: str = "natural_id") -> dict[str, Any]:
    """{natural_id: payload} for small resources (mps/clubs/committees/bills)."""
    out: dict[str, Any] = {}
    offset = 0
    while True:
        q = supabase().table(table).select(f"{key_col}, payload")
        if term is not None:
            q = q.eq("term", term)
        rows = q.order(key_col).range(offset, offset + PAGE - 1).execute().data or []
        for r in rows:
            out[str(r[key_col])] = r["payload"]
        if len(rows) < PAGE:
            break
        offset += PAGE
    return out


def read_payloads_for(table: str, term: int | None, ids: list[str], *,
                      key_col: str = "natural_id", chunk: int = 200) -> dict[str, Any]:
    """{natural_id: payload} for the given ids only (IN-list chunks)."""
    out: dict[str, Any] = {}
    ids = sorted(set(ids))
    for i in range(0, len(ids), chunk):
        q = supabase().table(table).select(f"{key_col}, payload").in_(key_col, ids[i:i + chunk])
        if term is not None:
            q = q.eq("term", term)
        for r in q.execute().data or []:
            out[str(r[key_col])] = r["payload"]
    return out


def read_payload(table: str, term: int, natural_id: str, *, key_col: str = "natural_id") -> Any | None:
    rows = (
        supabase().table(table).select("payload")
        .eq("term", term).eq(key_col, natural_id).limit(1).execute().data or []
    )
    return rows[0]["payload"] if rows else None
