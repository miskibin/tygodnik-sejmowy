"""Electoral districts (Polish: okręgi wyborcze) + postcode lookup.

Source: NOT api.sejm.gov.pl. Composed from PKW (district definitions and
gmina lists per district) and GUS TERYT (postcode -> gmina). 41 districts
for term 10 (Sejm RP, 2023+).

Two resources, both staged from fixtures/external/{districts,postcodes}/*.json.
Field name `district_num` matches the existing `mps.district_num` (which is
already populated from api.sejm.gov.pl `districtNum`).
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class District(BaseModel):
    """One row per (term, num). Mandates count comes from PKW."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    term: int
    num: int = Field(ge=1, le=41)
    name: str
    voivodeship: str
    mandates: int = Field(ge=1)
    seat_city: str | None = None


class DistrictPostcode(BaseModel):
    """Polish postcode (XX-XXX) -> district number, per term.

    A postcode that spans multiple gminas can map to multiple districts;
    downstream code picks majority or first. `commune_teryt` is the TERYT
    id of the gmina that anchors the row, kept informational (no FK).
    """
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    term: int
    postcode: str = Field(pattern=r"^\d{2}-\d{3}$")
    district_num: int = Field(ge=1, le=41)
    commune_teryt: str | None = None
