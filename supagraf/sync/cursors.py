"""High-water marks for delta endpoints (`etl_cursors`, migration 0105).

A cursor only advances after the resource sync that used it finished
without errors, so a crash mid-run re-fetches the same window next time
instead of silently skipping it. Values are the upstream's own timestamp
format (`yyyy-MM-ddTHH:mm:ss`, Warsaw local time — the API compares in
that space too).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone, tzinfo

from supagraf.db import supabase

# Overlap subtracted from a stored cursor so clock skew / same-second writes
# on the upstream side cannot drop an item between two runs.
CURSOR_OVERLAP = timedelta(hours=2)
UPSTREAM_TS_FMT = "%Y-%m-%dT%H:%M:%S"


def _warsaw() -> tzinfo:
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo("Europe/Warsaw")
    except Exception:  # noqa: BLE001 — tzdata missing on a minimal image
        return timezone(timedelta(hours=2))


def now_upstream() -> str:
    """Current time in the upstream's local-time timestamp format."""
    return datetime.now(_warsaw()).strftime(UPSTREAM_TS_FMT)


def get_cursor(name: str) -> str | None:
    rows = supabase().table("etl_cursors").select("value").eq("name", name).limit(1).execute().data or []
    return rows[0]["value"] if rows else None


def set_cursor(name: str, value: str) -> None:
    supabase().table("etl_cursors").upsert(
        {"name": name, "value": value, "updated_at": datetime.now(timezone.utc).isoformat()},
        on_conflict="name",
    ).execute()


def since_from_cursor(value: str | None, *, overlap: timedelta = CURSOR_OVERLAP) -> str | None:
    """Cursor string → `since` param with the safety overlap applied."""
    if not value:
        return None
    dt = datetime.strptime(value, UPSTREAM_TS_FMT) - overlap
    return dt.strftime(UPSTREAM_TS_FMT)
