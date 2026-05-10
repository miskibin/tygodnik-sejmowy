"""Contract tests for ELI act payload validation.

ActIn uses extra="ignore" (the live API carries forward-compat fields we don't
care about), but the strict guarantees we DO pin here are:
  * required ELI/publisher/year/pos/type/title accepted via aliases
  * `position` alias also works (forward-compat against API churn)
  * status/in_force optional
  * references{} dict[str, list[dict]] preserved
  * relation enum strictness lives on the SQL side (CHECK in 0037)
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from supagraf.schema.acts import ActIn, ActListItem, ActListPage


_MINIMAL = {
    "ELI": "DU/2025/1900",
    "publisher": "DU",
    "year": 2025,
    "pos": 1900,
    "type": "Obwieszczenie",
    "title": "Obwieszczenie testowe",
}


def test_actin_minimal_payload_validates():
    obj = ActIn.model_validate(_MINIMAL)
    assert obj.eli_id == "DU/2025/1900"
    assert obj.publisher == "DU"
    assert obj.year == 2025
    assert obj.position == 1900
    assert obj.type == "Obwieszczenie"
    assert obj.title == "Obwieszczenie testowe"
    assert obj.status is None
    assert obj.in_force is None
    assert obj.references == {}
    assert obj.prints == []


def test_actin_alias_eli_required():
    payload = {**_MINIMAL}
    del payload["ELI"]
    with pytest.raises(ValidationError):
        ActIn.model_validate(payload)


def test_actin_alias_position_accepted():
    """API uses `pos`, but `position` should also work (forward-compat)."""
    payload = {**_MINIMAL}
    del payload["pos"]
    payload["position"] = 1900
    obj = ActIn.model_validate(payload)
    assert obj.position == 1900


def test_actin_full_payload_with_references():
    """Reference dict shaped {category: [{id, art?, date?}]} preserved as-is."""
    payload = {
        **_MINIMAL,
        "status": "obowiązujący",
        "inForce": "IN_FORCE",
        "announcementDate": "2025-12-19",
        "promulgation": "2025-12-31",
        "legalStatusDate": "2025-12-11",
        "changeDate": "2026-01-02T11:20:03",
        "address": "WDU20250001900",
        "displayAddress": "Dz.U. 2025 poz. 1900",
        "keywords": ["pomoc finansowa"],
        "references": {
            "Podstawa prawna": [{"id": "DU/2000/718"}],
            "Tekst jednolity dla aktu": [{"id": "DU/2022/1488"}],
            "Akty zmienione": [{"id": "DU/2021/2490", "date": "2026-04-08"}],
        },
        "prints": [{"number": "1142", "term": 10}],
        "texts": [{"fileName": "D20251900.pdf", "type": "O"}],
    }
    obj = ActIn.model_validate(payload)
    assert obj.status == "obowiązujący"
    assert obj.in_force == "IN_FORCE"
    assert str(obj.announcement_date) == "2025-12-19"
    assert str(obj.promulgation_date) == "2025-12-31"
    assert obj.keywords == ["pomoc finansowa"]
    # raw refs preserved (we shred on SQL side)
    assert "Podstawa prawna" in obj.references
    assert obj.references["Podstawa prawna"][0]["id"] == "DU/2000/718"
    assert len(obj.prints) == 1
    assert obj.prints[0].number == "1142"
    assert obj.prints[0].term == 10


def test_actin_extra_unknown_fields_ignored():
    """Forward-compat: API may add fields. extra='ignore' keeps validation green."""
    payload = {**_MINIMAL, "someBrandNewField": "junk", "alsoNew": [1, 2]}
    obj = ActIn.model_validate(payload)
    assert obj.eli_id == "DU/2025/1900"


def test_actlistitem_validates():
    payload = {
        "ELI": "DU/2025/1900",
        "publisher": "DU",
        "year": 2025,
        "pos": 1900,
        "title": "x",
        "type": "Obwieszczenie",
        "status": "obowiązujący",
    }
    obj = ActListItem.model_validate(payload)
    assert obj.eli_id == "DU/2025/1900"
    assert obj.position == 1900


def test_actlistpage_validates():
    payload = {
        "count": 1,
        "totalCount": 1,
        "offset": 0,
        "items": [{
            "ELI": "DU/2025/1",
            "publisher": "DU",
            "year": 2025,
            "pos": 1,
            "title": "x",
            "type": "Ustawa",
        }],
    }
    page = ActListPage.model_validate(payload)
    assert page.count == 1
    assert len(page.items) == 1
