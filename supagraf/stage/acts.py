"""Stage ELI act fixtures -> _stage_acts.

Walks fixtures/sejm/eli/{publisher}/{year}/*.json, validates with ActIn,
upserts to _stage_acts keyed by eli_id (the natural key for acts).

The stage_resource helper in supagraf.stage.base is term-keyed and
not a fit for acts (eli_id is globally unique; many acts pre-date term 10),
so this module rolls its own loop. Same retry/batch ergonomics.
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
from supagraf.schema.acts import ActIn
from supagraf.stage.base import StageReport

REPO_ROOT = Path(__file__).resolve().parents[2]
BATCH_SIZE = 25


def _iter_act_fixtures(publisher: str = "DU") -> Iterable[Path]:
    """Walk fixtures/sejm/eli/{publisher}/*/*.json. Excludes _index.json."""
    base = fixtures_root() / "sejm" / "eli" / publisher
    if not base.exists():
        return
    for year_dir in sorted(base.iterdir()):
        if not year_dir.is_dir():
            continue
        for path in sorted(year_dir.glob("*.json")):
            if path.name.startswith("_"):
                continue
            yield path


@retry(
    retry=retry_if_exception_type(APIError),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
def _upsert_with_retry(client, batch: list[dict]):
    return client.table("_stage_acts").upsert(batch, on_conflict="eli_id").execute()


def _flush(client, batch: list[dict], errors: list) -> int:
    try:
        r = _upsert_with_retry(client, batch)
        return len(r.data or [])
    except Exception as e:
        errors.append((f"batch[{len(batch)}]", repr(e)))
        return 0


def stage(*, term: int = 10, publisher: str = "DU") -> StageReport:
    """Validate and upsert all act fixtures into _stage_acts.

    `term` is accepted for CLI uniformity but unused -- acts are term-agnostic.
    """
    client = supabase()
    captured = datetime.now(timezone.utc).isoformat()
    seen = 0
    upserted = 0
    errors: list[tuple[str, str]] = []
    batch: list[dict] = []

    for path in _iter_act_fixtures(publisher=publisher):
        seen += 1
        try:
            with path.open("r", encoding="utf-8") as f:
                payload = json.load(f)
            obj = ActIn.model_validate(payload)
            eli_id = obj.eli_id
        except Exception as e:  # contract test should have caught any drift
            errors.append((str(path), repr(e)))
            continue

        try:
            rel = str(path.relative_to(REPO_ROOT))
        except ValueError:
            # Path not under REPO_ROOT (e.g. tests using tmp_path) — keep absolute.
            rel = str(path)
        batch.append({
            "eli_id": eli_id,
            "payload": payload,
            "source_path": rel.replace("\\", "/"),
            "captured_at": captured,
        })

        if len(batch) >= BATCH_SIZE:
            upserted += _flush(client, batch, errors)
            batch = []

    if batch:
        upserted += _flush(client, batch, errors)

    logger.info(
        "stage acts: seen={}, upserted={}, errors={}",
        seen, upserted, len(errors),
    )
    return StageReport("acts", seen, upserted, errors)
