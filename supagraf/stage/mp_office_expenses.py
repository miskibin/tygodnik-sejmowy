"""Stage mp_office_expenses fixtures → _stage_mp_office_expenses."""
from __future__ import annotations

from supagraf.schema.mp_office_expenses import MPOfficeExpenseReport
from supagraf.stage.base import StageReport, stage_resource


def stage(term: int = 10) -> StageReport:
    return stage_resource(
        resource="mp_office_expenses",
        table="_stage_mp_office_expenses",
        model=MPOfficeExpenseReport,
        natural_id=lambda obj, _path: f"{obj.mp_id}__{obj.year}",
        term=term,
    )
