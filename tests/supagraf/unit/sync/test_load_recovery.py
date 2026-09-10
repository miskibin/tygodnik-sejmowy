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
