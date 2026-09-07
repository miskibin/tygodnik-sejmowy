"""Shared fakes for the sync tests: an httpx MockTransport-backed SejmApi and
an in-memory stand-in for the `_stage_*` reads/writes."""
from __future__ import annotations

from datetime import date
from typing import Any

import httpx
import pytest

from supagraf.sync import stage as stage_mod
from supagraf.sync.context import SyncContext
from supagraf.sync.http import SejmApi


class Routes:
    """Map of path (without query) → JSON payload | callable(request) → Response."""

    def __init__(self) -> None:
        self.table: dict[str, Any] = {}
        self.calls: list[str] = []

    def add(self, path: str, payload: Any, *, headers: dict | None = None, status: int = 200) -> None:
        self.table[path] = (payload, headers or {}, status)

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        self.calls.append(str(request.url))
        entry = self.table.get(path)
        if entry is None:
            return httpx.Response(404, text="")
        payload, headers, status = entry
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
    """In-memory `_stage_*`: {table: {natural_id: payload}} + written rows."""

    def __init__(self) -> None:
        self.tables: dict[str, dict[str, Any]] = {}
        self.written: list[tuple[str, dict]] = []
        self.cursors: dict[str, str] = {}

    def seed(self, table: str, rows: dict[str, Any]) -> None:
        self.tables.setdefault(table, {}).update(rows)

    # stage.py surface
    def read_index(self, table, term, *, json_key=None, key_col="natural_id"):
        out = {}
        for nid, payload in self.tables.get(table, {}).items():
            out[nid] = (payload.get(json_key) if json_key and isinstance(payload, dict) else None)
        return out

    def read_payloads(self, table, term, *, key_col="natural_id"):
        return dict(self.tables.get(table, {}))

    def read_payloads_for(self, table, term, ids, *, key_col="natural_id", chunk=200):
        t = self.tables.get(table, {})
        return {i: t[i] for i in ids if i in t}

    def read_payload(self, table, term, natural_id, *, key_col="natural_id"):
        return self.tables.get(table, {}).get(str(natural_id))

    def upsert_rows(self, table, rows, *, on_conflict="term,natural_id", batch_size=25, errors=None):
        t = self.tables.setdefault(table, {})
        for r in rows:
            key = r.get("natural_id") or r.get("eli_id") or str(r.get("number"))
            t[str(key)] = r["payload"]
            self.written.append((table, r))
        return len(rows)


@pytest.fixture
def fake_stage(monkeypatch) -> FakeStage:
    fs = FakeStage()
    import importlib
    import pkgutil

    import supagraf.sync.resources as pkg

    targets = [stage_mod]
    for m in pkgutil.iter_modules(pkg.__path__):
        targets.append(importlib.import_module(f"{pkg.__name__}.{m.name}"))
    for mod in targets:
        for name in ("read_index", "read_payloads", "read_payloads_for", "read_payload", "upsert_rows"):
            if hasattr(mod, name):
                monkeypatch.setattr(mod, name, getattr(fs, name))
    # cursors
    from supagraf.sync import cursors as cur_mod

    monkeypatch.setattr(cur_mod, "get_cursor", lambda n: fs.cursors.get(n))
    monkeypatch.setattr(cur_mod, "set_cursor", lambda n, v: fs.cursors.__setitem__(n, v))
    for mod in targets:
        if hasattr(mod, "get_cursor"):
            monkeypatch.setattr(mod, "get_cursor", lambda n: fs.cursors.get(n))
        if hasattr(mod, "set_cursor"):
            monkeypatch.setattr(mod, "set_cursor", lambda n, v: fs.cursors.__setitem__(n, v))
    # watermarks
    from supagraf.etl import watermark as wm

    monkeypatch.setattr(wm, "load_sealed", lambda entity: set())
    monkeypatch.setattr(wm, "bulk_seal", lambda entity, keys, source: len(list(keys)))
    monkeypatch.setattr(wm, "seal", lambda entity, key, source="predicate": None)
    for mod in targets:
        for name in ("load_sealed", "bulk_seal", "seal"):
            if hasattr(mod, name):
                monkeypatch.setattr(mod, name, getattr(wm, name))
    return fs
