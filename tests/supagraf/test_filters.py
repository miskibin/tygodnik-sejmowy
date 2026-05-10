from datetime import date

from supagraf.fixtures.filters import first_date, has_no_date, in_year, parse_date


def test_parse_date_iso_string():
    assert parse_date("2026-03-15") == date(2026, 3, 15)


def test_parse_date_datetime_string():
    assert parse_date("2026-03-15T10:00:00") == date(2026, 3, 15)


def test_parse_date_none():
    assert parse_date(None) is None


def test_parse_date_garbage():
    assert parse_date("not a date") is None


def test_first_date_picks_priority_field():
    item = {"date": "2024-01-01", "documentDate": "2026-05-01"}
    # documentDate is earlier in DATE_FIELDS so it wins
    assert first_date(item) == date(2026, 5, 1)


def test_in_year_true():
    assert in_year({"documentDate": "2026-01-30"}, 2026) is True


def test_in_year_false():
    assert in_year({"documentDate": "2024-01-30"}, 2026) is False


def test_in_year_no_date_returns_false():
    assert in_year({"foo": "bar"}, 2026) is False


def test_has_no_date():
    assert has_no_date({"foo": "bar"}) is True
    assert has_no_date({"documentDate": "2026-01-01"}) is False
