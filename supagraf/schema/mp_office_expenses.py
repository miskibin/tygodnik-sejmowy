"""MP office expense report schema.

Mirrors the structure of `_stage_mp_office_expenses.payload` (jsonb). One
fixture JSON per (term, mp_id, year) — one annual report. Items list has
23 rows aligned with `mp_office_expense_categories.code`.

Source: Załącznik nr 1 do zarządzenia nr 2 Marszałka Sejmu z 31 III 2017.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class MPOfficeExpenseItem(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    category_code: int = Field(ge=1, le=23)
    amount: Decimal = Field(default=Decimal("0"))
    notes: str | None = None


class MPOfficeExpenseReport(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    term: int
    mp_id: int
    year: int = Field(ge=2015, le=2099)
    period_start: date | None = None
    period_end: date | None = None
    funds_allocated: Decimal | None = None
    funds_carryover: Decimal | None = None
    funds_interest: Decimal | None = None
    funds_total: Decimal | None = None
    funds_spent: Decimal | None = None
    funds_remaining: Decimal | None = None
    source_url: str
    source_sha256: str | None = None
    published_at: date | None = None
    approved_by_presidium_at: date | None = None
    items: list[MPOfficeExpenseItem] = Field(default_factory=list)
