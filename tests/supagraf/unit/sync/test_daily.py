"""Orchestration: dirty set → loader plan, skip flags, exit codes. Every
resource sync, loader and enrichment call is stubbed."""
from __future__ import annotations

import pytest

from supagraf.sync import daily
from supagraf.sync.stage import SyncResult


@pytest.fixture
def stubs(monkeypatch):
    calls: dict[str, list] = {"loaders": [], "refresh": [], "resources": []}
    pending = daily.PendingLoad()
    monkeypatch.setattr(daily, "ensure_schema", lambda: None)
    import supagraf.network_publish as network_publish
    monkeypatch.setattr(network_publish, "refresh_network", lambda **kwargs: calls.setdefault("network", []).append(kwargs) or {})

    def fake_resource(name):
        def _sync(ctx):
            calls["resources"].append(name)
            r = SyncResult(resource=name)
            if name == "prints":
                r.upserted = 2
                ctx.mark(name, True)
            if name == "votings":
                r.errors.append(("64__1", "boom"))
            return r
        return _sync

    monkeypatch.setattr(daily, "_resource_fn", fake_resource)
    monkeypatch.setattr(daily, "run_loaders", lambda term, dirty, full=False, changed_keys=None: calls["loaders"].append((sorted(dirty), full)) or {})
    monkeypatch.setattr(daily, "run_refreshes", lambda term, dirty, full=False: calls["refresh"].append((sorted(dirty), full)) or {})

    def read_pending(_term):
        return daily.PendingLoad(set(pending.dirty), {k: set(v) for k, v in pending.changed_keys.items()})

    def write_pending(_term, value):
        pending.dirty = set(value.dirty)
        pending.changed_keys = {k: set(v) for k, v in value.changed_keys.items()}

    monkeypatch.setattr(daily, "read_pending", read_pending)
    monkeypatch.setattr(daily, "write_pending", write_pending)
    monkeypatch.setattr(daily, "clear_pending", lambda _term: write_pending(_term, daily.PendingLoad()))
    calls["pending"] = pending
    import supagraf.backfill.agenda_refs as ar
    monkeypatch.setattr(ar, "relink_agenda_print_refs", lambda term: calls.setdefault("relink", []).append(term))

    import supagraf.fetch.mp_photos as mpp
    import supagraf.fetch.polls as polls
    import supagraf.stage.polls as spolls
    import supagraf.backfill as bf
    import supagraf.fetch.acts as fa

    class _R:
        def to_dict(self):
            return {}

    import supagraf.backfill.mp_club_history as mch
    import supagraf.backfill.sitting_links as sl
    monkeypatch.setattr(sl, "relink_changed_sittings", lambda **kwargs: calls.setdefault("sitting_links", []).append(kwargs) or {})
    import supagraf.db as db

    # Never let the orchestrator reach a real database from a unit test.
    monkeypatch.setattr(db, "call_rpc_scalar", lambda fn, args=None: calls.setdefault("rpc", []).append(fn) or 0)
    monkeypatch.setattr(db, "supabase", lambda: (_ for _ in ()).throw(AssertionError("DB access in unit test")))
    monkeypatch.setattr(mch, "backfill_mp_club_history", lambda term: {"inserted": 0})
    monkeypatch.setattr(mpp, "fetch_mp_photos", lambda term: _R())
    monkeypatch.setattr(polls, "fetch_polls", lambda: "x")
    monkeypatch.setattr(spolls, "stage_polls_from_wikipedia", lambda p: (0, 0))
    monkeypatch.setattr(bf, "backfill_print_committee_sitting_links", lambda term: {"n": 1})
    monkeypatch.setattr(fa, "refresh_stale_eli", lambda term: {"fetched_acts": 0})
    return calls


def test_quiet_run_skips_load_when_nothing_dirty(monkeypatch, stubs):
    monkeypatch.setattr(daily, "_resource_fn", lambda name: (lambda ctx: SyncResult(resource=name)))
    led = daily.run_daily(skip_enrich=True, skip_embed=True, persist_ledger=False)
    assert stubs["loaders"] == []
    assert led.exit_code == 0
    assert any(s.name == "load" and s.status == "skipped" for s in led.steps)


def test_dirty_prints_runs_selective_load_and_relink(stubs):
    led = daily.run_daily(skip_enrich=True, skip_embed=True, persist_ledger=False)
    assert stubs["loaders"] == [(["prints"], False)]
    assert stubs["relink"] == [10]
    assert stubs["sitting_links"][0]["term"] == 10
    assert stubs["refresh"] == [(["prints"], False)]
    # votings sync reported an item error → step failed → exit 1
    assert led.exit_code == 1
    assert {s.name: s.status for s in led.steps}["sync:votings"] == "failed"
    assert "backfill:print_committee_sitting_links" in {s.name for s in led.steps}


