"""Stale-ELI refresher.

Sejm passes a bill on day N, the President signs ~N+30, Dz.U./M.P. publish
~N+45. `sync acts` picks the act up once it appears in the changes feed, but
the *process → act* link needs the process's own `ELI` field, which the
process feed only bumps when Sejm edits the process. So: for passed
processes without `eli_act_id`, re-pull the process JSON, and when it now
carries an ELI, fetch that one act straight into `_stage_acts`.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from loguru import logger

from supagraf.db import call_rpc_scalar, supabase
from supagraf.load import _rpc_int
from supagraf.schema.acts import ActIn
from supagraf.sync import stage
from supagraf.sync.http import SejmApi


def refresh_stale_eli(term: int = 10, max_age_days: int = 7) -> dict:
    """Returns counters; every failure is logged and skipped."""
    sb = supabase()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max_age_days)).isoformat()
    rows = (
        sb.table("processes").select("number, eli")
        .eq("term", term).eq("passed", True).is_("eli_act_id", "null")
        .or_(f"last_refreshed_at.is.null,last_refreshed_at.lt.{cutoff}")
        .execute().data or []
    )
    out = {"candidates": len(rows), "refreshed_processes": 0, "fetched_acts": 0, "linked_after": 0}
    if not rows:
        return out
    errors: list[tuple[str, str]] = []
    now_iso = datetime.now(timezone.utc).isoformat()
    with SejmApi(concurrency=2) as api:
        procs = api.map(lambda r: api.get_json(f"/sejm/term{term}/processes/{r['number']}"), rows, label="stale-eli")
        act_rows: list[dict] = []
        for r, proc, exc in procs:
            if exc is not None or not isinstance(proc, dict):
                logger.warning("refresh_stale_eli: process {} failed: {!r}", r["number"], exc)
                continue
            out["refreshed_processes"] += 1
            eli = proc.get("ELI") or proc.get("eli")
            if not eli:
                continue
            act = api.get_json(f"/eli/acts/{eli}")
            if act is None:
                logger.info("refresh_stale_eli: act {} not published yet", eli)
                continue
            if err := stage.validate(ActIn, act):
                errors.append((eli, err))
                continue
            act_rows.append({"eli_id": eli, "payload": act, "source_path": api.url(f"/eli/acts/{eli}"),
                             "captured_at": now_iso})
    out["fetched_acts"] = stage.upsert_rows("_stage_acts", act_rows, on_conflict="eli_id", errors=errors)
    if act_rows:
        _rpc_int("load_acts", term)
    out["linked_after"] = int(call_rpc_scalar("backfill_process_act_links", {"p_term": term}) or 0)
    sb.table("processes").update({"last_refreshed_at": now_iso}).eq("term", term) \
        .in_("number", [r["number"] for r in rows]).execute()
    if errors:
        out["errors"] = errors[:5]
    logger.info("refresh_stale_eli: {}", out)
    return out
