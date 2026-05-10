"""Stage proceedings (sittings + days + statements with optional HTML body)."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

from loguru import logger
from postgrest.exceptions import APIError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from supagraf.db import supabase
from supagraf.fixtures.storage import fixtures_root
from supagraf.schema.proceedings import ProceedingDayIn, ProceedingIn
from supagraf.stage.agenda_parser import parse_agenda
from supagraf.stage.base import StageReport

REPO_ROOT = Path(__file__).resolve().parents[2]
BATCH_SIZE = 1  # JSONB payload per proceeding can hit ~3 MB once HTML bodies
                # are present (Phase H); PostgREST anon timeout is 8 s, so
                # batching even 5 such payloads triggers Postgres 57014.

_WS = re.compile(r"\s+")


def _relpath(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


class _PlainTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head"):
            self._skip_depth += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head") and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data):
        if self._skip_depth == 0:
            self._parts.append(data)

    def text(self) -> str:
        return _WS.sub(" ", " ".join(self._parts)).strip()


def _html_to_text(html: str) -> str:
    p = _PlainTextExtractor()
    p.feed(html)
    p.close()
    return p.text()


def _build_payload(proc_path: Path, fixtures: Path) -> dict:
    raw = json.loads(proc_path.read_text(encoding="utf-8"))
    proc = ProceedingIn.model_validate(raw)
    days_payload: list[dict] = []
    for day_path in sorted(fixtures.glob(f"{proc.number}__*__transcripts.json")):
        d_raw = json.loads(day_path.read_text(encoding="utf-8"))
        day = ProceedingDayIn.model_validate(d_raw)
        date_str = day.date.isoformat()
        statements_dir = fixtures / f"{proc.number}__{date_str}__statements"
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
            html_path = statements_dir / f"{s.num}.html"
            if html_path.exists():
                html_raw = html_path.read_text(encoding="utf-8")
                stmt["body_html"] = html_raw
                stmt["body_text"] = _html_to_text(html_raw)
            stmts.append(stmt)
        days_payload.append({
            "date": date_str,
            "source_path": _relpath(day_path),
            "statements": stmts,
        })
    agenda_items = [
        {
            "ord": ai.ord,
            "title": ai.title,
            "raw_html": ai.raw_html,
            "process_refs": ai.process_refs,
            "print_refs": ai.print_refs,
        }
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


@retry(
    retry=retry_if_exception_type(APIError),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
def _upsert_with_retry(client, batch: list[dict]):
    return client.table("_stage_proceedings").upsert(batch, on_conflict="term,number").execute()


def stage_proceedings(term: int = 10, fixtures_dir: Path | None = None) -> StageReport:
    fixtures = fixtures_dir or (fixtures_root() / "sejm" / "proceedings")
    captured = datetime.now(timezone.utc).isoformat()
    client = supabase()
    seen = 0
    upserted = 0
    errors: list[tuple[str, str]] = []
    batch: list[dict] = []

    for proc_path in sorted(fixtures.glob("*.json")):
        if proc_path.name.startswith("_"):
            continue
        if "__" in proc_path.name:
            continue
        seen += 1
        try:
            payload = _build_payload(proc_path, fixtures)
        except Exception as e:
            errors.append((str(proc_path), repr(e)))
            continue
        batch.append({
            "term": term,
            "number": payload["number"],
            "payload": payload,
            "source_path": _relpath(proc_path),
            "captured_at": captured,
        })
        if len(batch) >= BATCH_SIZE:
            try:
                r = _upsert_with_retry(client, batch)
                upserted += len(r.data or [])
            except Exception as e:
                errors.append((f"batch[{len(batch)}]", repr(e)))
            batch = []

    if batch:
        try:
            r = _upsert_with_retry(client, batch)
            upserted += len(r.data or [])
        except Exception as e:
            errors.append((f"batch[{len(batch)}]", repr(e)))

    logger.info("stage proceedings: seen={}, upserted={}, errors={}", seen, upserted, len(errors))
    return StageReport("proceedings", seen, upserted, errors)


def stage(term: int = 10) -> StageReport:
    return stage_proceedings(term=term)
