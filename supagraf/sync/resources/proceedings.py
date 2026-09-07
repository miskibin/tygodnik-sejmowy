"""Plenary sittings: agenda + per-day transcripts + statement bodies.

The compound `_stage_proceedings` payload (see `load_proceedings` in
migration 0091) is composed in memory:

  proceeding detail  (agenda_html, dates, current)
  └─ per date ≤ today: transcripts JSON (statement metadata)
     └─ per statement: HTML body — reused from `proceeding_statements`
        when the DB already has it, fetched only for new statements.

Which proceedings are touched:
  * not yet staged, or `current=true`, or any sitting date inside the
    window — these are still moving (agenda edits, late transcripts);
  * proceedings the DB reports gaps for (`proceeding_day_gaps`, migration
    0105): a sitting day with zero statements (stenogram published days
    later) or statements without bodies, within the last 90 days.
A composed payload identical to the staged one is not rewritten, so a
quiet day costs the list + a few detail/transcript requests and no
`load_proceedings` (which rebuilds every statement of the term).

Upstream has no change signal for transcripts (no changeDate/lastModified
on statements) and an empty `statements[]` means "not published yet",
never "no statements" — the window/gap logic is what handles that.
"""
from __future__ import annotations

from datetime import date, timedelta

from loguru import logger

from supagraf.db import call_rpc_table, supabase
from supagraf.etl.watermark import load_sealed, seal
from supagraf.schema.proceedings import ProceedingDayIn, ProceedingIn
from supagraf.stage.agenda_parser import parse_agenda
from supagraf.stage.proceedings import _html_to_text
from supagraf.sync.context import SyncContext
from supagraf.sync.stage import SyncResult, read_index, read_payload, same_payload, upsert_rows, validate

RESOURCE = "proceedings"
TABLE = "_stage_proceedings"
GAP_MAX_AGE_DAYS = 90


def _parse_dates(p: dict) -> list[date]:
    out = []
    for d in p.get("dates") or []:
        try:
            out.append(date.fromisoformat(str(d)[:10]))
        except ValueError:
            continue
    return out


def in_scope(p: dict, *, stored: set[str], gaps: set[int], today: date, window_days: int, full: bool) -> bool:
    number = p.get("number")
    # `/proceedings` lists a few `number: 0` placeholders (assemblies, no
    # agenda) — never a sitting we can stage.
    if not number:
        return False
    if full or str(number) not in stored or p.get("current") or int(number) in gaps:
        return True
    cutoff = today - timedelta(days=window_days)
    return any(d >= cutoff for d in _parse_dates(p))


def db_gaps(term: int) -> set[int]:
    """Proceeding numbers with a recent day that has no statements or
    statements without bodies (see migration 0105)."""
    rows = call_rpc_table("proceeding_day_gaps", {"p_term": term})
    return {int(r["number"]) for r in rows}


def _day_ids(term: int, number: int) -> dict[str, int]:
    sb = supabase()
    procs = sb.table("proceedings").select("id").eq("term", term).eq("number", number).limit(1).execute().data or []
    if not procs:
        return {}
    days = sb.table("proceeding_days").select("id, date").eq("proceeding_id", procs[0]["id"]).execute().data or []
    return {str(d["date"])[:10]: int(d["id"]) for d in days}


def _existing_bodies(day_id: int) -> dict[int, tuple[str, str]]:
    """{num: (body_html, body_text)} for statements that already have a body."""
    out: dict[int, tuple[str, str]] = {}
    page, offset = 1000, 0
    while True:
        rows = (
            supabase().table("proceeding_statements")
            .select("num, body_html, body_text")
            .eq("proceeding_day_id", day_id)
            .not_.is_("body_html", "null")
            .order("num").range(offset, offset + page - 1)
            .execute().data or []
        )
        for r in rows:
            out[int(r["num"])] = (r["body_html"], r.get("body_text") or _html_to_text(r["body_html"]))
        if len(rows) < page:
            break
        offset += page
    return out


