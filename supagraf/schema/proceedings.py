from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class StatementIn(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    num: int
    member_id: int = Field(alias="memberID")
    name: str
    function: str
    rapporteur: bool
    secretary: bool
    unspoken: bool
    start_date_time: Optional[datetime] = Field(default=None, alias="startDateTime")
    end_date_time: Optional[datetime] = Field(default=None, alias="endDateTime")


class ProceedingDayIn(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    date: date
    proceeding_num: int = Field(alias="proceedingNum")
    statements: list[StatementIn]


class ProceedingIn(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    number: int
    title: str
    current: bool
    dates: list[date]
    agenda: str
    # Present only on the active/current proceeding (e.g. proc 57). Stored raw in
    # _stage payload (load fn ignores them); kept optional for forward-compat.
    current_affairs: Optional[str] = Field(default=None, alias="currentAffairs")
    schedule: Optional[str] = None
    votings: Optional[str] = None
