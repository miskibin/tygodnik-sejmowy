"""Stage voting fixtures → _stage_votings."""
from __future__ import annotations

from supagraf.schema.votings import Voting
from supagraf.stage.base import StageReport, stage_resource


def stage(term: int = 10) -> StageReport:
    return stage_resource(
        resource="votings",
        table="_stage_votings",
        model=Voting,
        natural_id=lambda obj, _path: f"{obj.sitting}__{obj.voting_number}",
        term=term,
    )
