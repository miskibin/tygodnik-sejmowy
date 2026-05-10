"""Stage layer: fixture JSON → _stage_* tables (raw payloads, idempotent).

Each module exposes `stage(term: int = 10) -> StageReport` which returns
{records_seen, records_upserted, errors}.
"""
