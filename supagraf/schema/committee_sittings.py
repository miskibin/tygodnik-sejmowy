"""Committee sittings schema. /sejm/term{N}/committees/{code}/sittings.

Returns a list of sittings inline (no per-sitting detail call needed for
metadata + agenda + video). We wrap the list into `CommitteeSittingsBundle`
so stage_resource() can use one fixture per committee code as natural id.

extra='forbid' on every model — contract test fails loudly when Sejm
adds new sitting fields so we notice before silently losing data.
"""
from __future__ import annotations

from datetime import date as _date, datetime as _datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


SittingStatus = Literal["FINISHED", "ONGOING", "PLANNED"]
VideoType = Literal["komisja", "podkomisja"]


class JointSittingRef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str
    num: int


class CommitteeSittingVideo(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    # Upstream has been observed with empty-string `unid` on stale rows;
    # the loader filters those, so accept-but-mark-nullable instead of
    # required-non-empty. Contract test still asserts the field is present.
    unid: str | None = None
    type: VideoType | None = None

    @field_validator("unid", mode="before")
    @classmethod
    def _empty_unid_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v
    committee: str | None = None
    title: str | None = None
    description: str | None = None
    room: str | None = None
    start_date_time: _datetime | None = Field(default=None, alias="startDateTime")
    end_date_time: _datetime | None = Field(default=None, alias="endDateTime")
    transcribe: bool = False
    video_link: str | None = Field(default=None, alias="videoLink")
    player_link: str | None = Field(default=None, alias="playerLink")
    player_link_iframe: str | None = Field(default=None, alias="playerLinkIFrame")
    subcommittee: str | None = None


class CommitteeSitting(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    code: str
    num: int
    date: _date | None = None
    start_date_time: _datetime | None = Field(default=None, alias="startDateTime")
    end_date_time: _datetime | None = Field(default=None, alias="endDateTime")
    room: str | None = None
    city: str | None = None
    status: SittingStatus | None = None
    closed: bool = False
    remote: bool = False
    agenda: str | None = None
    audio: str | None = None
    comments: str | None = None
    notes: str | None = None
    joint_with: list[JointSittingRef] = Field(default_factory=list, alias="jointWith")
    video: list[CommitteeSittingVideo] = Field(default_factory=list)

    @field_validator("video", mode="before")
    @classmethod
    def _drop_null_video_entries(cls, v):
        # Upstream occasionally emits a literal `null` mid-array (seen in
        # CNT/GMZ/PSR). Drop it rather than failing the whole bundle.
        if isinstance(v, list):
            return [x for x in v if x is not None]
        return v


class CommitteeSittingsBundle(BaseModel):
    """Wrapper for one committee's full sittings array.

    Fixture layout: fixtures/sejm/committee_sittings/{code}.json
        {"code": "ASW", "sittings": [...]}
    """
    model_config = ConfigDict(extra="forbid")

    code: str
    sittings: list[CommitteeSitting] = Field(default_factory=list)
