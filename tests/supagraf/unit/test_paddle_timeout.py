"""Watchdog tests for the per-call paddle deadlock guard.

The real failure mode: ``PaddleOCRVL.predict`` blocks forever on ~1-in-5 PDFs.
We simulate that with ``time.sleep`` + a tight timeout budget and assert the
wrapper raises :class:`PaddleTimeoutError` instead of hanging.
"""
from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from supagraf.enrich import pdf as pdf_mod
from supagraf.enrich.pdf import (
    PaddleTimeoutError,
    _paddle_predict_with_timeout,
)


class _SleepingModel:
    """Mock paddle pipeline. ``predict`` sleeps for ``sleep_s`` then yields one page."""

    def __init__(self, sleep_s: float):
        self.sleep_s = sleep_s
        self.calls = 0

    def predict(self, pdf_path: str):
        self.calls += 1
        time.sleep(self.sleep_s)
        # paddle returns a generator; mimic that
        yield MagicMock(markdown={"markdown_texts": "ok"})


def test_timeout_fires_on_deadlock(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Sleep 10s with a 1s budget — must raise PaddleTimeoutError fast."""
    monkeypatch.setattr(pdf_mod, "PADDLE_TIMEOUT_S", 1.0)
    model = _SleepingModel(sleep_s=10.0)
    pdf_path = tmp_path / "wedged.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 stub")

    started = time.monotonic()
    with pytest.raises(PaddleTimeoutError) as exc_info:
        _paddle_predict_with_timeout(model, pdf_path)
    elapsed = time.monotonic() - started

    # Must abort near the 1s budget, not wait on the 10s sleep.
    assert elapsed < 4.0, f"watchdog blocked {elapsed}s — should be ~1s"
    assert "wedged.pdf" in str(exc_info.value)
    assert "1.0s" in str(exc_info.value) or "1s" in str(exc_info.value)


def test_success_path_returns_results(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """No sleep — must return the list paddle would have produced."""
    monkeypatch.setattr(pdf_mod, "PADDLE_TIMEOUT_S", 5.0)
    model = _SleepingModel(sleep_s=0.0)
    pdf_path = tmp_path / "ok.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 stub")

    results = _paddle_predict_with_timeout(model, pdf_path)
    assert isinstance(results, list)
    assert len(results) == 1
    assert model.calls == 1


def test_fast_call_below_budget_succeeds(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Sleep 0.5s with a 3s budget — must complete normally."""
    monkeypatch.setattr(pdf_mod, "PADDLE_TIMEOUT_S", 3.0)
    model = _SleepingModel(sleep_s=0.5)
    pdf_path = tmp_path / "slow_ok.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 stub")

    started = time.monotonic()
    results = _paddle_predict_with_timeout(model, pdf_path)
    elapsed = time.monotonic() - started

    assert len(results) == 1
    assert 0.4 < elapsed < 2.5, f"unexpected elapsed {elapsed}s"


def test_paddle_timeout_is_caught_by_extract_pdf_fallback(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """End-to-end: PaddleTimeoutError must trigger the pypdf fallback path,
    NOT propagate to the caller. Proves the existing ``except Exception`` block
    in ``extract_pdf`` catches our new error subclass.
    """
    import io

    from pypdf import PdfWriter

    # Build a real one-page blank PDF so pypdf fallback can read it.
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    pdf_path = tmp_path / "in.pdf"
    pdf_path.write_bytes(buf.getvalue())

    # Stub supabase cache: miss + insert noop.
    fake_table = MagicMock()
    fake_table.select.return_value = fake_table
    fake_table.eq.return_value = fake_table
    fake_table.limit.return_value = fake_table
    fake_table.execute.return_value = MagicMock(data=[])
    fake_table.upsert.return_value = fake_table
    fake_client = MagicMock()
    fake_client.table.return_value = fake_table
    monkeypatch.setattr(pdf_mod, "supabase", lambda: fake_client)

    # Backend that always times out.
    class _AlwaysTimeoutBackend:
        def extract(self, p: Path) -> tuple[str, list[int]]:
            raise PaddleTimeoutError(f"simulated deadlock on {p.name}")

    # pypdf on a blank page returns "" → 0 chars → would raise. Patch
    # _extract_pypdf to return non-empty text so the fallback succeeds.
    monkeypatch.setattr(pdf_mod, "_extract_pypdf", lambda _p: ("fallback text", [13]))

    res = pdf_mod.extract_pdf(pdf_path, ocr_backend=_AlwaysTimeoutBackend())
    assert res.model_version == pdf_mod.PYPDF_FALLBACK_VERSION
    assert res.ocr_used is False
    assert res.text == "fallback text"
