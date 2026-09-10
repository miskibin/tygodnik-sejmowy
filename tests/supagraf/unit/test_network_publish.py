from unittest.mock import Mock

import pytest

from supagraf import network, network_publish
from supagraf.sync.context import SyncContext
from supagraf.sync.daily import _network_phase
from supagraf.sync.runlog import RunLedger


def test_failed_build_does_not_touch_previous_snapshot(monkeypatch):
    client = Mock()
    monkeypatch.setattr(network_publish, "supabase", lambda: client)
    monkeypatch.setattr(
        network, "build_network", Mock(side_effect=RuntimeError("incomplete source"))
    )
    with pytest.raises(RuntimeError):
        network_publish.refresh_network()
    client.table.assert_not_called()


def test_success_publishes_one_complete_snapshot(monkeypatch):
    payload = {
        "schema_version": "1",
        "term": 10,
        "generated_at": "2026-09-10T00:00:00Z",
        "nodes": [],
        "layers": {"questions": {"edges": []}, "votes": {"edges": []}},
    }
    client = Mock()
    monkeypatch.setattr(network_publish, "supabase", lambda: client)
    monkeypatch.setattr(network, "build_network", lambda **_: payload)
    network_publish.refresh_network()
    client.table.return_value.upsert.assert_called_once_with(
        {"term": 10, "generated_at": payload["generated_at"], "payload": payload},
        on_conflict="term",
    )
    client.table.return_value.delete.assert_not_called()


@pytest.mark.parametrize("failed", ["sync:questions", "sync:votings", "load"])
def test_incomplete_source_blocks_network_publication(monkeypatch, failed):
    refresh = Mock()
    monkeypatch.setattr(network_publish, "refresh_network", refresh)
    ledger = RunLedger(kind="daily", term=10, persist=False)
    with ledger.step(failed) as step:
        step.fail("source incomplete")
    _network_phase(
        SyncContext.model_construct(term=10, api=Mock()),
        ledger,
        skip_load=False,
        load_succeeded=True,
    )
    refresh.assert_not_called()
    assert ledger.steps[-1].name == "network" and ledger.steps[-1].status == "skipped"


def test_daily_retries_network_without_dirty_sources(monkeypatch):
    refresh = Mock(return_value={"nodes": 0})
    monkeypatch.setattr(network_publish, "refresh_network", refresh)
    ledger = RunLedger(kind="daily", term=10, persist=False)
    _network_phase(
        SyncContext.model_construct(term=10, api=Mock()),
        ledger,
        skip_load=False,
        load_succeeded=True,
    )
    refresh.assert_called_once_with(term=10)
