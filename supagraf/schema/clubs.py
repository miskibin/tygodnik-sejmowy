"""Club (parliamentary caucus) schema. /sejm/term{N}/clubs/{id}.

Upstream started embedding the roster (`members[]`, with `joinDate` and
optional `function`) in 2026 — the club-level join dates are the first
authoritative source for club switches, which `mp_club_history` currently
infers from vote records. Kept on the payload; the SQL loader ignores it
until a migration consumes it.
"""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class ClubMember(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: int
    first_name: str = Field(alias="firstName")
    last_name: str = Field(alias="lastName")
    function: str | None = None
    join_date: date | None = Field(default=None, alias="joinDate")


class Club(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str
    name: str
    members_count: int = Field(alias="membersCount")
    email: str = ""
    phone: str = ""
    fax: str = ""
    members: list[ClubMember] = Field(default_factory=list)
