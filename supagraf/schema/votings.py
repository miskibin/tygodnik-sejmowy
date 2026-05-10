"""Voting schema. /sejm/term{N}/votings/{sitting}/{num}."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

VoteChoice = Literal["YES", "NO", "ABSTAIN", "ABSENT", "PRESENT"]
VotingKind = Literal["ELECTRONIC", "ON_LIST", "TRADITIONAL"]
MajorityType = Literal[
    "SIMPLE_MAJORITY",
    "ABSOLUTE_MAJORITY",
    "ABSOLUTE_STATUTORY_MAJORITY",
    "STATUTORY_MAJORITY",
    "MAJORITY_THREE_FIFTHS",
    "MAJORITY_TWO_THIRDS",
]


class Link(BaseModel):
    model_config = ConfigDict(extra="forbid")
    href: str
    rel: str


class VoteRow(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    mp: int = Field(alias="MP")
    club: str
    first_name: str = Field(alias="firstName")
    last_name: str = Field(alias="lastName")
    second_name: str | None = Field(default=None, alias="secondName")
    vote: VoteChoice
    list_votes: dict[str, VoteChoice] | None = Field(default=None, alias="listVotes")


class Voting(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    term: int
    sitting: int
    sitting_day: int = Field(alias="sittingDay")
    voting_number: int = Field(alias="votingNumber")
    date: datetime
    title: str
    topic: str
    description: str | None = None
    kind: VotingKind
    majority_type: MajorityType = Field(alias="majorityType")
    majority_votes: int = Field(alias="majorityVotes")
    yes: int
    no: int
    abstain: int
    present: int
    not_participating: int = Field(alias="notParticipating")
    total_voted: int = Field(alias="totalVoted")
    votes: list[VoteRow]
    links: list[Link] = []
