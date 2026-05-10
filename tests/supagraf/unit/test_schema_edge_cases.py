"""Edge cases for Pydantic schemas the contract tests can't reach.

Contract tests run against captured fixtures and confirm 'these shapes parse'.
These tests pin down behaviors that matter even when fixtures don't cover them:
- optional fields default sanely
- forbid extra keys (so silent API additions get noticed)
- aliases work both directions
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from supagraf.schema.clubs import Club
from supagraf.schema.mps import MP
from supagraf.schema.votings import Voting, VoteRow


def _mp_payload(**overrides):
    base = {
        "id": 1, "active": True,
        "firstName": "Jan", "lastName": "Kowalski",
        "firstLastName": "Jan Kowalski", "lastFirstName": "Kowalski Jan",
        "accusativeName": "Jana Kowalskiego", "genitiveName": "Jana Kowalskiego",
        "club": "PiS",
        "birthDate": "1970-01-01", "birthLocation": "Warszawa",
        "districtName": "Warszawa", "districtNum": 1,
        "voivodeship": "mazowieckie",
        "educationLevel": "wyższe",
        "email": "jan@example.com",
        "numberOfVotes": 12345,
    }
    base.update(overrides)
    return base


def test_mp_minimal_required():
    MP.model_validate(_mp_payload())


def test_mp_optional_fields_default_to_none():
    m = MP.model_validate(_mp_payload())
    assert m.second_name is None
    assert m.profession is None
    assert m.inactive_cause is None
    assert m.waiver_desc is None


def test_mp_rejects_unknown_field():
    with pytest.raises(ValidationError):
        MP.model_validate(_mp_payload(unknownNewField="oops"))


def test_mp_alias_round_trip():
    m = MP.model_validate(_mp_payload(secondName="Piotr"))
    assert m.second_name == "Piotr"
    dumped = m.model_dump(by_alias=True)
    assert dumped["secondName"] == "Piotr"


def test_club_empty_strings_for_phone_email_ok():
    c = Club.model_validate({
        "id": "X", "name": "Klub X", "membersCount": 1,
        "email": "", "phone": "", "fax": "",
    })
    assert c.phone == "" and c.email == ""


def test_voting_present_choice_accepted():
    row = VoteRow.model_validate({
        "MP": 1, "club": "PiS", "firstName": "Jan",
        "lastName": "Kowalski", "vote": "PRESENT",
    })
    assert row.vote == "PRESENT"


def test_voting_unknown_vote_choice_rejected():
    with pytest.raises(ValidationError):
        VoteRow.model_validate({
            "MP": 1, "club": "PiS", "firstName": "Jan",
            "lastName": "Kowalski", "vote": "MAYBE",
        })


def test_voting_minimal_payload():
    payload = {
        "term": 10, "sitting": 1, "sittingDay": 1, "votingNumber": 1,
        "date": "2026-01-01T10:00:00",
        "title": "t", "topic": "x",
        "kind": "ELECTRONIC", "majorityType": "SIMPLE_MAJORITY",
        "majorityVotes": 100,
        "yes": 1, "no": 0, "abstain": 0, "present": 0,
        "notParticipating": 0, "totalVoted": 1,
        "votes": [{"MP": 1, "club": "PiS", "firstName": "Jan",
                   "lastName": "Kowalski", "vote": "YES"}],
    }
    Voting.model_validate(payload)
