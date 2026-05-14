"""Generic fixture-folder → stage-table upserter.

Reads every JSON fixture under `fixtures/sejm/<resource>/`, validates with the
caller-supplied Pydantic model, and bulk-upserts into `_stage_<resource>` keyed
on `(term, natural_id)`.

Two entry points:
  - `stage_resource()` — legacy: walks fixture files on disk, validates, upserts.
    Used by `python -m supagraf stage <resource>` and ~15 fixture-based tests.
  - `stage_iter()` — streaming: caller feeds `(natural_id, payload, source_path)`
    tuples from an in-memory fetch loop; same validation + upsert. Used by the
    direct-to-DB daily pipeline (cmd_daily phase 1) when
    `SUPAGRAF_DAILY_DIRECT_STAGE=1`.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable, Iterator, Type

from loguru import logger
from postgrest.exceptions import APIError
from pydantic import BaseModel
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from supagraf.db import supabase
from supagraf.fixtures.storage import fixtures_root

REPO_ROOT = Path(__file__).resolve().parents[2]
# Smaller batch for votings (large jsonb payloads); bigger fine for mps/clubs.
BATCH_SIZE = 25
# Streaming-mode default — committees fetch at 1s/req would otherwise wait
# 25 s before flushing. Smaller batch trades a bit of upsert overhead for
# fresher rows in `_stage_*` during long-running daily fetches.
STREAM_BATCH_SIZE = 10


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
def _upsert_with_retry(client, table: str, batch: list[dict], on_conflict: str = "term,natural_id"):
    return client.table(table).upsert(batch, on_conflict=on_conflict).execute()


def _flush(client, table: str, batch: list[dict], errors: list, on_conflict: str = "term,natural_id") -> int:
    try:
        r = _upsert_with_retry(client, table, batch, on_conflict=on_conflict)
        return len(r.data or [])
    except Exception as e:
        errors.append((f"batch[{len(batch)}]", repr(e)))
        return 0


class StreamingStager:
    """Streaming, per-record buffered upserter for direct-to-DB fetch loops.

    Caller pushes one record at a time via `push()`. Records are validated
    against the Pydantic model and accumulated; once the buffer reaches
    `batch_size`, it flushes to Postgres. Call `close()` at the end of the
    fetch loop to flush the tail.

    Exceptions from `push()` are caught + recorded into `report.errors` and
    NEVER re-raised — the durable fixture file is the source of truth, the
    DB write is best-effort during streaming.
    """

    def __init__(
        self,
        *,
        resource: str,
        table: str,
        model: Type[BaseModel],
        on_conflict: str = "term,natural_id",
        batch_size: int = STREAM_BATCH_SIZE,
        term: int = 10,
        captured_at: datetime | None = None,
    ) -> None:
        self._resource = resource
        self._table = table
        self._model = model
        self._on_conflict = on_conflict
        self._batch_size = batch_size
        self._term = term
        self._captured_at = (captured_at or datetime.now(timezone.utc)).isoformat()
        self._client = supabase()
        self._buffer: list[dict] = []
        self.report = StageReport(resource=resource, records_seen=0, records_upserted=0, errors=[])

    @property
    def captured_at_iso(self) -> str:
        return self._captured_at

    def push(self, *, natural_id: str, payload: dict, source_path: str) -> None:
        """Validate + enqueue. Term-keyed shape (most resources)."""
        self._enqueue_termed(natural_id=natural_id, payload=payload, source_path=source_path)

    def push_row(self, row: dict) -> None:
        """Lower-level: caller has already shaped the full row dict (e.g. acts
        with `eli_id` as natural key). Pydantic validation runs on `row['payload']`."""
        self.report.records_seen += 1
        try:
            self._model.model_validate(row.get("payload"))
        except Exception as e:
            self.report.errors.append((row.get("source_path") or "<no-path>", f"schema: {e!r}"))
            return
        self._buffer.append(row)
        if len(self._buffer) >= self._batch_size:
            self._flush()

    def _enqueue_termed(self, *, natural_id: str, payload: dict, source_path: str) -> None:
        self.report.records_seen += 1
        try:
            self._model.model_validate(payload)
        except Exception as e:
            self.report.errors.append((source_path, f"schema: {e!r}"))
            return
        self._buffer.append({
            "term": self._term,
            "natural_id": natural_id,
            "payload": payload,
            "source_path": source_path,
            "captured_at": self._captured_at,
        })
        if len(self._buffer) >= self._batch_size:
            self._flush()

    def _flush(self) -> None:
        if not self._buffer:
            return
        n = _flush(self._client, self._table, self._buffer, self.report.errors, on_conflict=self._on_conflict)
        self.report.records_upserted += n
        self._buffer = []

    def close(self) -> StageReport:
        """Flush any remaining buffered rows and return the final report."""
        self._flush()
        logger.info(
            "stream-stage {}: seen={}, upserted={}, errors={}",
            self._resource,
            self.report.records_seen,
            self.report.records_upserted,
            len(self.report.errors),
        )
        return self.report

    def __enter__(self) -> "StreamingStager":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()


def stage_iter(
    *,
    resource: str,
    table: str,
    model: Type[BaseModel],
    records: Iterable[tuple[str, dict, str]],
    term: int = 10,
    batch_size: int = STREAM_BATCH_SIZE,
    captured_at: datetime | None = None,
) -> StageReport:
    """One-shot streaming upsert from an in-memory iterator.

    Each record is `(natural_id, payload, source_path)`. Term-keyed shape only;
    for acts-style single-key tables, use `StreamingStager.push_row()` directly.
    """
    stager = StreamingStager(
        resource=resource,
        table=table,
        model=model,
        term=term,
        batch_size=batch_size,
        captured_at=captured_at,
    )
    for natural_id, payload, source_path in records:
        stager.push(natural_id=natural_id, payload=payload, source_path=source_path)
    return stager.close()
