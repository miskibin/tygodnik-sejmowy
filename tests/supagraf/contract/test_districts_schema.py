"""Every district fixture must validate."""
from __future__ import annotations

import pytest as _pytest
from pathlib import Path as _Path

if not (_Path(__file__).resolve().parents[3] / "fixtures" / "external").exists():
    _pytest.skip("fixtures/external not generated (run `python -m supagraf fixtures districts|promises`)", allow_module_level=True)


import pytest

from supagraf.schema.districts import District

from ._helpers import fixture_files, load_json

FILES = fixture_files("districts", subdir="external")


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_district_fixture_parses(path):
    payload = load_json(path)
    District.model_validate(payload)


def test_at_least_one_demo_seed():
    assert len(FILES) >= 1, "expected at least one district fixture (e.g. 13.json)"
