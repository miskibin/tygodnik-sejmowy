"""Unit tests for stage_iter / StreamingStager — the streaming, direct-to-DB
path used by `cmd_daily` when `SUPAGRAF_DAILY_DIRECT_STAGE=1`.

Verifies the contract that lets the daily skip the file-scan re-stage:
  1. Each pushed record produces one row with the expected shape.
  2. Schema-drift payloads are recorded as errors and NEVER raised.
  3. Buffer flushes when batch_size is reached AND at close().
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from pydantic import BaseModel

from supagraf.stage.base import StreamingStager, stage_iter


class _DummyModel(BaseModel):
    code: str


def _fake_supabase(captured_batches: list[list[dict]]) -> MagicMock:
    """Build a MagicMock that records every upsert payload."""
    client = MagicMock()

    def capture_upsert(rows, on_conflict=None):  # noqa: ARG001
        captured_batches.append(list(rows))
        m = MagicMock()
        m.execute.return_value.data = list(rows)
        return m

    client.table.return_value.upsert.side_effect = capture_upsert
    return client


def test_stage_iter_happy_path_emits_term_keyed_rows():
    captured: list[list[dict]] = []
    fake = _fake_supabase(captured)
    records = [
        ("ASW", {"code": "ASW", "members": []}, "fixtures/sejm/committees/ASW.json"),
        ("ENM", {"code": "ENM", "members": [{"id": 1}]}, "fixtures/sejm/committees/ENM.json"),
    ]
    with patch("supagraf.stage.base.supabase", return_value=fake):
        report = stage_iter(
            resource="committees",
            table="_stage_committees",
            model=_DummyModel,
            records=iter(records),
            term=10,
            batch_size=10,
        )

    assert report.records_seen == 2
    assert report.records_upserted == 2
    assert report.errors == []
    # Single batch (batch_size=10, only 2 records) → one upsert call.
    assert len(captured) == 1
    rows = captured[0]
    assert {r["natural_id"] for r in rows} == {"ASW", "ENM"}
    asw = next(r for r in rows if r["natural_id"] == "ASW")
    assert asw["term"] == 10
    assert asw["payload"]["code"] == "ASW"
    assert asw["source_path"].endswith("ASW.json")
    assert "captured_at" in asw


def test_streaming_stager_flushes_on_batch_size():
    """batch_size=2 should produce two batches for 4 records (no leftover)."""
    captured: list[list[dict]] = []
    fake = _fake_supabase(captured)
    with patch("supagraf.stage.base.supabase", return_value=fake):
        with StreamingStager(
            resource="committees",
            table="_stage_committees",
            model=_DummyModel,
            term=10,
            batch_size=2,
        ) as stager:
            for i in range(4):
                stager.push(
                    natural_id=f"C{i}",
                    payload={"code": f"C{i}"},
                    source_path=f"fixtures/sejm/committees/C{i}.json",
                )

    # 4 records / batch_size 2 = 2 flushes; close() with empty buffer is a no-op.
    assert len(captured) == 2
    assert sum(len(b) for b in captured) == 4
    assert stager.report.records_upserted == 4


def test_streaming_stager_flushes_tail_on_close():
    """3 records with batch_size=2 should produce one mid-stream flush plus
    one tail flush at close()."""
    captured: list[list[dict]] = []
    fake = _fake_supabase(captured)
    with patch("supagraf.stage.base.supabase", return_value=fake):
        with StreamingStager(
            resource="committees",
            table="_stage_committees",
            model=_DummyModel,
            term=10,
            batch_size=2,
        ) as stager:
            for i in range(3):
                stager.push(
                    natural_id=f"C{i}",
                    payload={"code": f"C{i}"},
                    source_path=f"fixtures/sejm/committees/C{i}.json",
                )

    assert [len(b) for b in captured] == [2, 1]
    assert stager.report.records_upserted == 3


def test_schema_drift_records_error_and_continues():
    """A payload that fails Pydantic validation must be recorded in errors,
    NEVER raised — caller's fetch loop continues."""
    captured: list[list[dict]] = []
    fake = _fake_supabase(captured)
    records = [
        ("ok", {"code": "ASW"}, "fixtures/sejm/committees/ASW.json"),
        ("bad", {"wrong_field": 1}, "fixtures/sejm/committees/BAD.json"),
        ("ok2", {"code": "ENM"}, "fixtures/sejm/committees/ENM.json"),
    ]
    with patch("supagraf.stage.base.supabase", return_value=fake):
        report = stage_iter(
            resource="committees",
            table="_stage_committees",
            model=_DummyModel,
            records=iter(records),
            term=10,
            batch_size=10,
        )

    assert report.records_seen == 3
    assert report.records_upserted == 2  # only the two valid rows
    assert len(report.errors) == 1
    path, msg = report.errors[0]
    assert path.endswith("BAD.json")
    assert "schema" in msg


def test_empty_iterator_produces_empty_report():
    captured: list[list[dict]] = []
    fake = _fake_supabase(captured)
    with patch("supagraf.stage.base.supabase", return_value=fake):
        report = stage_iter(
            resource="committees",
            table="_stage_committees",
            model=_DummyModel,
            records=iter([]),
            term=10,
        )

    assert report.records_seen == 0
    assert report.records_upserted == 0
    assert report.errors == []
    # No flush calls when buffer stays empty.
    assert captured == []
