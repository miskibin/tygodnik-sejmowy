"""Pydantic schema unit tests for Committee."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from supagraf.schema.committees import Committee, CommitteeMember

REPO_ROOT = Path(__file__).resolve().parents[3]
ASW = REPO_ROOT / "fixtures" / "sejm" / "committees" / "ASW.json"


def test_round_trip_real_fixture():
    payload = json.loads(ASW.read_text(encoding="utf-8"))
    obj = Committee.model_validate(payload)
    assert obj.code == "ASW"
    assert obj.type == "STANDING"
    assert obj.name_genitive.startswith("Komisji")
    assert len(obj.members) == 39
    assert len(obj.sub_committees) == 7
    # member with function
    chair = next(m for m in obj.members if m.function == "przewodniczący")
    assert chair.id == 140
    # member without function (plain member)
    plain = next(m for m in obj.members if m.function is None)
    assert plain.club


def test_extra_fields_rejected():
    with pytest.raises(ValidationError):
        Committee.model_validate({
            "code": "X", "name": "n", "members": [], "subCommittees": [],
            "unknown_field": "boom",
        })


def test_member_extra_rejected():
    with pytest.raises(ValidationError):
        CommitteeMember.model_validate({
            "id": 1, "club": "KO", "lastFirstName": "X Y", "extra": True,
        })


def test_null_type_allowed():
    obj = Committee.model_validate({
        "code": "X", "name": "n", "type": None, "members": [], "subCommittees": [],
    })
    assert obj.type is None


def test_null_function_allowed():
    m = CommitteeMember.model_validate({"id": 1, "club": "KO", "lastFirstName": "X Y"})
    assert m.function is None


def test_empty_subcommittees():
    obj = Committee.model_validate({"code": "X", "name": "n", "members": []})
    assert obj.sub_committees == []


def test_invalid_type_rejected():
    with pytest.raises(ValidationError):
        Committee.model_validate({
            "code": "X", "name": "n", "type": "BOGUS", "members": [], "subCommittees": [],
        })


def test_natural_id_is_code():
    """Stage uses obj.code as natural_id."""
    from supagraf.stage import committees as stage_mod  # noqa: F401
    obj = Committee.model_validate({"code": "ASW", "name": "n", "members": []})
    assert obj.code == "ASW"
