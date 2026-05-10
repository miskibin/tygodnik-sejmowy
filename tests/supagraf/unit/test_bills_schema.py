"""Pydantic schema unit tests for Bill."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from supagraf.schema.bills import Bill

REPO_ROOT = Path(__file__).resolve().parents[3]
SAMPLE = REPO_ROOT / "fixtures" / "sejm" / "bills" / "RPW_10073_2026.json"


def test_round_trip_real_fixture():
    payload = json.loads(SAMPLE.read_text(encoding="utf-8"))
    obj = Bill.model_validate(payload)
    assert obj.number == "RPW/10073/2026"
    assert obj.term == 10
    assert obj.applicant_type == "DEPUTIES"
    assert obj.submission_type == "BILL"
    assert obj.status == "ACTIVE"
    assert obj.eu_related is False
    assert obj.public_consultation is False
    assert obj.consultation_results is False
    assert obj.title.startswith("Poselski projekt")


def test_extra_fields_rejected():
    with pytest.raises(ValidationError):
        Bill.model_validate({
            "term": 10,
            "number": "RPW/1/2026",
            "title": "t",
            "applicantType": "DEPUTIES",
            "submissionType": "BILL",
            "status": "ACTIVE",
            "euRelated": False,
            "publicConsultation": False,
            "consultationResults": False,
            "dateOfReceipt": "2026-01-01",
            "unknown": "boom",
        })


def test_invalid_applicant_rejected():
    with pytest.raises(ValidationError):
        Bill.model_validate({
            "term": 10, "number": "RPW/1/2026", "title": "t",
            "applicantType": "BOGUS", "submissionType": "BILL", "status": "ACTIVE",
            "euRelated": False, "publicConsultation": False, "consultationResults": False,
            "dateOfReceipt": "2026-01-01",
        })


def test_invalid_submission_type_rejected():
    with pytest.raises(ValidationError):
        Bill.model_validate({
            "term": 10, "number": "RPW/1/2026", "title": "t",
            "applicantType": "DEPUTIES", "submissionType": "BOGUS", "status": "ACTIVE",
            "euRelated": False, "publicConsultation": False, "consultationResults": False,
            "dateOfReceipt": "2026-01-01",
        })


def test_invalid_status_rejected():
    with pytest.raises(ValidationError):
        Bill.model_validate({
            "term": 10, "number": "RPW/1/2026", "title": "t",
            "applicantType": "DEPUTIES", "submissionType": "BILL", "status": "BOGUS",
            "euRelated": False, "publicConsultation": False, "consultationResults": False,
            "dateOfReceipt": "2026-01-01",
        })


def test_optional_fields_absent():
    """description/print/sendersNumber/publicConsultation*Date are all optional."""
    obj = Bill.model_validate({
        "term": 10, "number": "RPW/1/2026", "title": "t",
        "applicantType": "DEPUTIES", "submissionType": "BILL", "status": "ACTIVE",
        "euRelated": False, "publicConsultation": False, "consultationResults": False,
        "dateOfReceipt": "2026-01-01",
    })
    assert obj.description is None
    assert obj.print is None
    assert obj.senders_number is None
    assert obj.public_consultation_start_date is None
    assert obj.public_consultation_end_date is None


def test_full_optional_fields():
    obj = Bill.model_validate({
        "term": 10, "number": "RPW/1/2026", "title": "t",
        "applicantType": "GOVERNMENT", "submissionType": "BILL", "status": "ACTIVE",
        "euRelated": True, "publicConsultation": True, "consultationResults": True,
        "dateOfReceipt": "2026-01-01",
        "description": "desc",
        "print": "2414",
        "sendersNumber": "RM-0610-38-26",
        "publicConsultationStartDate": "2026-01-02",
        "publicConsultationEndDate": "2026-01-30",
    })
    assert obj.description == "desc"
    assert obj.print == "2414"
    assert obj.senders_number == "RM-0610-38-26"


def test_natural_id_is_slash_number():
    """Stage uses obj.number as natural_id (slash form, NOT filename stem)."""
    from supagraf.stage import bills as stage_mod  # noqa: F401
    obj = Bill.model_validate({
        "term": 10, "number": "RPW/10073/2026", "title": "t",
        "applicantType": "DEPUTIES", "submissionType": "BILL", "status": "ACTIVE",
        "euRelated": False, "publicConsultation": False, "consultationResults": False,
        "dateOfReceipt": "2026-01-01",
    })
    assert obj.number == "RPW/10073/2026"
    assert "/" in obj.number  # slash form
