"""Stage question fixtures -> _stage_questions.

Walks BOTH `fixtures/sejm/interpellations/` (kind='interpellation') AND
`fixtures/sejm/writtenQuestions/` (kind='written') in a single pass. The
schema is identical between the two; `kind` is set per-row from the source
directory and stored on `_stage_questions.kind`.

Files starting with `_` (e.g. `_list.json` indices) are skipped, matching
the existing `_iter_fixture_files` convention. The `__body.html` /
`__reply_*.html` side-files are filtered automatically by the `*.json` glob.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from loguru import logger
from postgrest.exceptions import APIError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from supagraf.db import supabase
from supagraf.fixtures.storage import fixtures_root
from supagraf.schema.questions import Question
from supagraf.stage.base import BATCH_SIZE, REPO_ROOT, StageReport


_KIND_DIRS: tuple[tuple[str, str], ...] = (
    ("interpellations", "interpellation"),
    ("writtenQuestions", "written"),
)


def _iter_question_files() -> Iterable[tuple[Path, str]]:
    base = fixtures_root() / "sejm"
    for subdir, kind in _KIND_DIRS:
        for path in sorted((base / subdir).glob("*.json")):
            if path.name.startswith("_"):
                continue
            if "__" in path.stem:
                # Defensive: __body.html / __reply_*.html are .html, but skip
                # any stray __-prefixed json fixtures too.
                continue
            yield path, kind


@retry(
    retry=retry_if_exception_type(APIError),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
def _upsert_with_retry(client, batch: list[dict]):
    return (
        client.table("_stage_questions")
        .upsert(batch, on_conflict="term,natural_id")
        .execute()
    )


def _flush(client, batch: list[dict], errors: list) -> int:
    try:
        r = _upsert_with_retry(client, batch)
        return len(r.data or [])
    except Exception as e:
        errors.append((f"batch[{len(batch)}]", repr(e)))
        return 0


def stage(term: int = 10, captured_at: datetime | None = None) -> StageReport:
    client = supabase()
    captured = (captured_at or datetime.now(timezone.utc)).isoformat()
    seen = 0
    upserted = 0
    errors: list[tuple[str, str]] = []
    batch: list[dict] = []

    for path, kind in _iter_question_files():
        seen += 1
        try:
            with path.open("r", encoding="utf-8") as f:
                payload = json.load(f)
            obj = Question.model_validate(payload)
            nid = f"{kind}:{obj.num}"
        except Exception as e:
            errors.append((str(path), repr(e)))
            continue

        batch.append({
            "term": term,
            "kind": kind,
            "natural_id": nid,
            "payload": payload,
            "source_path": str(path.relative_to(REPO_ROOT)).replace("\\", "/"),
            "captured_at": captured,
        })

        if len(batch) >= BATCH_SIZE:
            upserted += _flush(client, batch, errors)
            batch = []

    if batch:
        upserted += _flush(client, batch, errors)

    logger.info(
        "stage questions: seen={}, upserted={}, errors={}",
        seen, upserted, len(errors),
    )
    return StageReport("questions", seen, upserted, errors)
