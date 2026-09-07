"""Helpers shared by the resource syncers."""
from __future__ import annotations

from typing import Any, Callable, Iterable

from loguru import logger

from supagraf.sync.context import SyncContext
from supagraf.sync.stage import SyncResult, same_payload, stage_row, upsert_rows, validate


def list_row_matches(list_item: dict, stored: Any) -> bool:
    """True when every key of the list item equals the stored detail payload.

    The Sejm list endpoints for MPs/clubs/committees repeat (a subset of)
    the detail fields, so a list-vs-stored comparison tells us whether a
    detail refetch is worth a request.
    """
    if not isinstance(stored, dict):
        return False
    for k, v in list_item.items():
        if k not in stored or not same_payload(stored[k], v):
            return False
    return True


def upsert_changed(
    ctx: SyncContext,
    res: SyncResult,
    *,
    table: str,
    model,
    items: Iterable[tuple[str, Any, str]],
    stored: dict[str, Any],
    on_conflict: str = "term,natural_id",
    extra: Callable[[str, Any], dict] | None = None,
) -> int:
    """Validate + upsert every (natural_id, payload, url) whose payload differs
    from `stored[natural_id]`. Returns rows written; updates `res`."""
    rows: list[dict] = []
    for nid, payload, url in items:
        if payload is None:
            continue
        if not ctx.full and nid in stored and same_payload(stored[nid], payload):
            res.skipped += 1
            continue
        err = validate(model, payload)
        if err:
            res.errors.append((nid, err))
            logger.warning("{} {}: {}", res.resource, nid, err)
            continue
        row = stage_row(term=ctx.term, natural_id=nid, payload=payload, source_url=url,
                        captured_at=ctx.captured_at)
        if extra:
            row.update(extra(nid, payload))
        rows.append(row)
    res.changed += len(rows)
    n = upsert_rows(table, rows, on_conflict=on_conflict, errors=res.errors)
    res.upserted += n
    return n
