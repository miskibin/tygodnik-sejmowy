"""Every question fixture (interpellation + writtenQuestion) must validate.

Walks BOTH source dirs since the entity wire shape is identical (kind is
imposed at stage time from the source dir, not the payload).
"""
from __future__ import annotations

from pathlib import Path

import pytest

from supagraf.schema.questions import Question

from .conftest import fixture_files, load_json

INTERPELLATIONS = fixture_files("interpellations")
WRITTEN = fixture_files("writtenQuestions")
ALL_FILES: list[Path] = INTERPELLATIONS + WRITTEN


@pytest.mark.parametrize("path", ALL_FILES, ids=lambda p: f"{p.parent.name}/{p.name}")
def test_question_fixture_parses(path):
    payload = load_json(path)
    Question.model_validate(payload)


def test_questions_fixture_count():
    assert len(INTERPELLATIONS) == 632
    assert len(WRITTEN) == 434
    assert len(ALL_FILES) == 1066
