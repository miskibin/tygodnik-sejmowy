"""MP (Member of Parliament) schema. Mirrors api.sejm.gov.pl/sejm/term{N}/MP/{id}."""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class MP(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: int
    active: bool
    first_name: str = Field(alias="firstName")
    last_name: str = Field(alias="lastName")
    second_name: str | None = Field(default=None, alias="secondName")
    first_last_name: str = Field(alias="firstLastName")
    last_first_name: str = Field(alias="lastFirstName")
    accusative_name: str = Field(alias="accusativeName")
    genitive_name: str = Field(alias="genitiveName")
    club: str
    birth_date: date = Field(alias="birthDate")
    birth_location: str = Field(alias="birthLocation")
    district_name: str = Field(alias="districtName")
    district_num: int = Field(alias="districtNum")
    voivodeship: str
    education_level: str = Field(alias="educationLevel")
    profession: str | None = None
    email: str
    number_of_votes: int = Field(alias="numberOfVotes")
    inactive_cause: str | None = Field(default=None, alias="inactiveCause")
    waiver_desc: str | None = Field(default=None, alias="waiverDesc")
