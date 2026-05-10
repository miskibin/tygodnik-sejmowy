"""Every promise fixture must validate."""
from __future__ import annotations

import pytest

from supagraf.schema.promises import Promise

from .conftest import fixture_files, load_json

FILES = fixture_files("promises", subdir="external")


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_promise_fixture_parses(path):
    payload = load_json(path)
    Promise.model_validate(payload)


def test_at_least_one_demo_seed():
    assert len(FILES) >= 1, "expected at least one promise fixture"


def test_filename_matches_natural_id():
    """Filename stem must equal `{party_code}__{slug}` so natural_ids stay stable."""
    for path in FILES:
        payload = load_json(path)
        promise = Promise.model_validate(payload)
        expected = f"{promise.party_code}__{promise.slug}"
        assert path.stem == expected, f"{path.name}: stem!={expected}"
