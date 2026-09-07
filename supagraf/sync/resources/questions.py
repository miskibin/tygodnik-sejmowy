"""Interpellations + written questions via `modifiedSince` cursors.

Both kinds share `_stage_questions` (`kind` column, natural_id
`{kind}:{num}`). The list items are the full records; HTML bodies are not
staged (no loader reads them).
"""
from __future__ import annotations

from supagraf.schema.questions import Question
from supagraf.sync import cursors, stage
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._common import upsert_changed
from supagraf.sync.stage import SyncResult

TABLE = "_stage_questions"
KINDS = (("interpellations", "interpellation"), ("writtenQuestions", "written"))


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(resource="questions")
    started = cursors.now_upstream()
    for path, kind in KINDS:
        name = f"questions.{kind}.term{ctx.term}"
        since = None if ctx.full else cursors.since_from_cursor(cursors.get_cursor(name))
        res.notes[f"{kind}_since"] = since or "all"
        listing = ctx.api.paginate(f"{ctx.base}/{path}", {"modifiedSince": since} if since else {})
        res.listed += len(listing)
        items = [(f"{kind}:{q['num']}", q, ctx.api.url(f"{ctx.base}/{path}/{q['num']}")) for q in listing]
        errors_before = len(res.errors)
        upsert_changed(ctx, res, table=TABLE, model=Question, items=items,
                       stored=stage.read_payloads(TABLE, ctx.term, [i for i, _, _ in items]),
                       extra=lambda _nid, k=kind: {"kind": k})
        if len(res.errors) == errors_before:
            cursors.set_cursor(name, started)
    ctx.mark("questions", res.dirty)
    return res
