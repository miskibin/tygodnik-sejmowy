"""Shared state handed to every resource syncer."""
from __future__ import annotations

from datetime import date, datetime, timezone

from pydantic import BaseModel, ConfigDict, Field

from supagraf.sync.http import SejmApi


class SyncContext(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    term: int
    api: SejmApi
    # Ignore cursors and diffs — refetch every entity of the term.
    full: bool = False
    # Days back that count as "still moving" (proceedings, committee sittings).
    window_days: int = 14
    # Days ahead for scheduled committee sittings.
    horizon_days: int = 30
    captured_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    today: date = Field(default_factory=lambda: datetime.now(timezone.utc).date())
    # Resources whose stage rows changed this run — drives the loader plan.
    dirty: set[str] = Field(default_factory=set)
    # Sitting numbers written per resource, for the per-sitting loaders
    # (proceedings → number, votings → sitting). Empty → whole-term loader.
    changed_keys: dict[str, set[int]] = Field(default_factory=dict)

    @property
    def base(self) -> str:
        return f"/sejm/term{self.term}"

    def mark(self, resource: str, changed: bool, keys: set[int] | None = None) -> None:
        if changed:
            self.dirty.add(resource)
            if keys:
                self.changed_keys.setdefault(resource, set()).update(keys)
