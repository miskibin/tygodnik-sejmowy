"""Stage print fixtures → _stage_prints."""
from __future__ import annotations

from supagraf.schema.prints import Print
from supagraf.stage.base import StageReport, stage_resource


def stage(term: int = 10) -> StageReport:
    return stage_resource(
        resource="prints",
        table="_stage_prints",
        model=Print,
        natural_id=lambda obj, _path: obj.number,
        term=term,
    )
