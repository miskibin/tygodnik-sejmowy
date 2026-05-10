"""Party promise corpus.

Source: NOT api.sejm.gov.pl. Manually curated from party manifestos, "100
konkretow", coalition agreements, ministerial declarations. Each promise
is reviewed before publication; status is updated by reviewers as the
ledger evolves.

Status values (English):
- fulfilled              -- promise met by passed legislation
- in_progress            -- bill submitted, in legislative pipeline
- broken                 -- explicitly walked back
- contradicted_by_vote   -- vote went against the promise
- no_action              -- no observable action since election
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


PromiseStatus = Literal[
    "fulfilled",
    "in_progress",
    "broken",
    "contradicted_by_vote",
    "no_action",
]


class Promise(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    slug: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    party_code: str = Field(min_length=1, max_length=20)
    title: str = Field(min_length=1, max_length=200)
    normalized_text: str = Field(min_length=1)
    source_year: int = Field(ge=1991)
    source_url: str
    status: PromiseStatus
    source_quote: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    reviewer: str | None = None
    last_reviewed_at: datetime | None = None
