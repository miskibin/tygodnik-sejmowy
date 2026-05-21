"""Unit tests for supagraf.etl.watermark.

Tests run against an in-memory fake of the PostgREST client (no DB).
The fake mirrors only the surface the helper uses: table(...).select/upsert/
range/eq/order/execute. It records every query for assertions.

Verifies:
  - load_sealed paginates 1000-row chunks until short read
  - load_sealed caches per-process per-entity (second call zero queries)
  - is_sealed returns True/False per cached set
  - seal upserts via PostgREST and adds to cache
  - bulk_seal chunks at 500 per call, returns total written
  - cache is keyed per entity (one entity's seal doesn't poison another's cache)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pytest


# ----------------------------- fake PostgREST -----------------------------

@dataclass
class FakeExecuteResult:
    data: list[dict] | None


@dataclass
class FakeQuery:
    """Records every chained call. Executes against a fake row list."""
    rows: list[dict]
    upserted: list[list[dict]]
    eq_filter: dict[str, Any] = field(default_factory=dict)
    range_filter: tuple[int, int] | None = None
    mode: str = "select"
    upsert_payload: list[dict] | None = None

    def select(self, *_args, **_kw) -> "FakeQuery":
        self.mode = "select"
        return self

    def upsert(self, payload, on_conflict=None) -> "FakeQuery":
        self.mode = "upsert"
        self.upsert_payload = payload if isinstance(payload, list) else [payload]
        return self

    def eq(self, col, val) -> "FakeQuery":
        self.eq_filter[col] = val
        return self

    def order(self, *_args, **_kw) -> "FakeQuery":
        return self

    def range(self, start, end) -> "FakeQuery":
        self.range_filter = (start, end)
        return self

    def execute(self) -> FakeExecuteResult:
        if self.mode == "upsert":
            assert self.upsert_payload is not None
            self.upserted.append(self.upsert_payload)
            return FakeExecuteResult(data=self.upsert_payload)
        # select path
        filtered = self.rows
        for c, v in self.eq_filter.items():
            filtered = [r for r in filtered if r.get(c) == v]
        if self.range_filter is not None:
            lo, hi = self.range_filter
            filtered = filtered[lo:hi + 1]
        return FakeExecuteResult(data=filtered)


class FakeClient:
    """Mimics supabase().table(name)."""

    def __init__(self) -> None:
        self.tables: dict[str, list[dict]] = {"etl_watermarks": []}
        self.upserts: list[list[dict]] = []
        self.query_count = 0

    def seed(self, entity: str, keys: list[str], source: str = "test") -> None:
        for k in keys:
            self.tables["etl_watermarks"].append(
                {"entity": entity, "key": k, "source": source}
            )

    def table(self, name: str) -> FakeQuery:
        self.query_count += 1
        return FakeQuery(rows=self.tables[name], upserted=self.upserts)


@pytest.fixture
def fake_client(monkeypatch):
    from supagraf.etl import watermark

    client = FakeClient()
    monkeypatch.setattr(watermark, "supabase", lambda: client)
    # Reset module-level cache between tests.
    watermark._SEALED_CACHE.clear()
    return client


# --------------------------------- tests ---------------------------------

def test_load_sealed_returns_keys_for_entity(fake_client):
    from supagraf.etl import watermark

    fake_client.seed("voting", ["term10__28__1", "term10__28__2"])
    fake_client.seed("act", ["DU__2025__100"])

    out = watermark.load_sealed("voting")
    assert out == {"term10__28__1", "term10__28__2"}


def test_load_sealed_paginates_when_more_than_one_page(fake_client):
    from supagraf.etl import watermark

    keys = [f"term10__1__{i}" for i in range(2500)]
    fake_client.seed("voting", keys)

    fake_client.query_count = 0
    out = watermark.load_sealed("voting")
    assert out == set(keys)
    # 2500 rows / 1000 per page = 3 pages (1000, 1000, 500); short read stops.
    assert fake_client.query_count == 3


def test_load_sealed_caches_per_entity(fake_client):
    from supagraf.etl import watermark

    fake_client.seed("voting", ["term10__1__1"])
    watermark.load_sealed("voting")
    fake_client.query_count = 0
    watermark.load_sealed("voting")
    assert fake_client.query_count == 0


def test_load_sealed_cache_isolated_between_entities(fake_client):
    from supagraf.etl import watermark

    fake_client.seed("voting", ["v1"])
    fake_client.seed("act", ["a1"])
    assert watermark.load_sealed("voting") == {"v1"}
    assert watermark.load_sealed("act") == {"a1"}


def test_is_sealed_true_when_key_present(fake_client):
    from supagraf.etl import watermark

    fake_client.seed("voting", ["term10__28__1"])
    assert watermark.is_sealed("voting", "term10__28__1") is True


def test_is_sealed_false_when_key_absent(fake_client):
    from supagraf.etl import watermark

    fake_client.seed("voting", ["term10__28__1"])
    assert watermark.is_sealed("voting", "term10__99__1") is False


def test_seal_upserts_and_updates_cache(fake_client):
    from supagraf.etl import watermark

    watermark.load_sealed("voting")  # prime empty cache
    watermark.seal("voting", "term10__28__1", source="predicate_votes_captured")

    assert fake_client.upserts == [
        [{"entity": "voting", "key": "term10__28__1", "source": "predicate_votes_captured"}]
    ]
    assert watermark.is_sealed("voting", "term10__28__1") is True


def test_bulk_seal_chunks_at_500_and_returns_total(fake_client):
    from supagraf.etl import watermark

    keys = [f"term10__1__{i}" for i in range(1250)]
    n = watermark.bulk_seal("voting", keys, source="test_bulk")

    assert n == 1250
    # 1250 / 500 = 3 chunks (500, 500, 250).
    assert [len(chunk) for chunk in fake_client.upserts] == [500, 500, 250]
    # All entries shaped correctly.
    flat = [row for chunk in fake_client.upserts for row in chunk]
    assert all(r["entity"] == "voting" and r["source"] == "test_bulk" for r in flat)


def test_bulk_seal_empty_input_no_calls(fake_client):
    from supagraf.etl import watermark

    n = watermark.bulk_seal("voting", [], source="test_bulk")
    assert n == 0
    assert fake_client.upserts == []
