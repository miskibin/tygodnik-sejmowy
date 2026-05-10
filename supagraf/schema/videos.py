"""Video schema. /sejm/term{N}/videos/{unid}.json.

Sejm transmissions (committees, plenary, conferences). Natural id = unid (hex).

Caveman notes:
- `committee` and `subcommittee` are CODE strings; both occasionally come as
  comma-joined multi-codes (e.g. "PSN, PSR" or "ESK03S, SUE02S"). We keep the
  raw string here; load layer splits + resolves to committees(code).
- `term` not in fixture; supplied by stager (defaults to 10).
- `transcribe` always observed False; modeled as bool.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


VideoType = Literal["komisja", "podkomisja", "posiedzenie", "konferencja", "inne"]


class Video(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    unid: str
    type: VideoType
    title: str
    room: str | None = None
    start_datetime: datetime = Field(alias="startDateTime")
    end_datetime: datetime | None = Field(default=None, alias="endDateTime")
    description: str | None = None
    transcribe: bool = False
    committee: str | None = None              # raw code or comma-joined codes
    subcommittee: str | None = None           # raw code or comma-joined codes
    player_link: str | None = Field(default=None, alias="playerLink")
    player_link_iframe: str | None = Field(default=None, alias="playerLinkIFrame")
    video_link: str | None = Field(default=None, alias="videoLink")
    other_video_links: list[str] = Field(default_factory=list, alias="otherVideoLinks")
    audio: str | None = None
