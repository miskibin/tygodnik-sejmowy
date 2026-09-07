"""Unit tests for proceedings schema with real fixture."""
from __future__ import annotations

from pathlib import Path

from supagraf.schema.proceedings import StatementIn

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES = REPO_ROOT / "fixtures" / "sejm" / "proceedings"


def test_statement_parses_member_id_zero():
    obj = StatementIn.model_validate({
        "num": 0, "memberID": 0, "name": "Marszałek", "function": "",
        "rapporteur": False, "secretary": False, "unspoken": False,
        "startDateTime": "2026-01-08T10:02:00",
        "endDateTime": "2026-01-08T20:59:00",
    })
    assert obj.member_id == 0
    assert obj.name == "Marszałek"
