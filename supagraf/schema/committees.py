"""Committee schema. /sejm/term{N}/committees/{code}.

Roster snapshot per committee. mp.id in fixture == api id (mps.mp_id, NOT mps.id).
subCommittees: list of child committee codes; FK validated at load time.
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


CommitteeType = Literal["STANDING", "EXTRAORDINARY", "INVESTIGATIVE"]


class CommitteeMember(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: int
    club: str
    function: str | None = None
    last_first_name: str = Field(alias="lastFirstName")
    # Added upstream in 2026 (split name + membership start date).
    first_name: str | None = Field(default=None, alias="firstName")
    last_name: str | None = Field(default=None, alias="lastName")
    join_date: date | None = Field(default=None, alias="joinDate")


class Committee(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    code: str
    name: str
    name_genitive: str | None = Field(default=None, alias="nameGenitive")
    type: CommitteeType | None = None
    scope: str | None = None
    phone: str | None = None
    appointment_date: date | None = Field(default=None, alias="appointmentDate")
    composition_date: date | None = Field(default=None, alias="compositionDate")
    # Set on dissolved committees (e.g. investigative ones). Upstream 2026.
    dismissal_date: date | None = Field(default=None, alias="dismissalDate")
    members: list[CommitteeMember] = Field(default_factory=list)
    sub_committees: list[str] = Field(default_factory=list, alias="subCommittees")
