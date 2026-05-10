"""Contract tests for proceedings schemas."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from supagraf.schema.proceedings import ProceedingDayIn, ProceedingIn, StatementIn


def _stmt(**over):
    base = {
        "num": 0, "memberID": 0, "name": "X", "function": "",
        "rapporteur": False, "secretary": False, "unspoken": False,
        "startDateTime": "2026-01-08T10:00:00", "endDateTime": "2026-01-08T10:05:00",
    }
    base.update(over)
    return base


def test_statement_rejects_extra_field():
    with pytest.raises(ValidationError):
        StatementIn.model_validate(_stmt(extra_key="x"))


def test_statement_optional_times_missing_ok():
    obj = StatementIn.model_validate({
        "num": 0, "memberID": 1, "name": "X", "function": "",
        "rapporteur": False, "secretary": False, "unspoken": False,
    })
    assert obj.start_date_time is None
    assert obj.end_date_time is None


def test_statement_required_field_missing():
    bad = _stmt()
    bad.pop("name")
    with pytest.raises(ValidationError):
        StatementIn.model_validate(bad)


def test_proceeding_day_rejects_extra():
    with pytest.raises(ValidationError):
        ProceedingDayIn.model_validate({
            "date": "2026-01-08",
            "proceedingNum": 49,
            "statements": [],
            "extra": 1,
        })


def test_proceeding_day_required_missing():
    with pytest.raises(ValidationError):
        ProceedingDayIn.model_validate({"date": "2026-01-08", "statements": []})


def test_proceeding_rejects_extra():
    with pytest.raises(ValidationError):
        ProceedingIn.model_validate({
            "number": 49, "title": "x", "current": False,
            "dates": ["2026-01-08"], "agenda": "<x/>", "junk": 1,
        })


def test_proceeding_required_missing():
    with pytest.raises(ValidationError):
        ProceedingIn.model_validate({
            "number": 49, "title": "x", "current": False, "dates": ["2026-01-08"],
        })
