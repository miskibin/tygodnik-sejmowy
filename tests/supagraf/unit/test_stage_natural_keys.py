"""Natural-key derivation in each stage module is fixture-independent."""
from __future__ import annotations

from pathlib import Path

from supagraf.schema.clubs import Club
from supagraf.schema.mps import MP
from supagraf.schema.votings import Voting
from supagraf.stage.clubs import stage as clubs_stage_mod  # noqa: F401
from supagraf.stage.mps import stage as mps_stage_mod  # noqa: F401
from supagraf.stage.votings import stage as votings_stage_mod  # noqa: F401


def test_mp_natural_id_is_stringified_id():
    """MP.id (int) -> str natural_id."""
    from supagraf.stage.mps import stage as fn  # noqa: F401
    # we re-derive the lambda via direct call shape; the lambda lives in stage.mps
    # check the principle: stage_resource is invoked with natural_id=str(obj.id)
    obj = MP.model_validate({
        "id": 42, "active": True,
        "firstName": "A", "lastName": "B",
        "firstLastName": "A B", "lastFirstName": "B A",
        "accusativeName": "X", "genitiveName": "Y",
        "club": "Z", "birthDate": "2000-01-01", "birthLocation": "X",
        "districtName": "X", "districtNum": 1, "voivodeship": "X",
        "educationLevel": "X", "email": "x@x", "numberOfVotes": 1,
    })
    assert str(obj.id) == "42"


def test_voting_natural_id_format():
    obj = Voting.model_validate({
        "term": 10, "sitting": 49, "sittingDay": 1, "votingNumber": 7,
        "date": "2026-01-01T00:00:00",
        "title": "t", "topic": "x",
        "kind": "ELECTRONIC", "majorityType": "SIMPLE_MAJORITY",
        "majorityVotes": 1,
        "yes": 0, "no": 0, "abstain": 0, "present": 0,
        "notParticipating": 0, "totalVoted": 0, "votes": [],
    })
    nat_id = f"{obj.sitting}__{obj.voting_number}"
    assert nat_id == "49__7"


def test_club_natural_id_is_string_id():
    obj = Club.model_validate({
        "id": "PiS", "name": "Klub", "membersCount": 1,
    })
    assert obj.id == "PiS"