def test_skip_fetch_marks_everything_dirty(stubs):
    led = daily.run_daily(skip_fetch=True, skip_enrich=True, skip_embed=True, persist_ledger=False)
    assert stubs["resources"] == []
    (dirty, full), = stubs["loaders"]
    assert "prints" in dirty and "acts" in dirty and not full
    assert led.exit_code == 0
    assert stubs["rpc"] == ["backfill_process_act_links"]


def test_full_runs_every_loader(stubs):
    daily.run_daily(full=True, skip_enrich=True, skip_embed=True, persist_ledger=False)
    assert stubs["loaders"][0][1] is True


def test_failed_full_load_is_retried_as_whole_term(monkeypatch, stubs):
    monkeypatch.setattr(daily, "_resource_fn", lambda name: lambda ctx: SyncResult(resource=name))
    attempts = []

    def flaky_load(term, dirty, full=False, changed_keys=None):
        attempts.append(set(dirty))
        if len(attempts) == 1:
            raise RuntimeError("failed full reload")
        return {}

    monkeypatch.setattr(daily, "run_loaders", flaky_load)
    daily.run_daily(full=True, skip_enrich=True, skip_embed=True, persist_ledger=False)
    daily.run_daily(skip_enrich=True, skip_embed=True, persist_ledger=False)
    assert attempts == [set(daily.RESOURCES) | daily.EXTERNAL] * 2


def test_only_restricts_sync(stubs):
    daily.run_daily(only=("prints",), skip_enrich=True, skip_embed=True, skip_load=True, persist_ledger=False)
    assert stubs["resources"] == ["prints"]


def test_schema_missing_is_fatal(monkeypatch):
    from supagraf.sync.runlog import SchemaMissing

    def boom():
        raise SchemaMissing("apply 0105")

    monkeypatch.setattr(daily, "ensure_schema", boom)
    with pytest.raises(SchemaMissing):
        daily.run_daily(persist_ledger=False)


def test_failed_load_skips_dependent_phases(monkeypatch, stubs):
    def fail_load(*args, **kwargs):
        raise RuntimeError("load broke")

    monkeypatch.setattr(daily, "run_loaders", fail_load)
    monkeypatch.setattr(daily, "_enrich_phase", lambda *args: pytest.fail("enrich ran after failed load"))
    monkeypatch.setattr(daily, "_embed_phase", lambda *args: pytest.fail("embed ran after failed load"))

    led = daily.run_daily(persist_ledger=False)

    steps = {s.name: s for s in led.steps}
    assert steps["load"].status == "failed"
    assert steps["enrich"].status == "skipped" and steps["enrich"].counts["reason"] == "load failed"
    assert steps["embed"].status == "skipped" and steps["embed"].counts["reason"] == "load failed"
    assert steps["refresh"].status == "skipped" and steps["refresh"].counts["reason"] == "load failed"
    assert steps["network"].status == "skipped"
    assert "network" not in stubs
    assert stubs["refresh"] == []
    assert "relink" not in stubs
    assert "sitting_links" not in stubs
    assert stubs.get("rpc", []) == []


def test_failed_load_is_retried_next_run_when_upstream_is_unchanged(monkeypatch, stubs):
    sync_runs = 0
    load_attempts = []

    def resource(name):
        def sync(ctx):
            nonlocal sync_runs
            result = SyncResult(resource=name)
            if name == "prints" and sync_runs == 0:
                result.upserted = 1
                ctx.mark("prints", True)
            if name == daily.RESOURCES[-1]:
                sync_runs += 1
            return result
        return sync

    def flaky_load(term, dirty, full=False, changed_keys=None):
        load_attempts.append((set(dirty), {k: set(v) for k, v in (changed_keys or {}).items()}))
        if len(load_attempts) == 1:
            raise RuntimeError("transient load failure")
        return {}

    monkeypatch.setattr(daily, "_resource_fn", resource)
    monkeypatch.setattr(daily, "run_loaders", flaky_load)

    first = daily.run_daily(skip_enrich=True, skip_embed=True, persist_ledger=False)
    second = daily.run_daily(skip_enrich=True, skip_embed=True, persist_ledger=False)

    assert first.exit_code == 1
    assert load_attempts == [({"prints"}, {}), ({"prints"}, {})]
    assert second.exit_code == 0
    assert stubs["pending"].dirty == set()
