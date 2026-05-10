"""Process schema. /sejm/term{N}/processes/{number}.

Legislative process record + recursive stages tree. All observed fields modeled
explicitly with `extra="forbid"` so silent drift in upstream API blows up tests
rather than being lost. Field aliases use the upstream camelCase names.

Audit (164 fixtures, 1194 stages, max depth 1):
  * UE values: 'NO' | 'ENFORCEMENT' (NOT 'YES'/'NO')
  * passed: bool, never null in current data (kept Optional for in-progress)
  * urgencyStatus: 'NORMAL' | 'URGENT'
  * 25 stages have NO stageType (kept Optional)
  * rapporteurID arrives as STRING (not int) — coerced
  * Voting child stages carry a nested `voting` dict
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


UeFlag = Literal["NO", "YES", "ENFORCEMENT"]
UrgencyStatus = Literal["NORMAL", "URGENT"]


class ProcessLink(BaseModel):
    """Top-level external link entry. Observed rels: isap | eli | eli-api."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    href: str
    rel: str


class ProcessStageNode(BaseModel):
    """One node in the stages tree.

    Recursive (children: list[ProcessStageNode]). All known fields modeled.
    """
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    # core (root + children)
    stage_name: str = Field(alias="stageName")
    stage_type: str | None = Field(default=None, alias="stageType")
    stage_date: date | None = Field(default=None, alias="date")

    # nesting
    children: list["ProcessStageNode"] = Field(default_factory=list)

    # child-typical fields (also seen on root sometimes)
    committee_code: str | None = Field(default=None, alias="committeeCode")
    print_number: str | None = Field(default=None, alias="printNumber")
    rapporteur_id: str | None = Field(default=None, alias="rapporteurID")
    rapporteur_name: str | None = Field(default=None, alias="rapporteurName")
    proposal: str | None = None
    sub_committee: bool | None = Field(default=None, alias="subCommittee")
    minority_motions: int | None = Field(default=None, alias="minorityMotions")
    report_file: str | None = Field(default=None, alias="reportFile")
    node_type: str | None = Field(default=None, alias="type")
    report_date: date | None = Field(default=None, alias="reportDate")
    remarks: str | None = None

    # root-typical fields
    sitting_num: int | None = Field(default=None, alias="sittingNum")
    decision: str | None = None
    comment: str | None = None
    text_after3: str | None = Field(default=None, alias="textAfter3")
    position: str | None = None
    omitted_inconsistent: bool | None = Field(default=None, alias="omittedInconsistent")
    organ: str | None = None
    other_documents: list | dict | None = Field(default=None, alias="otherDocuments")
    continued_on: list[date] | None = Field(default=None, alias="continuedOn")
    voting: dict | None = None
    # Sejm API surfaces a `title` on certain stage nodes (e.g. Government
    # position drafts, opinion documents). Accept as optional pass-through.
    title: str | None = None


# Pydantic V2: forward-reference rebuild for recursive children.
ProcessStageNode.model_rebuild()


class Process(BaseModel):
    """Top-level process record."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    term: int
    number: str
    title: str
    title_final: str | None = Field(default=None, alias="titleFinal")
    description: str | None = None
    document_type: str | None = Field(default=None, alias="documentType")
    document_type_enum: str | None = Field(default=None, alias="documentTypeEnum")
    document_date: date | None = Field(default=None, alias="documentDate")
    closure_date: date | None = Field(default=None, alias="closureDate")
    process_start_date: date | None = Field(default=None, alias="processStartDate")
    change_date: datetime | None = Field(default=None, alias="changeDate")
    web_generated_date: datetime | None = Field(default=None, alias="webGeneratedDate")

    ue_flag: UeFlag | None = Field(default=None, alias="UE")
    passed: bool | None = None
    principle_of_subsidiarity: bool | None = Field(default=None, alias="principleOfSubsidiarity")
    shorten_procedure: bool | None = Field(default=None, alias="shortenProcedure")
    legislative_committee: bool | None = Field(default=None, alias="legislativeCommittee")
    urgency_status: UrgencyStatus | None = Field(default=None, alias="urgencyStatus")

    rcl_link: str | None = Field(default=None, alias="rclLink")
    rcl_num: str | None = Field(default=None, alias="rclNum")
    eli: str | None = Field(default=None, alias="ELI")
    address: str | None = None
    display_address: str | None = Field(default=None, alias="displayAddress")
    comments: str | None = None
    prints_considered_jointly: list[str] | None = Field(
        default=None, alias="printsConsideredJointly"
    )
    other_documents: list | dict | None = Field(default=None, alias="otherDocuments")
    links: list[ProcessLink] = Field(default_factory=list)

    stages: list[ProcessStageNode] = Field(default_factory=list)
