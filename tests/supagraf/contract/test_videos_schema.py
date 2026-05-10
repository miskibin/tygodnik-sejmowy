"""Every video fixture must validate against Video Pydantic schema."""
from __future__ import annotations

import pytest

from supagraf.schema.videos import Video

from .conftest import fixture_files, load_json

FILES = fixture_files("videos")


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_video_fixture_parses(path):
    payload = load_json(path)
    Video.model_validate(payload)


def test_videos_fixture_count():
    assert len(FILES) == 1000
