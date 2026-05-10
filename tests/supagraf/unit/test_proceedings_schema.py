"""Unit tests for proceedings schema with real fixture."""
from __future__ import annotations

import json
from pathlib import Path

from supagraf.schema.proceedings import ProceedingIn, StatementIn

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES = REPO_ROOT / "fixtures" / "sejm" / "proceedings"


def test_proceeding_in_roundtrips_49():
    raw = json.loads((FIXTURES / "49.json").read_text(encoding="utf-8"))
    obj = ProceedingIn.model_validate(raw)
    assert obj.number == 49
    assert obj.current is False
    assert len(obj.dates) == 2


def test_statement_parses_member_id_zero():
    obj = StatementIn.model_validate({
        "num": 0, "memberID": 0, "name": "Marszałek", "function": "",
        "rapporteur": False, "secretary": False, "unspoken": False,
        "startDateTime": "2026-01-08T10:02:00",
        "endDateTime": "2026-01-08T20:59:00",
    })
    assert obj.member_id == 0
    assert obj.name == "Marszałek"
