"""Shared state handed to every resource syncer."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone

from supagraf.sync.http import SejmApi


@dataclass
class SyncContext:
    term: int
    api: SejmApi
    # Ignore cursors and diffs — refetch every entity of the term. Slow but
    # the way to repair a stage table after a schema change.
    full: bool = False
    # Days back that count as "still moving" for proceedings, committee
    # sittings and votings. Anything older is only touched when the DB
    # shows a gap (e.g. a sitting day with no transcript yet).
    window_days: int = 14
    # Days ahead for scheduled committee sittings.
    horizon_days: int = 30
    captured_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    today: date = field(default_factory=lambda: datetime.now(timezone.utc).date())
    # Resources whose stage rows changed this run — drives the loader plan.
    dirty: set[str] = field(default_factory=set)

    def base(self) -> str:
        return f"/sejm/term{self.term}"

    def mark(self, resource: str, changed: bool) -> None:
        if changed:
            self.dirty.add(resource)
