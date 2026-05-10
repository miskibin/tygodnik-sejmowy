"""Stage external districts + district_postcodes fixtures.

External (NOT api.sejm.gov.pl) -- composed from PKW + GUS TERYT.
Fixtures live under fixtures/external/{districts,postcodes}/*.json.
"""
from __future__ import annotations

from supagraf.schema.districts import District, DistrictPostcode
from supagraf.stage.base import StageReport, stage_resource


def stage_districts(term: int = 10) -> StageReport:
    return stage_resource(
        resource="districts",
        table="_stage_districts",
        model=District,
        natural_id=lambda obj, _path: str(obj.num),
        term=term,
        subdir="external",
    )


def stage_district_postcodes(term: int = 10) -> StageReport:
    return stage_resource(
        resource="postcodes",
        table="_stage_district_postcodes",
        model=DistrictPostcode,
        natural_id=lambda obj, _path: f"{obj.postcode}__{obj.district_num}",
        term=term,
        subdir="external",
    )
