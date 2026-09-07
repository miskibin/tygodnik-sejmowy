"""Plenary sittings: agenda + per-day transcripts + statement bodies.

The compound `_stage_proceedings` payload (see `load_proceeding`, migration
0108) is composed in memory:

  proceeding detail  (agenda_html, dates, current)
  └─ per date ≤ today: transcripts JSON (statement metadata)
     └─ per statement: HTML body — reused from `proceeding_statements`
        when the DB already has it, fetched only for new statements.

Touched proceedings: not yet staged, `current=true`, any sitting date inside
the window, or reported by `proceeding_day_gaps` (a recent day with zero
statements or statements without bodies). A composed payload identical to
the staged one is not rewritten. Upstream has no change signal for
transcripts and an empty `statements[]` means "not published yet".
"""
from __future__ import annotations

from datetime import date, timedelta

from loguru import logger
from pydantic import ValidationError

from supagraf.db import call_rpc_table, supabase
from supagraf.etl import watermark
from supagraf.schema.proceedings import ProceedingDayIn, ProceedingIn
from supagraf.stage.agenda_parser import parse_agenda
from supagraf.stage.proceedings import _html_to_text
from supagraf.sync import stage
from supagraf.sync.context import SyncContext
from supagraf.sync.http import UpstreamError
from supagraf.sync.stage import SyncResult

TABLE = "_stage_proceedings"


def _dates(p: dict) -> list[date]:
    return [date.fromisoformat(str(d)[:10]) for d in p.get("dates") or []]


def in_scope(p: dict, *, stored: set[str], gaps: set[int], today: date, window_days: int, full: bool) -> bool:
    n = p.get("number")
    if not n:  # upstream lists a number=0 placeholder
        return False
    return (full or str(n) not in stored or bool(p.get("current")) or int(n) in gaps
            or any(d >= today - timedelta(days=window_days) for d in _dates(p)))


def db_gaps(term: int) -> set[int]:
    return {int(r["number"]) for r in call_rpc_table("proceeding_day_gaps", {"p_term": term})}


def _day_ids(term: int, number: int) -> dict[str, int]:
    sb = supabase()
    procs = sb.table("proceedings").select("id").eq("term", term).eq("number", number).limit(1).execute().data
    if not procs:
        return {}
    days = sb.table("proceeding_days").select("id, date").eq("proceeding_id", procs[0]["id"]).execute().data
    return {str(d["date"])[:10]: int(d["id"]) for d in days or []}


def _existing_bodies(day_id: int) -> dict[int, tuple[str, str]]:
    """{num: (body_html, body_text)} for statements that already have a body."""
    out: dict[int, tuple[str, str]] = {}
    offset = 0
    while True:
        rows = (supabase().table("proceeding_statements").select("num, body_html, body_text")
                .eq("proceeding_day_id", day_id).not_.is_("body_html", "null")
                .order("num").range(offset, offset + stage.PAGE - 1).execute().data or [])
        out |= {int(r["num"]): (r["body_html"], r["body_text"] or _html_to_text(r["body_html"])) for r in rows}
        if len(rows) < stage.PAGE:
            return out
        offset += stage.PAGE


def _statement(s, bodies: dict[int, tuple[str, str]]) -> dict:
    stmt = {
        "num": s.num, "mp_id": s.member_id, "speaker_name": s.name, "function": s.function,
        "rapporteur": s.rapporteur, "secretary": s.secretary, "unspoken": s.unspoken,
        "start_datetime": s.start_date_time.isoformat() if s.start_date_time else None,
        "end_datetime": s.end_date_time.isoformat() if s.end_date_time else None,
    }
    if s.num in bodies:
        stmt["body_html"], stmt["body_text"] = bodies[s.num]
    return stmt


def compose(ctx: SyncContext, detail: dict, res: SyncResult) -> dict:
    """Build the `_stage_proceedings` payload for one proceeding."""
    proc = ProceedingIn.model_validate(detail)
    day_ids = _day_ids(ctx.term, proc.number)
    days: list[dict] = []
    for d in sorted(proc.dates):
        if d > ctx.today:
            continue
        t_path = f"{ctx.base}/proceedings/{proc.number}/{d.isoformat()}/transcripts"
        t = ctx.api.get_json(t_path)
        if t is None:
            continue
        day = ProceedingDayIn.model_validate(t)
        bodies = _existing_bodies(day_ids[d.isoformat()]) if d.isoformat() in day_ids else {}
        missing = [s.num for s in day.statements if s.num not in bodies]
        for n, html, exc in ctx.api.map(lambda n: ctx.api.get_text(f"{t_path}/{n}"), missing, label="bodies"):
            if exc is not None:
                res.error(f"{proc.number}/{d}/{n}", exc)
            elif html and html.strip():
                bodies[n] = (html, _html_to_text(html))
                res.bump("bodies_fetched")
            else:
                res.bump("bodies_404")
        days.append({"date": d.isoformat(), "source_path": ctx.api.url(t_path),
                     "statements": [_statement(s, bodies) for s in day.statements]})
    return {
        "number": proc.number, "title": proc.title, "current": proc.current,
        "dates": [d.isoformat() for d in proc.dates], "agenda_html": proc.agenda, "days": days,
        "agenda_items": [{"ord": a.ord, "title": a.title, "raw_html": a.raw_html,
                          "process_refs": a.process_refs, "print_refs": a.print_refs}
                         for a in parse_agenda(proc.agenda)],
    }


def _complete(payload: dict) -> bool:
    return bool(payload["days"]) and all("body_html" in s for day in payload["days"] for s in day["statements"])


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(resource="proceedings")
    listing = ctx.api.get_json(f"{ctx.base}/proceedings") or []
    res.listed = len(listing)
    stored = set(stage.read_index(TABLE, ctx.term, key_col="number"))
    gaps = set() if ctx.full else db_gaps(ctx.term)
    scope = [p for p in listing if in_scope(p, stored=stored, gaps=gaps, today=ctx.today,
                                            window_days=ctx.window_days, full=ctx.full)]
    res.skipped = res.listed - len(scope)
    res.notes["db_gaps"], res.notes["touched"] = sorted(gaps), [p["number"] for p in scope]
    sealed = watermark.load_sealed("proceeding_body")
    written: set[int] = set()
    for p in scope:
        number = int(p["number"])
        try:
            detail = ctx.api.get_json(f"{ctx.base}/proceedings/{number}")
            res.fetched += 1
            payload = compose(ctx, detail, res)
        except (UpstreamError, ValidationError, KeyError, TypeError) as e:
            logger.error("proceeding {} failed: {!r}", number, e)
            res.error(str(number), e)
            continue
        previous = stage.read_payloads(TABLE, ctx.term, [str(number)], key_col="number").get(str(number))
        if previous is not None and stage.same_payload(previous, payload):
            continue
        res.changed += 1
        row = {"term": ctx.term, "number": number, "payload": payload,
               "source_path": ctx.api.url(f"{ctx.base}/proceedings/{number}"), "captured_at": ctx.captured_at}
        if stage.upsert_rows(TABLE, [row], on_conflict="term,number", errors=res.errors):
            res.upserted += 1
            written.add(number)
        key = f"term{ctx.term}__proc{number}"
        frozen = all(d < ctx.today - timedelta(days=ctx.window_days) for d in _dates(p))
        if not payload["current"] and frozen and key not in sealed and _complete(payload):
            watermark.seal("proceeding_body", key, source="predicate_all_bodies_present")
    res.notes["written"] = sorted(written)
    ctx.mark("proceedings", res.dirty, written)
    return res
