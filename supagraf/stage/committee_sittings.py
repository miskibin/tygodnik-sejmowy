"""Stage committee_sittings fixtures → _stage_committee_sittings."""
from __future__ import annotations

from supagraf.schema.committee_sittings import CommitteeSittingsBundle
from supagraf.stage.base import StageReport, stage_resource


def stage(term: int = 10) -> StageReport:
    return stage_resource(
        resource="committee_sittings",
        table="_stage_committee_sittings",
        model=CommitteeSittingsBundle,
        natural_id=lambda obj, _path: obj.code,
        term=term,
    )
