"""Interpellations + written questions via `modifiedSince` cursors.

Both kinds share `_stage_questions` (`kind` column, natural_id
`{kind}:{num}`). The list items are the full question records; HTML bodies
are not staged (the SQL loader never read them).
"""
from __future__ import annotations

from supagraf.schema.questions import Question
from supagraf.sync.context import SyncContext
from supagraf.sync.cursors import get_cursor, now_upstream, set_cursor, since_from_cursor
from supagraf.sync.resources._diff import upsert_changed
from supagraf.sync.stage import SyncResult, read_payloads_for

RESOURCE = "questions"
TABLE = "_stage_questions"
KINDS = (("interpellations", "interpellation"), ("writtenQuestions", "written"))


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(RESOURCE)
    base = ctx.base()
    started = now_upstream()
    for path, kind in KINDS:
        cname = f"questions.{kind}.term{ctx.term}"
        since = None if ctx.full else since_from_cursor(get_cursor(cname))
        params = {"modifiedSince": since} if since else {}
        listing = ctx.api.paginate(f"{base}/{path}", params, page_size=500)
        res.listed += len(listing)
        res.notes[f"{kind}_since"] = since or "all"
        ids = [f"{kind}:{q['num']}" for q in listing if q.get("num") is not None]
        stored = read_payloads_for(TABLE, ctx.term, ids)
        items = [
            (f"{kind}:{q['num']}", q, ctx.api.url(f"{base}/{path}/{q['num']}"))
            for q in listing if q.get("num") is not None
        ]
        errors_before = len(res.errors)
        upsert_changed(ctx, res, table=TABLE, model=Question, items=items, stored=stored,
                       extra=lambda _nid, _p, k=kind: {"kind": k})
        if len(res.errors) == errors_before:
            set_cursor(cname, started)
    ctx.mark(RESOURCE, res.dirty)
    return res
