"""Every club fixture must validate."""
from __future__ import annotations

import pytest

from supagraf.schema.clubs import Club

from .conftest import fixture_files, load_json

FILES = fixture_files("clubs")


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_club_fixture_parses(path):
    payload = load_json(path)
    Club.model_validate(payload)


def test_clubs_fixture_count():
    assert len(FILES) >= 5
