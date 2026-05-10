"""Stage external promise fixtures.

Promises are NOT term-bound (they live across multiple Sejm terms). The
`term` column in _stage_promises is kept only for orchestrator symmetry --
the staging API expects every resource to be staged per term. We pass
term=10 by convention.
"""
from __future__ import annotations

from supagraf.schema.promises import Promise
from supagraf.stage.base import StageReport, stage_resource


def stage_promises(term: int = 10) -> StageReport:
    return stage_resource(
        resource="promises",
        table="_stage_promises",
        model=Promise,
        natural_id=lambda obj, _path: f"{obj.party_code}__{obj.slug}",
        term=term,
        subdir="external",
    )
