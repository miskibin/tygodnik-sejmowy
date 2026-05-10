"""Generic fixture-folder → stage-table upserter.

Reads every JSON fixture under `fixtures/sejm/<resource>/`, validates with the
caller-supplied Pydantic model, and bulk-upserts into `_stage_<resource>` keyed
on `(term, natural_id)`.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable, Type

from loguru import logger
from postgrest.exceptions import APIError
from pydantic import BaseModel
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from supagraf.db import supabase
from supagraf.fixtures.storage import fixtures_root

REPO_ROOT = Path(__file__).resolve().parents[2]
# Smaller batch for votings (large jsonb payloads); bigger fine for mps/clubs.
BATCH_SIZE = 25


@dataclass
class StageReport:
    resource: str
    records_seen: int
    records_upserted: int
    errors: list[tuple[str, str]]

    def ok(self) -> bool:
        return not self.errors and self.records_seen == self.records_upserted


def _iter_fixture_files(resource: str, subdir: str = "sejm") -> Iterable[Path]:
    base = fixtures_root() / subdir / resource
    for path in sorted(base.glob("*.json")):
        if path.name.startswith("_"):
            continue
        if "voting_stats" in path.name:
            continue
        yield path


def stage_resource(
    *,
    resource: str,
    table: str,
    model: Type[BaseModel],
    natural_id: Callable[[BaseModel, Path], str],
    term: int = 10,
    captured_at: datetime | None = None,
    subdir: str = "sejm",
) -> StageReport:
    """Read fixture files, Pydantic-validate, upsert to `_stage_<table>`.

    `natural_id` derives the per-row natural key (text), e.g. mp_id as str
    or '{sitting}__{voting_number}' for votings.
    """
    client = supabase()
    captured = (captured_at or datetime.now(timezone.utc)).isoformat()
    seen = 0
    upserted = 0
    errors: list[tuple[str, str]] = []
    batch: list[dict] = []

    for path in _iter_fixture_files(resource, subdir=subdir):
        seen += 1
        try:
            with path.open("r", encoding="utf-8") as f:
                payload = json.load(f)
            obj = model.model_validate(payload)
            nid = natural_id(obj, path)
        except Exception as e:  # contract test should have caught this
            errors.append((str(path), repr(e)))
            continue

        batch.append({
            "term": term,
            "natural_id": nid,
            "payload": payload,
            "source_path": str(path.relative_to(REPO_ROOT)).replace("\\", "/"),
            "captured_at": captured,
        })

        if len(batch) >= BATCH_SIZE:
            upserted += _flush(client, table, batch, errors)
            batch = []

    if batch:
        upserted += _flush(client, table, batch, errors)

    logger.info(
        "stage {}: seen={}, upserted={}, errors={}",
        resource, seen, upserted, len(errors),
    )
    return StageReport(resource, seen, upserted, errors)


@retry(
    retry=retry_if_exception_type(APIError),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
def _upsert_with_retry(client, table: str, batch: list[dict]):
    return client.table(table).upsert(batch, on_conflict="term,natural_id").execute()


def _flush(client, table: str, batch: list[dict], errors: list) -> int:
    try:
        r = _upsert_with_retry(client, table, batch)
        return len(r.data or [])
    except Exception as e:
        errors.append((f"batch[{len(batch)}]", repr(e)))
        return 0
