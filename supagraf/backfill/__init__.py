"""Backfill jobs that populate new tables/columns added in migration 0047
and fix data anomalies (Wave 1 of ETL review).

All functions are idempotent — they use ON CONFLICT DO NOTHING (links) or
conditional UPDATE (columns), so safe to re-run. No external API calls;
pure DB transforms + LLM-extracted regex.
"""
from __future__ import annotations

from supagraf.backfill.etl_review import (  # noqa: F401
    backfill_voting_print_links,
    backfill_opinion_source,
    backfill_prints_considered_jointly,
    backfill_autopoprawka_relations,
    backfill_rapporteur_mp_ids,
    backfill_committee_ids,
    backfill_statement_print_links,
    backfill_is_procedural_substantive,
    reclassify_main_role_by_polarity,
    run_all,
)
from supagraf.backfill.mp_club_history import (  # noqa: F401
    backfill_mp_club_history,
)
from supagraf.backfill.committee_sitting_links import (  # noqa: F401
    backfill_print_committee_sitting_links,
)
from supagraf.backfill.motion_polarity import (  # noqa: F401
    backfill_motion_polarity,
    classify as classify_motion_polarity,
)
