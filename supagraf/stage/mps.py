"""Stage MP fixtures → _stage_mps."""
from __future__ import annotations

from supagraf.schema.mps import MP
from supagraf.stage.base import StageReport, stage_resource


def stage(term: int = 10) -> StageReport:
    return stage_resource(
        resource="mps",
        table="_stage_mps",
        model=MP,
        natural_id=lambda obj, _path: str(obj.id),
        term=term,
    )
