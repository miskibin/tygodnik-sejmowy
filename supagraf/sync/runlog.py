"""Run ledger: one `etl_runs` row per daily, per-step timings and counters.

Every phase of the updater runs inside `ledger.step(name)`. A step records
its counters (`step.counts[...] = n`), its duration and — if it raised —
the error, without aborting the run unless `fatal=True`. At the end
`finish()` stamps the row and the CLI exits non-zero if any step failed,
so cron/Portainer notice instead of the old always-zero "daily complete".

The table (migration 0105) is required: `ensure_schema()` refuses to run
against a DB that lacks it rather than silently losing the audit trail.
"""
from __future__ import annotations

import os
import platform
import subprocess
import time
import traceback
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterator

from loguru import logger
from postgrest.exceptions import APIError

from supagraf.db import supabase

MISSING_SCHEMA_HINT = (
    "etl_runs / etl_cursors are missing — apply supabase/migrations/0105_etl_runs_cursors.sql "
    "(see docs/updater.md, 'Applying the migration')."
)


class SchemaMissing(RuntimeError):
    pass


@dataclass
class StepResult:
    name: str
    status: str = "running"          # running | ok | failed | skipped
    started_at: float = field(default_factory=time.monotonic)
    duration_s: float = 0.0
    counts: dict[str, Any] = field(default_factory=dict)
    error: str | None = None

    def to_dict(self) -> dict:
        d: dict[str, Any] = {"status": self.status, "duration_s": round(self.duration_s, 2)}
        if self.counts:
            d["counts"] = self.counts
        if self.error:
            d["error"] = self.error
        return d


def _git_sha() -> str | None:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=5,
            cwd=os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        ).stdout.strip() or None
    except Exception:  # noqa: BLE001 — informational only
        return None


def ensure_schema() -> None:
    """Fail fast with a clear message when migration 0105 is not applied."""
    try:
        supabase().table("etl_runs").select("id").limit(1).execute()
        supabase().table("etl_cursors").select("name").limit(1).execute()
    except APIError as e:
        code = getattr(e, "code", "") or ""
        if code in ("PGRST205", "42P01") or "etl_runs" in str(e) or "etl_cursors" in str(e):
            raise SchemaMissing(MISSING_SCHEMA_HINT) from e
        raise


class RunLedger:
    def __init__(self, *, kind: str, term: int, args: dict | None = None, persist: bool = True) -> None:
        self.kind = kind
        self.term = term
        self.args = args or {}
        self.persist = persist
        self.steps: list[StepResult] = []
        self.run_id: int | None = None
        self.started_at = datetime.now(timezone.utc)
        self._t0 = time.monotonic()

    # -- persistence --------------------------------------------------------
    def start(self) -> None:
        if not self.persist:
            return
        try:
            r = supabase().table("etl_runs").insert({
                "kind": self.kind,
                "term": self.term,
                "status": "running",
                "args": self.args,
                "host": platform.node(),
                "git_sha": _git_sha(),
            }).execute()
            self.run_id = int(r.data[0]["id"])
        except Exception as e:  # noqa: BLE001 — ledger must not kill the run
            logger.error("etl_runs insert failed: {!r} (run continues unlogged)", e)

    def finish(self) -> dict:
        status = self.status
        summary = self.summary()
        if self.persist and self.run_id is not None:
            try:
                supabase().table("etl_runs").update({
                    "status": status,
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "steps": {s.name: s.to_dict() for s in self.steps},
                    "errors": [
                        {"step": s.name, "error": s.error} for s in self.steps if s.error
                    ],
                }).eq("id", self.run_id).execute()
            except Exception as e:  # noqa: BLE001
                logger.error("etl_runs finish failed: {!r}", e)
        return summary

    # -- steps ---------------------------------------------------------------
    @contextmanager
    def step(self, name: str, *, fatal: bool = False) -> Iterator[StepResult]:
        s = StepResult(name=name)
        self.steps.append(s)
        logger.info("=== {} ===", name)
        try:
            yield s
        except (KeyboardInterrupt, SystemExit):
            s.status = "failed"
            s.error = "interrupted"
            s.duration_s = time.monotonic() - s.started_at
            raise
        except Exception as e:  # noqa: BLE001 — recorded, run continues
            s.status = "failed"
            s.error = "".join(traceback.format_exception_only(type(e), e)).strip()[:2000]
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
        s = StepResult(name=name, status="skipped")
        s.counts = {"reason": reason}
        self.steps.append(s)
        logger.info("=== {} skipped: {}", name, reason)

    # -- summary -------------------------------------------------------------
    @property
    def failed_steps(self) -> list[StepResult]:
        return [s for s in self.steps if s.status == "failed"]

    @property
    def status(self) -> str:
        if not self.failed_steps:
            return "ok"
        if all(s.status == "failed" for s in self.steps if s.status != "skipped"):
            return "failed"
        return "partial"

    @property
    def exit_code(self) -> int:
        return 0 if not self.failed_steps else 1

    def summary(self) -> dict:
        return {
            "run_id": self.run_id,
            "kind": self.kind,
            "term": self.term,
            "status": self.status,
            "duration_s": round(time.monotonic() - self._t0, 1),
            "steps": {s.name: s.to_dict() for s in self.steps},
        }
