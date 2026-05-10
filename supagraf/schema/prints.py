"""Print schema. /sejm/term{N}/prints/{number}.

`additionalPrints` carries nested sub-prints (errata/opinions linked to the
parent number) — Phase A retains them on the payload but we only persist the
top-level Print into the relational table; nested entries are not flattened
yet. Schema validates the nested shape so we don't lose visibility on drift.
"""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class AdditionalPrint(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

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

    term: int
    number: str
    title: str
    attachments: list[str]
    process_print: list[str] = Field(alias="processPrint", default_factory=list)
    change_date: datetime = Field(alias="changeDate")
    delivery_date: date = Field(alias="deliveryDate")
    document_date: date = Field(alias="documentDate")
    additional_prints: list[AdditionalPrint] = Field(
        alias="additionalPrints", default_factory=list
    )
