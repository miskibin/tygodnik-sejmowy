"""Schema + parser tests for MP office expense reports.

`bop_template_sample.pdf` is the blank Załącznik nr 1 form template (4 pages,
144 kB), pulled directly from orka.sejm.gov.pl. It has no actual amounts, but
exercises the table-layout detection and category-row anchor logic. Real
filled-in reports follow the same layout — the only difference is amount
strings being non-empty.
"""
from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from supagraf.fetch.mp_office_expenses import (
    _parse_pl_decimal,
    _extract_pdf_text,
    parse_pdf_text,
)
from supagraf.schema.mp_office_expenses import (
    MPOfficeExpenseItem,
    MPOfficeExpenseReport,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
SAMPLE_PDF = REPO_ROOT / "tests" / "fixtures" / "bop_template_sample.pdf"


def test_pl_decimal_parser():
    assert _parse_pl_decimal("12 345,67") == Decimal("12345.67")
    assert _parse_pl_decimal("1234,00") == Decimal("1234.00")
    assert _parse_pl_decimal("0") == Decimal("0")
    assert _parse_pl_decimal("  0,00 zł") == Decimal("0.00")
    assert _parse_pl_decimal("") is None
    assert _parse_pl_decimal("brak") is None


def test_schema_minimal():
    obj = MPOfficeExpenseReport.model_validate({
        "term": 10,
        "mp_id": 123,
        "year": 2025,
        "source_url": "https://orka.sejm.gov.pl/x.pdf",
        "items": [],
    })
    assert obj.mp_id == 123
    assert obj.source_url.startswith("https://")
    assert obj.items == []


def test_schema_with_items_and_amounts():
    obj = MPOfficeExpenseReport.model_validate({
        "term": 10,
        "mp_id": 1,
        "year": 2025,
        "source_url": "https://x",
        "funds_allocated": "300000.00",
        "funds_spent": "281400.50",
        "items": [
            {"category_code": 1, "amount": "150000.00"},
            {"category_code": 11, "amount": "60000.00", "notes": "biuro przy ul. X"},
        ],
    })
    assert obj.funds_allocated == Decimal("300000.00")
    assert obj.items[1].notes == "biuro przy ul. X"


def test_schema_rejects_extra_fields():
    with pytest.raises(ValidationError):
        MPOfficeExpenseReport.model_validate({
            "term": 10, "mp_id": 1, "year": 2025,
            "source_url": "https://x", "items": [], "boom": True,
        })


def test_schema_rejects_bad_category_code():
    with pytest.raises(ValidationError):
        MPOfficeExpenseItem.model_validate({"category_code": 0, "amount": 100})
    with pytest.raises(ValidationError):
        MPOfficeExpenseItem.model_validate({"category_code": 999, "amount": 100})


@pytest.mark.skipif(not SAMPLE_PDF.exists(), reason="sample PDF not present")
def test_parser_against_blank_form():
    """Blank BOP template — every amount is empty, but we must still emit 23
    item rows (padded with 0) and not crash."""
    text = _extract_pdf_text(SAMPLE_PDF)
    parsed = parse_pdf_text(text)
    # The blank form has no funds filled in; we should not have hallucinated values
    assert parsed["items"], "parser produced no items"
    codes = sorted(it["category_code"] for it in parsed["items"])
    assert codes == list(range(1, 24)), f"expected codes 1..23, got {codes}"
    # All amounts are zero on the blank form (or absent → padded to 0 by the parser)
    for it in parsed["items"]:
        amount = Decimal(it["amount"])
        assert amount == Decimal("0"), f"blank form item {it['category_code']} should be 0, got {amount}"


def test_natural_id_in_stage():
    """Stage uses '{mp_id}__{year}' as natural_id."""
    from supagraf.stage import mp_office_expenses as stage_mod  # noqa: F401
    obj = MPOfficeExpenseReport.model_validate({
        "term": 10, "mp_id": 42, "year": 2025,
        "source_url": "https://x", "items": [],
    })
    assert f"{obj.mp_id}__{obj.year}" == "42__2025"
