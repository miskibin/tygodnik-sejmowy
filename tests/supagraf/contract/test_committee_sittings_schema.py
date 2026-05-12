"""Every committee_sittings fixture must validate.

Mirror of test_committees_schema.py — one bundle per committee, payload
wraps the raw API array as {"code": ..., "sittings": [...]}.
"""
from __future__ import annotations

import pytest

from supagraf.schema.committee_sittings import CommitteeSittingsBundle

from .conftest import fixture_files, load_json

FILES = fixture_files("committee_sittings")


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_committee_sittings_fixture_parses(path):
    payload = load_json(path)
    CommitteeSittingsBundle.model_validate(payload)


def test_committee_sittings_fixture_present():
    # At least one bundle. Don't pin exact count — committee count drifts.
    assert len(FILES) >= 1
