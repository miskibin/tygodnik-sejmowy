"""Every process fixture must validate against Process Pydantic schema."""
from __future__ import annotations

import pytest

from supagraf.schema.processes import Process

from .conftest import fixture_files, load_json

FILES = fixture_files("processes")


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_process_fixture_parses(path):
    payload = load_json(path)
    Process.model_validate(payload)


def test_processes_fixture_count():
    assert len(FILES) == 164
