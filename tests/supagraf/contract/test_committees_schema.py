"""Every committee fixture must validate."""
from __future__ import annotations

import pytest

from supagraf.schema.committees import Committee

from .conftest import fixture_files, load_json

FILES = fixture_files("committees")


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_committee_fixture_parses(path):
    payload = load_json(path)
    Committee.model_validate(payload)


def test_committees_fixture_count():
    assert len(FILES) == 40
