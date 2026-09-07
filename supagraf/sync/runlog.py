"""Run ledger: one `etl_runs` row per daily, per-step timings and counters.

Every phase runs inside `ledger.step(name)`: counters go to `step.counts`,
duration and any exception are recorded, and the run continues unless
`fatal=True`. `finish()` stamps the row; the CLI exits 1 when any step
failed. Migration 0105 is required — `ensure_schema()` refuses to run
against a DB that lacks it rather than losing the audit trail.
"""
from __future__ import annotations

import platform
import subprocess
import time
import traceback
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from loguru import logger
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from supagraf.db import supabase

MISSING_SCHEMA_HINT = (
    "etl_runs / etl_cursors are missing — apply supabase/migrations/0105_etl_runs_cursors.sql "
    "(see docs/updater.md, 'Applying the migrations')."
)


class SchemaMissing(RuntimeError):
    pass


class StepResult(BaseModel):
    name: str
    status: str = "running"          # running | ok | failed | skipped
    started_at: float = Field(default_factory=time.monotonic)
    duration_s: float = 0.0
    counts: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None

    def fail(self, error: str) -> None:
        self.status, self.error = "failed", error[:500]

    def to_dict(self) -> dict:
        d: dict[str, Any] = {"status": self.status, "duration_s": round(self.duration_s, 2)}
        if self.counts:
            d["counts"] = self.counts
        if self.error:
            d["error"] = self.error
        return d


def _git_sha() -> str | None:
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True,
                             timeout=5, cwd=Path(__file__).resolve().parents[2])
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() or None


def ensure_schema() -> None:
    """Fail fast with a clear message when migration 0105 is not applied."""
    try:
        supabase().table("etl_runs").select("id").limit(1).execute()
        supabase().table("etl_cursors").select("name").limit(1).execute()
    except APIError as e:
        if getattr(e, "code", "") in ("PGRST205", "42P01"):
            raise SchemaMissing(MISSING_SCHEMA_HINT) from e
        raise


class RunLedger:
    def __init__(self, *, kind: str, term: int, args: dict | None = None, persist: bool = True) -> None:
        self.kind, self.term, self.args, self.persist = kind, term, args or {}, persist
        self.steps: list[StepResult] = []
        self.run_id: int | None = None
        self._t0 = time.monotonic()

    def start(self) -> None:
        if not self.persist:
            return
        try:
            r = supabase().table("etl_runs").insert({
                "kind": self.kind, "term": self.term, "status": "running", "args": self.args,
                "host": platform.node(), "git_sha": _git_sha(),
            }).execute()
            self.run_id = int(r.data[0]["id"])
        except APIError as e:  # the ledger must not kill the run it documents
            logger.error("etl_runs insert failed: {} (run continues unlogged)", e)

    def finish(self) -> dict:
        if self.persist and self.run_id is not None:
            try:
                supabase().table("etl_runs").update({
                    "status": self.status,
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "steps": self._steps_json(),
                    "errors": [{"step": s.name, "error": s.error} for s in self.steps if s.error],
                }).eq("id", self.run_id).execute()
            except APIError as e:
                logger.error("etl_runs finish failed: {}", e)
        return self.summary()

    def _steps_json(self) -> dict[str, dict]:
        # jsonb re-orders object keys, so each step carries its execution index.
        return {s.name: {**s.to_dict(), "seq": i} for i, s in enumerate(self.steps)}

    @contextmanager
    def step(self, name: str, *, fatal: bool = False) -> Iterator[StepResult]:
        s = StepResult(name=name)
        self.steps.append(s)
        logger.info("=== {} ===", name)
        try:
            yield s
        except Exception as e:  # noqa: BLE001 — the whole point: record, continue
            s.fail("".join(traceback.format_exception_only(type(e), e)).strip())
            s.duration_s = time.monotonic() - s.started_at
            logger.exception("step {} failed: {!r}", name, e)
            if fatal:
                raise
            return
        s.duration_s = time.monotonic() - s.started_at
        if s.status == "running":
            s.status = "ok"
        logger.info("--- {} {} in {:.1f}s {}", name, s.status, s.duration_s, s.counts or "")

    def skip(self, name: str, reason: str) -> None:
        self.steps.append(StepResult(name=name, status="skipped", counts={"reason": reason}))
        logger.info("=== {} skipped: {}", name, reason)

    @property
    def failed_steps(self) -> list[StepResult]:
        return [s for s in self.steps if s.status == "failed"]

    @property
    def status(self) -> str:
        if not self.failed_steps:
            return "ok"
        return "failed" if all(s.status == "failed" for s in self.steps if s.status != "skipped") else "partial"

    @property
    def exit_code(self) -> int:
        return 1 if self.failed_steps else 0

    def summary(self) -> dict:
        return {"run_id": self.run_id, "kind": self.kind, "term": self.term, "status": self.status,
                "duration_s": round(time.monotonic() - self._t0, 1),
                "steps": self._steps_json()}
