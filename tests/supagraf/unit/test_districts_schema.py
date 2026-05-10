"""Pydantic edge cases for District + DistrictPostcode."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from supagraf.schema.districts import District, DistrictPostcode


def test_district_round_trip():
    obj = District.model_validate({
        "term": 10, "num": 13, "name": "Krakow",
        "voivodeship": "malopolskie", "mandates": 14, "seat_city": "Krakow",
    })
    assert obj.num == 13
    assert obj.mandates == 14


def test_district_extra_rejected():
    with pytest.raises(ValidationError):
        District.model_validate({
            "term": 10, "num": 1, "name": "X", "voivodeship": "Y",
            "mandates": 1, "extra": "boom",
        })


def test_district_num_out_of_range():
    with pytest.raises(ValidationError):
        District.model_validate({
            "term": 10, "num": 42, "name": "X", "voivodeship": "Y", "mandates": 1,
        })


def test_district_mandates_min_one():
    with pytest.raises(ValidationError):
        District.model_validate({
            "term": 10, "num": 1, "name": "X", "voivodeship": "Y", "mandates": 0,
        })


def test_postcode_round_trip():
    obj = DistrictPostcode.model_validate({
        "term": 10, "postcode": "31-018", "district_num": 13,
        "commune_teryt": "1261011",
    })
    assert obj.postcode == "31-018"


def test_postcode_pattern_rejects_bad_format():
    with pytest.raises(ValidationError):
        DistrictPostcode.model_validate({
            "term": 10, "postcode": "31018", "district_num": 13,
        })


def test_postcode_commune_optional():
    obj = DistrictPostcode.model_validate({
        "term": 10, "postcode": "00-001", "district_num": 19,
    })
    assert obj.commune_teryt is None
