"""Stage bill fixtures → _stage_bills."""
from __future__ import annotations

from supagraf.schema.bills import Bill
from supagraf.stage.base import StageReport, stage_resource


def stage(term: int = 10) -> StageReport:
    # natural_id = in-file `number` (slash form 'RPW/10073/2026'),
    # NOT the underscore filename stem.
    return stage_resource(
        resource="bills",
        table="_stage_bills",
        model=Bill,
        natural_id=lambda obj, _path: obj.number,
        term=term,
    )
