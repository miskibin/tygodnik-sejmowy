"""Committees roster: ~40 details per run (cheap), write only changes.

Sub-committees appear only as codes inside `subCommittees[]`; the loader
stub-extends them, so they are not fetched as first-class rows.
"""
from __future__ import annotations

import re

from loguru import logger

from supagraf.schema.committees import Committee
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._diff import upsert_changed
from supagraf.sync.stage import SyncResult, read_payloads

RESOURCE = "committees"
TABLE = "_stage_committees"
# `code` is interpolated into URLs — reject anything non-canonical so a
# poisoned listing cannot redirect requests.
CODE_RE = re.compile(r"^[A-Z0-9]{2,20}$")


def committee_codes(ctx: SyncContext) -> list[str]:
    listing = ctx.api.get_json(f"{ctx.base()}/committees")
    if not isinstance(listing, list):
        raise RuntimeError("committees list is not a list")
    codes: list[str] = []
    for entry in listing:
        code = (entry or {}).get("code")
        if not code:
            continue
        if not CODE_RE.match(code):
            logger.warning("skip suspicious committee code {!r}", code)
            continue
        codes.append(code)
    return codes


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(RESOURCE)
    base = ctx.base()
    codes = committee_codes(ctx)
    res.listed = len(codes)
    stored = read_payloads(TABLE, ctx.term)
    fetched = ctx.api.map(lambda c: ctx.api.get_json(f"{base}/committees/{c}"), codes, label="committees")
    res.fetched = len(fetched)
    items = []
    for code, detail, exc in fetched:
        if exc is not None:
            res.errors.append((code, repr(exc)[:300]))
            continue
        items.append((code, detail, ctx.api.url(f"{base}/committees/{code}")))
    upsert_changed(ctx, res, table=TABLE, model=Committee, items=items, stored=stored)
    ctx.mark(RESOURCE, res.dirty)
    return res
