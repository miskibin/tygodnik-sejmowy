"""Durable checkpoint for staged resources that still need SQL loading."""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from supagraf.sync import cursors


@dataclass
class PendingLoad:
    dirty: set[str] = field(default_factory=set)
    changed_keys: dict[str, set[int]] = field(default_factory=dict)


def cursor_name(term: int) -> str:
    return f"pending_load.term{term}"


def read_pending(term: int) -> PendingLoad:
    raw = cursors.get_cursor(cursor_name(term))
    if not raw:
        return PendingLoad()
    value = json.loads(raw)
    dirty = {str(name) for name in value.get("dirty", [])}
    keys = {
        str(name): {int(key) for key in items}
        for name, items in value.get("changed_keys", {}).items()
        if name in dirty
    }
    return PendingLoad(dirty=dirty, changed_keys=keys)


def merge_pending(current: PendingLoad, previous: PendingLoad) -> PendingLoad:
    """Merge plans without narrowing a resource whose keys are unknown.

    A dirty resource absent from ``changed_keys`` means a whole-term load.  It
    remains whole-term even if the other plan happens to carry targeted keys.
    """
    dirty = current.dirty | previous.dirty
    keys: dict[str, set[int]] = {}
    for resource in dirty:
        plans = [p for p in (current, previous) if resource in p.dirty]
        if all(p.changed_keys.get(resource) for p in plans):
            keys[resource] = set().union(*(p.changed_keys[resource] for p in plans))
    return PendingLoad(dirty=dirty, changed_keys=keys)


def write_pending(term: int, pending: PendingLoad) -> None:
    cursors.set_cursor(
        cursor_name(term),
        json.dumps(
            {
                "dirty": sorted(pending.dirty),
                "changed_keys": {
                    name: sorted(keys)
                    for name, keys in sorted(pending.changed_keys.items())
                },
            },
            separators=(",", ":"),
        ),
    )


def clear_pending(term: int) -> None:
    write_pending(term, PendingLoad())
