"""Club (parliamentary caucus) schema."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class Club(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str
    name: str
    members_count: int = Field(alias="membersCount")
    email: str = ""
    phone: str = ""
    fax: str = ""
