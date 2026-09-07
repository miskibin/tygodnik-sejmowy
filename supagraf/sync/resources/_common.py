"""The two steps every detail-based resource shares."""
from __future__ import annotations

from typing import Any, Callable, Iterable

from loguru import logger
from pydantic import BaseModel

from supagraf.sync import stage
from supagraf.sync.context import SyncContext
from supagraf.sync.stage import SyncResult

Item = tuple[str, Any, str]  # (natural_id, payload, source_url)


def list_row_matches(list_item: dict, stored: Any) -> bool:
    """True when every key of a list row equals the stored detail payload —
    the MP list repeats the detail's fields, so this decides whether a
    detail request is worth making."""
    return isinstance(stored, dict) and all(
        k in stored and stage.same_payload(stored[k], v) for k, v in list_item.items()
    )


def fetch_details(ctx: SyncContext, res: SyncResult, ids: Iterable[str],
                  path: Callable[[str], str]) -> list[Item]:
    """GET one detail per id concurrently; 404s and errors are counted, not raised."""
    fetched = ctx.api.map(lambda i: ctx.api.get_json(path(i)), ids, label=res.resource)
    res.fetched = len(fetched)
    items: list[Item] = []
    for i, detail, exc in fetched:
        if exc is not None:
            res.error(i, exc)
        elif detail is None:
            res.bump("gone")
        else:
            items.append((i, detail, ctx.api.url(path(i))))
    return items


def upsert_changed(ctx: SyncContext, res: SyncResult, *, table: str, model: type[BaseModel],
                   items: Iterable[Item], stored: dict[str, Any],
                   on_conflict: str = "term,natural_id",
                   extra: Callable[[str], dict] | None = None) -> set[str]:
    """Validate + upsert every item whose payload differs from `stored`.
    Returns the natural ids written."""
    rows: list[dict] = []
    ids: list[str] = []
    for nid, payload, url in items:
        if not ctx.full and nid in stored and stage.same_payload(stored[nid], payload):
            res.skipped += 1
            continue
        if err := stage.validate(model, payload):
            res.error(nid, err)
            logger.warning("{} {}: {}", res.resource, nid, err)
            continue
        row = stage.stage_row(term=ctx.term, natural_id=nid, payload=payload,
                              source_url=url, captured_at=ctx.captured_at)
        if extra:
            row = {k: v for k, v in (row | extra(nid)).items() if v is not None}
        rows.append(row)
        ids.append(nid)
    res.changed += len(rows)
    n = stage.upsert_rows(table, rows, on_conflict=on_conflict, errors=res.errors)
    res.upserted += n
    return set(ids) if n == len(rows) else set()