def compose(ctx: SyncContext, detail: dict, res: SyncResult) -> dict:
    """Build the `_stage_proceedings` payload for one proceeding."""
    proc = ProceedingIn.model_validate(detail)
    base = ctx.base()
    day_ids = _day_ids(ctx.term, proc.number)
    days_payload: list[dict] = []
    for d in sorted(proc.dates):
        if d > ctx.today:
            continue
        t_path = f"{base}/proceedings/{proc.number}/{d.isoformat()}/transcripts"
        t = ctx.api.get_json(t_path)
        if not isinstance(t, dict):
            continue
        day = ProceedingDayIn.model_validate(t)
        existing = _existing_bodies(day_ids[d.isoformat()]) if d.isoformat() in day_ids else {}
        missing = [s.num for s in day.statements if s.num not in existing]
        fetched = ctx.api.map(lambda n: ctx.api.get_text(f"{t_path}/{n}"), missing, label="bodies")
        bodies: dict[int, str] = {}
        for n, html, exc in fetched:
            if exc is not None:
                res.errors.append((f"{proc.number}/{d}/{n}", repr(exc)[:200]))
                continue
            if html and html.strip():
                bodies[n] = html
            else:
                res.notes["bodies_404"] = res.notes.get("bodies_404", 0) + 1
        res.notes["bodies_fetched"] = res.notes.get("bodies_fetched", 0) + len(bodies)
        stmts: list[dict] = []
        for s in day.statements:
            stmt: dict = {
                "num": s.num,
                "mp_id": s.member_id,
                "speaker_name": s.name,
                "function": s.function,
                "rapporteur": s.rapporteur,
                "secretary": s.secretary,
                "unspoken": s.unspoken,
                "start_datetime": s.start_date_time.isoformat() if s.start_date_time else None,
                "end_datetime": s.end_date_time.isoformat() if s.end_date_time else None,
            }
            if s.num in existing:
                stmt["body_html"], stmt["body_text"] = existing[s.num]
            elif s.num in bodies:
                stmt["body_html"] = bodies[s.num]
                stmt["body_text"] = _html_to_text(bodies[s.num])
            stmts.append(stmt)
        days_payload.append({
            "date": d.isoformat(),
            "source_path": ctx.api.url(t_path),
            "statements": stmts,
        })
    agenda_items = [
        {"ord": ai.ord, "title": ai.title, "raw_html": ai.raw_html,
         "process_refs": ai.process_refs, "print_refs": ai.print_refs}
        for ai in parse_agenda(proc.agenda)
    ]
    return {
        "number": proc.number,
        "title": proc.title,
        "current": proc.current,
        "dates": [d.isoformat() for d in proc.dates],
        "agenda_html": proc.agenda,
        "days": days_payload,
        "agenda_items": agenda_items,
    }


def _complete(payload: dict) -> bool:
    """Every statement of every day carries a body."""
    return all(
        "body_html" in s
        for day in payload.get("days") or []
        for s in day.get("statements") or []
    ) and bool(payload.get("days"))


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(RESOURCE)
    base = ctx.base()
    listing = ctx.api.get_json(f"{base}/proceedings")
    if not isinstance(listing, list):
        raise RuntimeError("proceedings list is not a list")
    res.listed = len(listing)
    stored = set(read_index(TABLE, ctx.term, key_col="number"))
    gaps = db_gaps(ctx.term) if not ctx.full else set()
    res.notes["db_gaps"] = sorted(gaps)
    scope = [
        p for p in listing
        if in_scope(p, stored=stored, gaps=gaps, today=ctx.today,
                    window_days=ctx.window_days, full=ctx.full)
    ]
    res.skipped = res.listed - len(scope)
    res.notes["touched"] = [p["number"] for p in scope]
    sealed = load_sealed("proceeding_body")

    for p in scope:
        number = int(p["number"])
        try:
            detail = ctx.api.get_json(f"{base}/proceedings/{number}")
            if not isinstance(detail, dict):
                res.errors.append((str(number), "detail missing"))
                continue
            res.fetched += 1
            payload = compose(ctx, detail, res)
            err = validate(None, payload)
            if err:
                res.errors.append((str(number), err))
                continue
            previous = read_payload(TABLE, ctx.term, str(number), key_col="number")
            if previous is not None and same_payload(previous, payload):
                continue
            res.changed += 1
            res.upserted += upsert_rows(
                TABLE,
                [{
                    "term": ctx.term, "number": number, "payload": payload,
                    "source_path": ctx.api.url(f"{base}/proceedings/{number}"),
                    "captured_at": ctx.captured_at,
                }],
                on_conflict="term,number", batch_size=1, errors=res.errors,
            )
            key = f"term{ctx.term}__proc{number}"
            if (
                not payload["current"] and key not in sealed and _complete(payload)
                and all(d < ctx.today - timedelta(days=ctx.window_days) for d in _parse_dates(p))
            ):
                seal("proceeding_body", key, source="predicate_all_bodies_present")
        except Exception as e:  # noqa: BLE001 — one sitting must not sink the rest
            logger.exception("proceeding {} failed: {!r}", number, e)
            res.errors.append((str(number), repr(e)[:300]))
    ctx.mark(RESOURCE, res.dirty)
    return res
