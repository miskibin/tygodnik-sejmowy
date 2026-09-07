"""MPs: list → detail only for MPs whose list row disagrees with the stage."""
from __future__ import annotations

from supagraf.schema.mps import MP
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._diff import list_row_matches, upsert_changed
from supagraf.sync.stage import SyncResult, read_payloads

RESOURCE = "mps"
TABLE = "_stage_mps"


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(RESOURCE)
    base = ctx.base()
    listing = ctx.api.get_json(f"{base}/MP")
    if not isinstance(listing, list):
        raise RuntimeError("MP list is not a list")
    res.listed = len(listing)
    stored = read_payloads(TABLE, ctx.term)

    todo: list[dict] = []
    for item in listing:
        mp_id = item.get("id")
        if mp_id is None:
            continue
        nid = str(mp_id)
        if ctx.full or nid not in stored or not list_row_matches(item, stored[nid]):
            todo.append(item)
        else:
            res.skipped += 1

    def _detail(item: dict):
        return ctx.api.get_json(f"{base}/MP/{item['id']}")

    fetched = ctx.api.map(_detail, todo, label="mps")
    res.fetched = len(fetched)
    items = []
    for item, detail, exc in fetched:
        if exc is not None:
            res.errors.append((str(item["id"]), repr(exc)[:300]))
            continue
        items.append((str(item["id"]), detail, ctx.api.url(f"{base}/MP/{item['id']}")))
    upsert_changed(ctx, res, table=TABLE, model=MP, items=items, stored=stored)
    ctx.mark(RESOURCE, res.dirty)
    return res
