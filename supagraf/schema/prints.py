"""Print schema. /sejm/term{N}/prints/{number}.

`additionalPrints` carries nested sub-prints (errata/opinions linked to the
parent number) — Phase A retains them on the payload but we only persist the
top-level Print into the relational table; nested entries are not flattened
yet. Schema validates the nested shape so we don't lose visibility on drift.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _strip(v):
    """Upstream ships stray whitespace in a few numbers ("1041-004\\n") and in
    attachment filenames. Unstripped they reach the fetch layer verbatim and
    make the request URL invalid, so normalise at the schema boundary."""
    if isinstance(v, str):
        return v.strip()
    if isinstance(v, list):
        return [x.strip() if isinstance(x, str) else x for x in v]
    return v


class AdditionalPrint(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    _strip_text = field_validator("number", "attachments", mode="before")(_strip)

    term: int
    number: str
    title: str
    attachments: list[str]
    process_print: list[str] = Field(alias="processPrint", default_factory=list)
    number_associated: list[str] = Field(alias="numberAssociated", default_factory=list)
    change_date: datetime = Field(alias="changeDate")
    delivery_date: date = Field(alias="deliveryDate")
    document_date: date = Field(alias="documentDate")


class Print(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    _strip_text = field_validator("number", "attachments", mode="before")(_strip)

    term: int
    number: str
    title: str
    attachments: list[str]
    process_print: list[str] = Field(alias="processPrint", default_factory=list)
    # Some upstream prints carry a `numberAssociated` cross-reference list
    # (mirrors AdditionalPrint). Optional — absent on most rows.
    number_associated: list[str] = Field(alias="numberAssociated", default_factory=list)
    change_date: datetime = Field(alias="changeDate")
    # deliveryDate is missing on a handful of prints (~0.5%) — make optional.
    delivery_date: Optional[date] = Field(alias="deliveryDate", default=None)
    document_date: date = Field(alias="documentDate")
    additional_prints: list[AdditionalPrint] = Field(
        alias="additionalPrints", default_factory=list
    )
