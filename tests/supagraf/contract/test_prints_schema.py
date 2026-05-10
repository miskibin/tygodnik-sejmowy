"""Every print fixture must validate."""
from __future__ import annotations

import pytest

from supagraf.schema.prints import Print

from .conftest import fixture_files, load_json

FILES = fixture_files("prints")


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_print_fixture_parses(path):
    payload = load_json(path)
    Print.model_validate(payload)


def test_prints_fixture_count():
    assert len(FILES) >= 100
