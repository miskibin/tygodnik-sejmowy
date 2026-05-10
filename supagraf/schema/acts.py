"""Pydantic schema for ELI acts. Source: api.sejm.gov.pl/eli/acts/{publisher}/{year}/{position}.

Verified shape (live calls 2026-05-05):
  list:   GET /eli/acts/{pub}/{year}     -> {count, items: [...], totalCount, ...}
  detail: GET /eli/acts/{pub}/{year}/{p} -> full act with `references` dict, `prints[]`, etc.

The detail response uses `pos` (int) for the position. We accept either `pos`
or `position` to keep the schema robust against future API drift.

Polish API category names in `references` are kept as-is in the staged payload —
they're normalized to canonical relation_type enum on the SQL side
(_normalize_act_relation in 0037). Pydantic just validates the shape.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ActPrintRef(BaseModel):
    """An entry under detail.prints[] -- link from act back to a Sejm print."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)
    # API may add fields; we only extract what we need.
    number: Optional[str] = None
    term: Optional[int] = None
    link: Optional[str] = None
    link_print_api: Optional[str] = Field(default=None, alias="linkPrintAPI")
    link_process_api: Optional[str] = Field(default=None, alias="linkProcessAPI")


class ActText(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)
    file_name: Optional[str] = Field(default=None, alias="fileName")
    type: Optional[str] = None


class ActIn(BaseModel):
    """One ELI act detail payload. Input model for fixture validation.

    `extra="forbid"` is too strict for the live API which carries fields we don't
    yet care about (and frequently adds new ones); we use `extra="ignore"` here
    so the staging stays robust. The contract test still pins the fields we do
    care about. Strict-forbid is on the relation enum/CHECK side instead.
    """

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    eli_id: str = Field(alias="ELI")
    publisher: str
    year: int
    # API uses "pos"; older docs may use "position". Accept either.
    position: int = Field(alias="pos")
    type: str
    title: str
    status: Optional[str] = None
    in_force: Optional[str] = Field(default=None, alias="inForce")
    announcement_date: Optional[date] = Field(default=None, alias="announcementDate")
    promulgation_date: Optional[date] = Field(default=None, alias="promulgation")
    legal_status_date: Optional[date] = Field(default=None, alias="legalStatusDate")
    change_date: Optional[datetime] = Field(default=None, alias="changeDate")
    address: Optional[str] = None
    display_address: Optional[str] = Field(default=None, alias="displayAddress")
    keywords: list[str] = Field(default_factory=list)
    term: Optional[int] = None
    # references is a dict[str, list[dict]] — keep raw on payload, no Pydantic shred
    references: dict[str, Any] = Field(default_factory=dict)
    prints: list[ActPrintRef] = Field(default_factory=list)
    texts: list[ActText] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _coerce_position(cls, data: Any) -> Any:
        """Accept either 'pos' or 'position' on input. We alias to 'pos' but
        a stray 'position' key shouldn't break validation."""
        if isinstance(data, dict):
            if "pos" not in data and "position" in data:
                data = {**data, "pos": data["position"]}
        return data


class ActListItem(BaseModel):
    """One entry in the list endpoint (GET /eli/acts/{pub}/{year}).items[]."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)
    eli_id: str = Field(alias="ELI")
    publisher: str
    year: int
    position: int = Field(alias="pos")
    title: str
    type: str
    status: Optional[str] = None


class ActListPage(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)
    count: int
    total_count: int = Field(alias="totalCount")
    offset: int = 0
    items: list[ActListItem]
