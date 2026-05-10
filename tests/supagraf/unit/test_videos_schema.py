"""Pydantic schema unit tests for Video."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from supagraf.schema.videos import Video

REPO_ROOT = Path(__file__).resolve().parents[3]
VIDEOS_DIR = REPO_ROOT / "fixtures" / "sejm" / "videos"
SAMPLE = VIDEOS_DIR / "004BBF920E8397E2C1258D950045099C.json"


def test_round_trip_real_fixture():
    payload = json.loads(SAMPLE.read_text(encoding="utf-8"))
    obj = Video.model_validate(payload)
    assert obj.unid == "004BBF920E8397E2C1258D950045099C"
    assert obj.type == "komisja"
    assert obj.committee == "RSP"
    assert obj.transcribe is False
    assert obj.start_datetime is not None


def test_extras_rejected():
    with pytest.raises(ValidationError):
        Video.model_validate({
            "unid": "X", "type": "komisja", "title": "t", "room": "r",
            "startDateTime": "2026-01-01T00:00:00",
            "garbage": True,
        })


def test_invalid_type_rejected():
    with pytest.raises(ValidationError):
        Video.model_validate({
            "unid": "X", "type": "made_up", "title": "t", "room": "r",
            "startDateTime": "2026-01-01T00:00:00",
        })


def test_committee_optional():
    obj = Video.model_validate({
        "unid": "X", "type": "konferencja", "title": "t", "room": "r",
        "startDateTime": "2026-01-01T00:00:00",
    })
    assert obj.committee is None
    assert obj.subcommittee is None


def test_committee_multi_code_string_preserved():
    """Audit found 'PSN, PSR' / 'ESK, OSZ, RRW' multi-code strings — must validate as str."""
    obj = Video.model_validate({
        "unid": "X", "type": "komisja", "title": "t", "room": "r",
        "startDateTime": "2026-01-01T00:00:00",
        "committee": "PSN, PSR",
    })
    assert obj.committee == "PSN, PSR"


def test_other_video_links_array():
    obj = Video.model_validate({
        "unid": "X", "type": "komisja", "title": "t", "room": "r",
        "startDateTime": "2026-01-01T00:00:00",
        "otherVideoLinks": ["a", "b"],
    })
    assert obj.other_video_links == ["a", "b"]


def test_subcommittee_field():
    obj = Video.model_validate({
        "unid": "X", "type": "podkomisja", "title": "t", "room": "r",
        "startDateTime": "2026-01-01T00:00:00",
        "committee": "PSR",
        "subcommittee": "PSR02N",
    })
    assert obj.subcommittee == "PSR02N"


def test_audio_field():
    obj = Video.model_validate({
        "unid": "X", "type": "komisja", "title": "t", "room": "r",
        "startDateTime": "2026-01-01T00:00:00",
        "audio": "https://example.com/x.mp3",
    })
    assert obj.audio == "https://example.com/x.mp3"


def test_natural_id_is_unid():
    obj = Video.model_validate({
        "unid": "DEADBEEF", "type": "inne", "title": "t", "room": "r",
        "startDateTime": "2026-01-01T00:00:00",
    })
    assert obj.unid == "DEADBEEF"
