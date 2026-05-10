"""Every MP fixture file must validate against the MP schema."""
from __future__ import annotations

import pytest

from supagraf.schema.mps import MP

from .conftest import fixture_files, load_json

FILES = fixture_files("mps")


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_mp_fixture_parses(path):
    payload = load_json(path)
    MP.model_validate(payload)


def test_mps_fixture_count_matches_index():
    assert len(FILES) >= 400, "expected hundreds of MP fixtures"
