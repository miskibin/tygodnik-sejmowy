from __future__ import annotations

import pytest

from supagraf.sync import cursors
from supagraf.sync.loaders import LOAD_CHAIN, REFRESH_CHAIN, plan
from supagraf.sync.runlog import RunLedger


def test_ledger_records_ok_failed_skipped_and_exit_code():
    led = RunLedger(kind="daily", term=10, persist=False)
    with led.step("a") as s:
        s.counts["n"] = 1
    with led.step("b"):
        raise RuntimeError("nope")
    led.skip("c", "because")
    assert [s.status for s in led.steps] == ["ok", "failed", "skipped"]
    assert led.status == "partial"
    assert led.exit_code == 1
    summ = led.summary()
    assert summ["steps"]["a"]["counts"] == {"n": 1}
    assert "nope" in summ["steps"]["b"]["error"]
    assert [summ["steps"][k]["seq"] for k in ("a", "b", "c")] == [0, 1, 2]


def test_ledger_all_ok_exit_zero_and_fatal_reraises():
    led = RunLedger(kind="daily", term=10, persist=False)
    with led.step("a"):
        pass
    assert led.status == "ok" and led.exit_code == 0
    with pytest.raises(ValueError):
        with led.step("b", fatal=True):
            raise ValueError("x")
    assert led.status == "partial"


def test_ledger_all_failed_is_failed():
    led = RunLedger(kind="daily", term=10, persist=False)
    with led.step("a"):
        raise RuntimeError("x")
    led.skip("s", "r")
    assert led.status == "failed"


def test_since_from_cursor_applies_overlap():
    assert cursors.since_from_cursor(None) is None
    assert cursors.since_from_cursor("2026-09-07T10:00:00") == "2026-09-07T08:00:00"


def test_now_upstream_format():
    v = cursors.now_upstream()
    assert len(v) == 19 and v[10] == "T"


def test_loader_plan_is_selective_and_ordered():
    names = [l.fn for l in plan(LOAD_CHAIN, {"prints"}, full=False)]
    assert names == [
        "load_prints", "load_prints_additional", "load_print_relationships",
        "load_print_attachments", "load_processes", "load_bills",
    ]
    assert plan(LOAD_CHAIN, set(), full=False) == []
    assert [l.fn for l in plan(LOAD_CHAIN, set(), full=True)] == [l.fn for l in LOAD_CHAIN]


def test_loader_plan_fk_order_proceedings_before_votings():
    names = [l.fn for l in plan(LOAD_CHAIN, {"proceedings", "votings", "mps", "clubs"}, full=False)]
    assert names.index("load_clubs") < names.index("load_mps") < names.index("load_proceedings") \
        < names.index("load_votings") < names.index("load_votes")


def test_refresh_plan_quiet_day_is_empty():
    assert plan(REFRESH_CHAIN, {"prints", "bills"}, full=False) == []
    assert {l.fn for l in plan(REFRESH_CHAIN, {"votings"}, full=False)} >= {
        "refresh_mp_discipline", "refresh_atlas_matviews", "refresh_mp_activity",
    }


def test_run_loaders_uses_per_sitting_variants(monkeypatch):
    from supagraf.sync import loaders

    calls: list[tuple[str, dict | None]] = []
    monkeypatch.setattr(loaders, "_rpc_int", lambda fn, term: calls.append((fn, None)) or 1)
    monkeypatch.setattr(loaders, "call_rpc_scalar", lambda fn, args: calls.append((fn, args)) or 2)
    out = loaders.run_loaders(10, {"proceedings", "votings"},
                              changed_keys={"proceedings": {64, 65}, "votings": {64}})
    assert ("load_proceeding", {"p_term": 10, "p_number": 64}) in calls
    assert ("load_proceeding", {"p_term": 10, "p_number": 65}) in calls
    assert ("load_votings_sitting", {"p_term": 10, "p_sitting": 64}) in calls
    assert ("load_votes_sitting", {"p_term": 10, "p_sitting": 64}) in calls
    assert not any(fn in ("load_proceedings", "load_votings", "load_votes") for fn, _ in calls)
    assert out["load_proceedings"] == 4
    # inferred clubs is whole-term (no variant) and still runs for votings
    assert ("load_inferred_clubs", None) in calls


def test_run_loaders_falls_back_to_whole_term_without_keys(monkeypatch):
    from supagraf.sync import loaders

    calls: list[str] = []
    monkeypatch.setattr(loaders, "_rpc_int", lambda fn, term: calls.append(fn) or 0)
    loaders.run_loaders(10, {"proceedings"})
    assert calls == ["load_proceedings"]
    calls.clear()
    # --full always takes the whole-term path
    loaders.run_loaders(10, {"proceedings"}, full=True, changed_keys={"proceedings": {64}})
    assert "load_proceedings" in calls and "load_prints" in calls
