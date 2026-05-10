"""Print natural-id derivation: print.number (text, with variants)."""
from __future__ import annotations

from supagraf.schema.prints import Print


def _make(number: str) -> Print:
    return Print.model_validate({
        "term": 10,
        "number": number,
        "title": "t",
        "attachments": ["x.pdf"],
        "processPrint": [],
        "changeDate": "2026-01-08T19:27:55",
        "deliveryDate": "2026-01-08",
        "documentDate": "2026-01-08",
    })


def test_simple_number():
    assert _make("2074").number == "2074"


def test_amendment_suffix_a():
    # `1988-A` is a real amendment-print number — must round-trip as text
    assert _make("1988-A").number == "1988-A"


def test_amendment_suffix_b():
    assert _make("2082-A").number == "2082-A"


def test_natural_id_is_string_number():
    obj = _make("2074")
    # mirror stage/prints.py lambda
    assert obj.number == "2074"


def test_default_empty_lists():
    obj = _make("3000")
    assert obj.process_print == []
    assert obj.additional_prints == []
