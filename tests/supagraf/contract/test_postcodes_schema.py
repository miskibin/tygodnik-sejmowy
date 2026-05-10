"""Every postcode fixture must validate."""
from __future__ import annotations

import pytest

from supagraf.schema.districts import DistrictPostcode

from .conftest import fixture_files, load_json

FILES = fixture_files("postcodes", subdir="external")


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_postcode_fixture_parses(path):
    payload = load_json(path)
    DistrictPostcode.model_validate(payload)


def test_at_least_one_demo_seed():
    assert len(FILES) >= 1, "expected at least one postcode fixture"
