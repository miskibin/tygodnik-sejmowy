"""Pydantic schema unit tests for Process + ProcessStageNode."""
from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supagraf.schema.processes import Process, ProcessLink, ProcessStageNode

REPO_ROOT = Path(__file__).resolve().parents[3]
P2200 = REPO_ROOT / "fixtures" / "sejm" / "processes" / "2200.json"
P_SPECIAL = REPO_ROOT / "fixtures" / "sejm" / "processes" / "17719-z.json"


def test_recursive_children_modeled():
    node = ProcessStageNode.model_validate({
        "stageName": "Root",
        "stageType": "Start",
        "children": [
            {
                "stageName": "C1",
                "stageType": "Referral",
                "committeeCode": "ASW",
                "type": "NORMAL",
            }
        ],
    })
    assert node.stage_name == "Root"
    assert len(node.children) == 1
    assert node.children[0].committee_code == "ASW"
    assert node.children[0].node_type == "NORMAL"


def test_extra_fields_rejected_root():
    with pytest.raises(ValidationError):
        Process.model_validate({
            "term": 10, "number": "1", "title": "t",
            "links": [], "stages": [],
            "unknown_top": True,
        })


def test_extra_fields_rejected_stage():
    with pytest.raises(ValidationError):
        ProcessStageNode.model_validate({
            "stageName": "x", "stageType": "Start",
            "garbage_key": True,
        })


def test_extra_fields_rejected_link():
    with pytest.raises(ValidationError):
        ProcessLink.model_validate({"href": "h", "rel": "r", "extra": True})


def test_invalid_ue_rejected():
    with pytest.raises(ValidationError):
        Process.model_validate({
            "term": 10, "number": "1", "title": "t", "UE": "MAYBE",
            "stages": [], "links": [],
        })


def test_invalid_urgency_rejected():
    with pytest.raises(ValidationError):
        Process.model_validate({
            "term": 10, "number": "1", "title": "t", "urgencyStatus": "WHEN_I_GET_TO_IT",
            "stages": [], "links": [],
        })


def test_null_stage_type_allowed():
    """Audit found 25 stages without stageType."""
    s = ProcessStageNode.model_validate({"stageName": "x"})
    assert s.stage_type is None


def test_passed_nullable():
    obj = Process.model_validate({
        "term": 10, "number": "1", "title": "t",
        "stages": [], "links": [], "passed": None,
    })
    assert obj.passed is None


def test_continued_on_is_date_list():
    """Observed in 2150.json: continuedOn is a list of date strings."""
    s = ProcessStageNode.model_validate({
        "stageName": "x", "stageType": "Start",
        "continuedOn": ["2026-01-21", "2026-01-22"],
    })
    assert len(s.continued_on) == 2


def test_natural_id_is_number():
    """Stage uses obj.number as natural_id."""
    obj = Process.model_validate({
        "term": 10, "number": "2200", "title": "t",
        "stages": [], "links": [],
    })
    assert obj.number == "2200"
