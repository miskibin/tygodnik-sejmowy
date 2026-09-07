"""Pydantic schema unit tests for Committee."""
from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supagraf.schema.committees import Committee, CommitteeMember

REPO_ROOT = Path(__file__).resolve().parents[3]
ASW = REPO_ROOT / "fixtures" / "sejm" / "committees" / "ASW.json"


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
