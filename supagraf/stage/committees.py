"""Stage committee fixtures → _stage_committees."""
from __future__ import annotations

from supagraf.schema.committees import Committee
from supagraf.stage.base import StageReport, stage_resource


def stage(term: int = 10) -> StageReport:
    return stage_resource(
        resource="committees",
        table="_stage_committees",
        model=Committee,
        natural_id=lambda obj, _path: obj.code,
        term=term,
    )
