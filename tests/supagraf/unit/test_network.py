import pytest

from supagraf.network import (
    _require_complete_ballots,
    _validate_source_ballots,
    build_question_edges,
    build_vote_layer,
)


def test_question_projection_is_fractional_with_official_url():
    edges = build_question_edges(
        [
            {
                "id": 7,
                "kind": "interpellation",
                "num": 12,
                "sent_date": "2026-09-01",
                "title": "T",
                "authors": [3, 1, 2],
            }
        ],
        term=10,
    )
    assert len(edges) == 3
    assert {edge["weight"] for edge in edges} == {0.5}
    assert edges[0]["evidence"][0]["url"].endswith("/interpellations/12")


def _voting(number: int, *, swapped: bool = False, tied: bool = False) -> dict:
    a, b = ("B", "A") if swapped else ("A", "B")
    a_votes = ["YES", "YES", "YES", "YES", "NO", "NO"]
    b_votes = ["YES", "YES", "NO", "NO", "NO", "NO"]
    if tied:
        b_votes = ["YES", "YES", "YES", "NO", "NO", "NO"]
    rows = [
        {"mp_id": i + 1, "club_ref": a, "vote": vote} for i, vote in enumerate(a_votes)
    ] + [
        {"mp_id": i + 7, "club_ref": b, "vote": vote} for i, vote in enumerate(b_votes)
    ]
    return {
        "id": number,
        "date": "2026-09-01",
        "title": f"G {number}",
        "sitting": 1,
        "voting_number": number,
        "votes": rows,
    }


def test_vote_edge_has_one_shared_cross_club_denominator_and_agreeing_evidence():
    layer = build_vote_layer(
        [_voting(i, swapped=i % 2 == 0) for i in range(1, 21)], term=10
    )
    edge = next(e for e in layer["edges"] if (e["a"], e["b"]) == (1, 7))
    assert edge["n"] == 20
    assert edge["agreement"] == 1.0
    assert edge["baseline_agreement"] == 0.0
    assert edge["excess"] == 1.0
    assert edge["evidence"] and all(
        item["url"] and item["voting_id"] for item in edge["evidence"]
    )


def test_tied_club_and_under_twenty_comparisons_emit_no_edge():
    assert (
        build_vote_layer([_voting(i, tied=True) for i in range(1, 21)], term=10)[
            "edges"
        ]
        == []
    )
    assert build_vote_layer([_voting(i) for i in range(1, 20)], term=10)["edges"] == []


def test_near_unanimous_votes_are_excluded():
    vote = _voting(1)
    for row in vote["votes"]:
        row["vote"] = "YES"
    assert build_vote_layer([vote] * 20, term=10)["edges"] == []


def test_missing_ballot_rows_fail_snapshot_build():
    with pytest.raises(RuntimeError, match="incomplete ballot set"):
        _require_complete_ballots(
            [
                {"id": 1, "total_voted": 1, "not_participating": 0},
                {"id": 2, "total_voted": 1, "not_participating": 0},
            ],
            {1: [{"mp_id": 1, "vote": "YES"}]},
        )


def test_nonempty_partial_duplicate_or_invalid_ballots_fail():
    voting = {"totalVoted": 3, "notParticipating": 0}
    with pytest.raises(RuntimeError, match="incomplete ballot set"):
        _validate_source_ballots(voting, [{"MP": 1, "vote": "YES"}], mp_key="MP")
    with pytest.raises(RuntimeError, match="incomplete ballot set"):
        _validate_source_ballots(
            {"totalVoted": 2, "notParticipating": 0},
            [{"MP": 1, "vote": "YES"}, {"MP": 1, "vote": "NO"}],
            mp_key="MP",
        )
    with pytest.raises(RuntimeError, match="invalid ballot MP id"):
        _validate_source_ballots(
            {"totalVoted": 1, "notParticipating": 0},
            [{"MP": None, "vote": "YES"}],
            mp_key="MP",
        )
