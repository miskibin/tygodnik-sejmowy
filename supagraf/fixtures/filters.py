from datetime import date, datetime
from typing import Iterable, Optional


DATE_FIELDS = (
    "documentDate",
    "deliveryDate",
    "receiptDate",
    "dateOfReceipt",
    "startDateTime",
    "date",
    "processStartDate",
    "closureDate",
    "changeDate",
    "lastModified",
    "sent",
)


def parse_date(value: object) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        s = value[:10]
        try:
            return date.fromisoformat(s)
        except ValueError:
            return None
    return None


def first_date(item: dict, fields: Iterable[str] = DATE_FIELDS) -> Optional[date]:
    for f in fields:
        v = item.get(f)
        d = parse_date(v)
        if d is not None:
            return d
    return None


def in_year(item: dict, year: int, fields: Iterable[str] = DATE_FIELDS) -> bool:
    """True if any known date field on item falls in the given year.

    If item has no parseable date at all, returns False — caller decides
    whether to keep date-less rows separately.
    """
    d = first_date(item, fields)
    return d is not None and d.year == year


def has_no_date(item: dict, fields: Iterable[str] = DATE_FIELDS) -> bool:
    return first_date(item, fields) is None
