"""Bill schema. /sejm/term{N}/bills (RPW projects).

Flat resource. natural_id == `number` (slash-form, e.g. 'RPW/10073/2026').
File name uses underscores ('RPW_10073_2026.json'), in-file `number` uses slashes.
Use the in-file `number` as natural id.

Audit (175 RPW_*.json fixtures, term=10):
  applicantType:  DEPUTIES|GOVERNMENT|PRESIDENT|COMMITTEE|PRESIDIUM|SENATE
  submissionType: BILL|DRAFT_RESOLUTION|BILL_AMENDMENT|RESOLUTION_AMENDMENT
  status:         ACTIVE|NOT_PROCEEDED
No nulls in any field where field is present. Optional fields appear in subsets:
  description (129/175), print (121/175), sendersNumber (64/175),
  publicConsultationStartDate (52/175), publicConsultationEndDate (52/175).
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


ApplicantType = Literal[
    "DEPUTIES", "GOVERNMENT", "PRESIDENT", "COMMITTEE", "PRESIDIUM", "SENATE",
    "CITIZENS",
]
SubmissionType = Literal[
    "BILL", "DRAFT_RESOLUTION", "BILL_AMENDMENT", "RESOLUTION_AMENDMENT"
]
BillStatus = Literal["ACTIVE", "NOT_PROCEEDED", "WITHDRAWN"]


class Bill(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    # Required (present in all 175 fixtures)
    term: int
    number: str
    title: str
    applicant_type: ApplicantType = Field(alias="applicantType")
    submission_type: SubmissionType = Field(alias="submissionType")
    status: BillStatus
    eu_related: bool = Field(alias="euRelated")
    public_consultation: bool = Field(alias="publicConsultation")
    consultation_results: bool = Field(alias="consultationResults")
    date_of_receipt: date = Field(alias="dateOfReceipt")

    # Optional (subset presence; never null when present)
    description: str | None = None
    print: str | None = None  # numeric string, FK'd against prints(term, number) at load
    senders_number: str | None = Field(default=None, alias="sendersNumber")
    public_consultation_start_date: date | None = Field(
        default=None, alias="publicConsultationStartDate"
    )
    public_consultation_end_date: date | None = Field(
        default=None, alias="publicConsultationEndDate"
    )
    withdrawn_date: date | None = Field(default=None, alias="withdrawnDate")
