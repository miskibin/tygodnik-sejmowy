"""Every voting fixture must validate."""
from __future__ import annotations

import pytest

from supagraf.schema.votings import Voting

from .conftest import fixture_files, load_json

FILES = fixture_files("votings")


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_voting_fixture_parses(path):
    payload = load_json(path)
    Voting.model_validate(payload)


def test_votings_fixture_count():
    assert len(FILES) >= 100
