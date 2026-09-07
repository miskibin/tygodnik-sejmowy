"""`_stage_*` access for the updater: contract validation, batched upserts,
and the cheap reads that drive client-side change detection.

Stage rows keep the exact upstream JSON (`payload`) plus provenance:
`source_path` carries the upstream URL and `captured_at` the fetch time.
Resources call these through the module (`stage.read_payloads(...)`) so
tests patch exactly one place.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from loguru import logger
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field, ValidationError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from supagraf.db import DB_RETRY_EXC, supabase

PAGE = 1000
BATCH = 25


class SyncResult(BaseModel):
    resource: str
    listed: int = 0        # items seen in the upstream index/list
    fetched: int = 0       # detail requests actually made
    changed: int = 0       # rows that differed from what the stage held
    upserted: int = 0      # rows written
    skipped: int = 0       # unchanged / sealed / filtered out
    errors: list[tuple[str, str]] = Field(default_factory=list)
    notes: dict[str, Any] = Field(default_factory=dict)

    @property
    def dirty(self) -> bool:
        return self.upserted > 0

    def error(self, key: str, exc: BaseException | str) -> None:
        self.errors.append((key, str(exc)[:300]))

    def bump(self, key: str, n: int = 1) -> None:
        self.notes[key] = self.notes.get(key, 0) + n

    def to_counts(self) -> dict:
        d = self.model_dump(exclude={"resource", "errors", "notes"})
        d["errors"] = len(self.errors)
        d.update(self.notes)
        if self.errors:
            d["error_sample"] = self.errors[:5]
        return d


def canonical_json(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def same_payload(a: Any, b: Any) -> bool:
    return canonical_json(a) == canonical_json(b)


def validate(model: type[BaseModel], payload: Any) -> str | None:
    """Error text when payload violates the contract, else None."""
    try:
        model.model_validate(payload)
    except ValidationError as e:
        return f"schema: {e}"[:500]
    return None


@retry(retry=retry_if_exception_type(DB_RETRY_EXC), stop=stop_after_attempt(4),
       wait=wait_exponential(multiplier=1, min=1, max=10), reraise=True)
def _upsert(table: str, batch: list[dict], on_conflict: str) -> int:
    return len(supabase().table(table).upsert(batch, on_conflict=on_conflict).execute().data or [])


def upsert_rows(table: str, rows: list[dict], *, on_conflict: str = "term,natural_id",
                errors: list[tuple[str, str]], batch_size: int = BATCH) -> int:
    """Batched upsert with retry; a failed batch is recorded in `errors`."""
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            total += _upsert(table, batch, on_conflict)
        except APIError as e:
            logger.error("upsert {} batch[{}]: {}", table, len(batch), e)
            errors.append((table, f"upsert batch[{len(batch)}]: {e}"[:300]))
    return total


def stage_row(*, term: int, natural_id: str, payload: Any, source_url: str, captured_at: str) -> dict:
    return {"term": term, "natural_id": natural_id, "payload": payload,
            "source_path": source_url, "captured_at": captured_at}


def _pages(query_fn):
    offset = 0
    while True:
        rows = query_fn().range(offset, offset + PAGE - 1).execute().data or []
        yield from rows
        if len(rows) < PAGE:
            return
        offset += PAGE


def read_index(table: str, term: int | None, *, json_key: str | None = None,
               key_col: str = "natural_id") -> dict[str, str | None]:
    """{key: payload->>json_key} for every row (value None when no json_key)."""
    sel = key_col if json_key is None else f"{key_col}, v:payload->>{json_key}"

    def q():
        qq = supabase().table(table).select(sel).order(key_col)
        return qq.eq("term", term) if term is not None else qq

    return {str(r[key_col]): r.get("v") if json_key else None for r in _pages(q)}


def read_payloads(table: str, term: int | None, ids: list[str] | None = None, *,
                  key_col: str = "natural_id") -> dict[str, Any]:
    """{key: payload} for the whole table (small resources) or for `ids` only."""
    def q(chunk: list[str] | None = None):
        qq = supabase().table(table).select(f"{key_col}, payload").order(key_col)
        if term is not None:
            qq = qq.eq("term", term)
        return qq.in_(key_col, chunk) if chunk is not None else qq

    if ids is None:
        return {str(r[key_col]): r["payload"] for r in _pages(q)}
    out: dict[str, Any] = {}
    ids = sorted(set(ids))
    for i in range(0, len(ids), 200):
        out.update({str(r[key_col]): r["payload"] for r in _pages(lambda c=ids[i:i + 200]: q(c))})
    return out


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
