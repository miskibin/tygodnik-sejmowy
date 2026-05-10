"""Every bill fixture must validate."""
from __future__ import annotations

import pytest

from supagraf.schema.bills import Bill

from .conftest import fixture_files, load_json

FILES = fixture_files("bills")


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_bill_fixture_parses(path):
    payload = load_json(path)
    Bill.model_validate(payload)


def test_bills_fixture_count():
    # 175 RPW_*.json entity files (excludes _list.json, _index.json).
    assert len(FILES) == 175
