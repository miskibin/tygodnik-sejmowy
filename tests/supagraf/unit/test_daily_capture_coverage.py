"""Which resources the daily's fetch phase actually pulls.

Phase 2 only file-scans fixtures that are already on disk, so anything the
capture phase skips can never reach the DB. For proceedings that failure is
not silent: votings FK into proceedings(term, number), so a sitting we never
captured aborts load_votings — and with it the whole daily.
"""
from __future__ import annotations

import pytest

from supagraf.fixtures.sources import sejm as sejm_src


class _StubClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _StubStager:
    def __init__(self, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def push(self, **kwargs):
        pass


@pytest.fixture
def captured_resources(monkeypatch):
    """Record every capture_* the daily fetch phase calls."""
    called: list[str] = []

    import supagraf.fixtures.client as client_mod
    import supagraf.stage.base as stage_base

    monkeypatch.setattr(client_mod, "SejmClient", lambda **kw: _StubClient())
    monkeypatch.setattr(stage_base, "StreamingStager", _StubStager)

    for name in [n for n in dir(sejm_src) if n.startswith("capture_")]:
        async def _rec(*args, _name=name, **kwargs):
            called.append(_name)
            return []
        monkeypatch.setattr(sejm_src, name, _rec)
    return called


def test_daily_captures_proceedings(captured_resources):
    """Regression: without this the DB never learns about a new sitting, and
    load_votings dies on `Key (term, sitting)=(10, 59) is not present`."""
    from supagraf.cli import _run_direct_stage_captures

    _run_direct_stage_captures(term=10, direct_staged=set())

    assert "capture_proceedings" in captured_resources


def test_daily_captures_the_streaming_resources(captured_resources):
    from supagraf.cli import _run_direct_stage_captures

    direct_staged: set[str] = set()
    _run_direct_stage_captures(term=10, direct_staged=direct_staged)

    for resource in ("mps", "clubs", "prints", "processes", "votings", "bills", "videos"):
        assert f"capture_{resource}" in captured_resources
        assert resource in direct_staged
