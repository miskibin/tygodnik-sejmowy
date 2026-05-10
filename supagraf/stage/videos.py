"""Stage video fixtures -> _stage_videos."""
from __future__ import annotations

from supagraf.schema.videos import Video
from supagraf.stage.base import StageReport, stage_resource


def stage(term: int = 10) -> StageReport:
    return stage_resource(
        resource="videos",
        table="_stage_videos",
        model=Video,
        natural_id=lambda obj, _path: obj.unid,
        term=term,
    )
