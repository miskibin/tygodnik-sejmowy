"""Pydantic schema unit tests for Question + nested models."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from supagraf.schema.questions import (
    Question,
    QuestionAttachment,
    QuestionLink,
    QuestionRecipient,
    QuestionReply,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
INTER = REPO_ROOT / "fixtures" / "sejm" / "interpellations" / "14441.json"
WRITTEN = REPO_ROOT / "fixtures" / "sejm" / "writtenQuestions" / "3011.json"
# 14492 has the rare repeatedInterpellation field present (audit found 23 such docs).
INTER_REPEATED = REPO_ROOT / "fixtures" / "sejm" / "interpellations" / "14492.json"


def test_round_trip_real_interpellation():
    payload = json.loads(INTER.read_text(encoding="utf-8"))
    obj = Question.model_validate(payload)
    assert obj.term == 10
    assert obj.num == 14441
    assert isinstance(obj.from_ids, list)
    assert isinstance(obj.to_recipients, list)
    assert isinstance(obj.recipient_details, list)


def test_round_trip_real_written_question():
    payload = json.loads(WRITTEN.read_text(encoding="utf-8"))
    obj = Question.model_validate(payload)
    assert obj.term == 10
    assert obj.num == 3011


def test_repeated_interpellation_recursive():
    """23 docs carry a 1-element list with a nested copy of the question."""
    payload = json.loads(INTER_REPEATED.read_text(encoding="utf-8"))
    obj = Question.model_validate(payload)
    assert obj.repeated_interpellation is not None
    assert len(obj.repeated_interpellation) == 1
    assert obj.repeated_interpellation[0].num == obj.num


def test_reply_with_key_present():
    r = QuestionReply.model_validate({
        "from": "Sekretarz stanu Foo",
        "key": "DS8KLF",
        "lastModified": "2026-02-12T15:52:09",
        "links": [{"href": "h", "rel": "r"}],
        "onlyAttachment": False,
        "prolongation": False,
        "receiptDate": "2026-02-11",
    })
    assert r.key == "DS8KLF"
    assert r.prolongation is False


def test_reply_without_key_for_prolongation():
    """300/1181 reply entries are prolongation notices with no key."""
    r = QuestionReply.model_validate({
        "from": "sekretarz stanu w MRiRW - Jacek Czerniak",
        "lastModified": "2026-01-29T10:00:00",
        "links": [],
        "onlyAttachment": False,
        "prolongation": True,
        "receiptDate": "2026-01-29",
    })
    assert r.key is None
    assert r.prolongation is True


def test_extra_top_level_rejected():
    with pytest.raises(ValidationError):
        Question.model_validate({
            "term": 10, "num": 1, "title": "t",
            "from": [], "to": [], "links": [], "replies": [],
            "recipientDetails": [],
            "answerDelayedDays": 0, "lastModified": None,
            "receiptDate": None,
            "garbage_extra": True,
        })


def test_extra_reply_field_rejected():
    with pytest.raises(ValidationError):
        QuestionReply.model_validate({
            "from": "x", "lastModified": None, "links": [],
            "onlyAttachment": False, "prolongation": False,
            "receiptDate": None,
            "garbage": True,
        })


def test_extra_recipient_field_rejected():
    with pytest.raises(ValidationError):
        QuestionRecipient.model_validate({
            "name": "n", "sent": None, "answerDelayedDays": 0,
            "garbage": True,
        })


def test_extra_link_field_rejected():
    with pytest.raises(ValidationError):
        QuestionLink.model_validate({"href": "h", "rel": "r", "garbage": True})


def test_extra_attachment_field_rejected():
    with pytest.raises(ValidationError):
        QuestionAttachment.model_validate({
            "URL": "u", "name": "n", "lastModified": None, "garbage": True,
        })


def test_attachment_url_aliased():
    """Pydantic field is `url` but wire form is `URL`."""
    a = QuestionAttachment.model_validate({
        "URL": "https://x/y.pdf",
        "name": "y.pdf",
        "lastModified": None,
    })
    assert a.url == "https://x/y.pdf"
