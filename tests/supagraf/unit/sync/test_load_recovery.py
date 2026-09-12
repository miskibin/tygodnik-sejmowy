from supagraf.sync.load_recovery import PendingLoad, merge_pending


def test_merge_pending_unions_known_target_keys():
    merged = merge_pending(
        PendingLoad({"votings"}, {"votings": {64}}),
        PendingLoad({"votings"}, {"votings": {63}}),
    )
    assert merged.changed_keys == {"votings": {63, 64}}


def test_merge_pending_never_narrows_a_whole_term_retry():
    merged = merge_pending(
        PendingLoad({"votings"}, {"votings": {64}}),
        PendingLoad({"votings"}, {}),
    )
    assert merged.dirty == {"votings"}
    assert merged.changed_keys == {}


def test_empty_key_set_also_means_whole_term():
    merged = merge_pending(
        PendingLoad({"votings"}, {"votings": {64}}),
        PendingLoad({"votings"}, {"votings": set()}),
    )
    assert merged.changed_keys == {}


def test_failed_shared_checkpoint_remains_recoverable_locally(monkeypatch, tmp_path):
    import pytest
    from supagraf.sync import load_recovery as mod
    monkeypatch.setattr(mod, "STATE_DIR", tmp_path)
    def fail(*args):
        raise RuntimeError("503")
    monkeypatch.setattr(mod.cursors, "set_cursor", fail)
    pending = PendingLoad({"prints", "proceedings"}, {"proceedings": {64}})
    with pytest.raises(RuntimeError):
        mod.write_pending(10, pending)
    monkeypatch.setattr(mod.cursors, "get_cursor", lambda name: None)
    assert mod.read_pending(10) == pending
    with pytest.raises(RuntimeError):
        mod.clear_pending(10)
    assert mod.read_pending(10) == pending
    monkeypatch.setattr(mod.cursors, "set_cursor", lambda *args: None)
    mod.clear_pending(10)
    assert mod.read_pending(10) == PendingLoad()
