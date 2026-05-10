"""Stage club fixtures → _stage_clubs."""
from __future__ import annotations

from supagraf.schema.clubs import Club
from supagraf.stage.base import StageReport, stage_resource


def stage(term: int = 10) -> StageReport:
    return stage_resource(
        resource="clubs",
        table="_stage_clubs",
        model=Club,
        natural_id=lambda obj, _path: obj.id,
        term=term,
    )
