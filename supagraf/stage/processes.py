"""Stage process fixtures -> _stage_processes."""
from __future__ import annotations

from supagraf.schema.processes import Process
from supagraf.stage.base import StageReport, stage_resource


def stage(term: int = 10) -> StageReport:
    return stage_resource(
        resource="processes",
        table="_stage_processes",
        model=Process,
        natural_id=lambda obj, _path: obj.number,
        term=term,
    )
