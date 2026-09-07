"""Shared fakes for the sync tests: a MockTransport-backed SejmApi and an
in-memory stand-in for `supagraf.sync.stage` / `cursors` / `etl.watermark`.
Resources reach those through the module objects, so one patch per module
covers every resource."""
from __future__ import annotations

from datetime import date
from typing import Any

import httpx
import pytest

from supagraf.etl import watermark
from supagraf.sync import cursors, stage
from supagraf.sync.context import SyncContext
from supagraf.sync.http import SejmApi


class Routes:
    """path (without query) → JSON payload | text | callable(request) → Response."""

    def __init__(self) -> None:
        self.table: dict[str, Any] = {}
        self.calls: list[str] = []

    def add(self, path: str, payload: Any, *, headers: dict | None = None, status: int = 200) -> None:
        self.table[path] = (payload, headers or {}, status)

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(str(request.url))
        if request.url.path not in self.table:
            return httpx.Response(404, text="")
        payload, headers, status = self.table[request.url.path]
        if callable(payload):
            return payload(request)
        if isinstance(payload, str):
            return httpx.Response(status, text=payload, headers=headers)
        return httpx.Response(status, json=payload, headers=headers)

    def count(self, substring: str) -> int:
        return sum(1 for c in self.calls if substring in c)


@pytest.fixture
def routes() -> Routes:
    return Routes()


@pytest.fixture
def api(routes: Routes) -> SejmApi:
    a = SejmApi(concurrency=4, attempts=3, transport=httpx.MockTransport(routes.handler))
    yield a
    a.close()


@pytest.fixture
def ctx(api: SejmApi) -> SyncContext:
    return SyncContext(term=10, api=api, today=date(2026, 9, 7))


class FakeStage:
    """In-memory `_stage_*`: {table: {key: payload}}, written rows, cursors, seals."""

    def __init__(self) -> None:
        self.tables: dict[str, dict[str, Any]] = {}
        self.written: list[tuple[str, dict]] = []
        self.cursors: dict[str, str] = {}
        self.sealed: dict[str, set[str]] = {}

    def seed(self, table: str, rows: dict[str, Any]) -> None:
        self.tables.setdefault(table, {}).update(rows)

    def read_index(self, table, term, *, json_key=None, key_col="natural_id"):
        return {k: (p.get(json_key) if json_key and isinstance(p, dict) else None)
                for k, p in self.tables.get(table, {}).items()}

    def read_payloads(self, table, term, ids=None, *, key_col="natural_id"):
        t = self.tables.get(table, {})
        return dict(t) if ids is None else {i: t[i] for i in ids if i in t}

    def upsert_rows(self, table, rows, *, on_conflict="term,natural_id", errors, batch_size=25):
        t = self.tables.setdefault(table, {})
        for r in rows:
            t[str(r.get("natural_id") or r.get("eli_id") or r.get("number"))] = r["payload"]
            self.written.append((table, r))
        return len(rows)


@pytest.fixture
def fake_stage(monkeypatch) -> FakeStage:
    fs = FakeStage()
    for name in ("read_index", "read_payloads", "upsert_rows"):
        monkeypatch.setattr(stage, name, getattr(fs, name))
    monkeypatch.setattr(cursors, "get_cursor", lambda n: fs.cursors.get(n))
    monkeypatch.setattr(cursors, "set_cursor", lambda n, v: fs.cursors.__setitem__(n, v))
    monkeypatch.setattr(watermark, "load_sealed", lambda entity: fs.sealed.get(entity, set()))
    monkeypatch.setattr(watermark, "bulk_seal", lambda entity, keys, source: fs.sealed.setdefault(entity, set()).update(keys))
    monkeypatch.setattr(watermark, "seal", lambda entity, key, source="predicate": fs.sealed.setdefault(entity, set()).add(key))
    return fs
