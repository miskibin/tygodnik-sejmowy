"""Committees roster: ~40 details per run, write only changes.

Sub-committees appear only as codes inside `subCommittees[]`; the loader
stub-extends them, so they are not fetched as first-class rows.
"""
from __future__ import annotations

import re

from loguru import logger

from supagraf.schema.committees import Committee
from supagraf.sync import stage
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._common import fetch_details, upsert_changed
from supagraf.sync.stage import SyncResult

TABLE = "_stage_committees"
# `code` is interpolated into URLs — reject anything non-canonical.
CODE_RE = re.compile(r"^[A-Z0-9]{2,20}$")


def committee_codes(ctx: SyncContext) -> list[str]:
    codes = [c.get("code") for c in ctx.api.get_json(f"{ctx.base}/committees") or []]
    bad = [c for c in codes if not (c and CODE_RE.match(c))]
    if bad:
        logger.warning("skip suspicious committee codes {!r}", bad)
    return [c for c in codes if c and CODE_RE.match(c)]


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(resource="committees")
    codes = committee_codes(ctx)
    res.listed = len(codes)
    items = fetch_details(ctx, res, codes, lambda c: f"{ctx.base}/committees/{c}")
    upsert_changed(ctx, res, table=TABLE, model=Committee, items=items,
                   stored=stage.read_payloads(TABLE, ctx.term))
    ctx.mark("committees", res.dirty)
    return res
