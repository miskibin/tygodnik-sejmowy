"""The daily updater. `python -m supagraf daily` ends up here.

Phases (each a ledger step; a failing step is recorded and the run goes on):

  0. schema   migration 0105 present, else refuse to run
  1. sync     every upstream resource → `_stage_*` (only changes), photos, polls
  2. load     `load_*` for dirty resources only, then the relinks/backfills
              that depend on what changed
  3. enrich   unified LLM pass on new prints, flash pass on the newest
              sitting's statements, voting short titles
  4. embed    qwen3 embeddings for prints / statements / promises
  5. refresh  matviews whose inputs changed
  6. finish   `etl_runs` row stamped; exit code 1 if any step failed

`--skip-fetch` treats every resource as dirty (there is nothing to diff
against), which reproduces the old "reload everything" behaviour.
"""
from __future__ import annotations

import importlib
import json
import os
from typing import Any, Callable

from loguru import logger

from supagraf.sync.context import SyncContext
from supagraf.sync.http import SejmApi
from supagraf.sync.loaders import run_loaders, run_refreshes
from supagraf.sync.load_recovery import PendingLoad, clear_pending, merge_pending, read_pending, write_pending
from supagraf.sync.runlog import RunLedger, ensure_schema
from supagraf.sync.stage import SyncResult

# Sync order is cosmetic; every resource sync is independent (the FK order
# lives in loaders.LOAD_CHAIN).
RESOURCES: tuple[str, ...] = (
    "mps", "clubs", "committees", "committee_sittings",
    "prints", "processes", "proceedings", "votings",
    "bills", "videos", "questions", "acts",
)
EXTERNAL: frozenset[str] = frozenset({"districts", "postcodes", "promises", "mp_office_expenses", "polls"})


def _resource_fn(name: str) -> Callable[[SyncContext], SyncResult]:
    return importlib.import_module(f"supagraf.sync.resources.{name}").sync


def _run(ledger: RunLedger, name: str, fn: Callable[[], dict[str, Any] | None]) -> dict[str, Any]:
    """One ledger step around `fn`; its returned counts land on the step and
    a non-zero `failed`/`errors` count marks the step failed."""
    with ledger.step(name) as step:
        step.counts = fn() or {}
        bad = {k: v for k, v in step.counts.items() if k in ("failed", "errors", "aborted") and v}
        if bad:
            step.fail(f"{name}: {bad}")
    return step.counts


def sync_resources(ctx: SyncContext, ledger: RunLedger, names: tuple[str, ...] = RESOURCES) -> None:
    for name in names:
        def one(name=name) -> dict:
            res = _resource_fn(name)(ctx)
            counts = res.to_counts()
            if res.errors:
                counts["error"] = f"{len(res.errors)} item errors, e.g. {res.errors[0]}"
            return counts
        _run(ledger, f"sync:{name}", one)


def _sync_phase(ctx: SyncContext, ledger: RunLedger, only: tuple[str, ...] | None) -> None:
    sync_resources(ctx, ledger, tuple(n for n in RESOURCES if not only or n in only))
    _run(ledger, "sync:http", lambda: ctx.api.stats.to_dict())
    if not only or "mp_photos" in only:
        from supagraf.fetch.mp_photos import fetch_mp_photos
        _run(ledger, "sync:mp_photos", lambda: fetch_mp_photos(term=ctx.term).to_dict())
    if not only or "polls" in only:
        from supagraf.fetch.polls import fetch_polls
        from supagraf.stage.polls import stage_polls_from_wikipedia

        def polls() -> dict:
            inserted, updated = stage_polls_from_wikipedia(fetch_polls())
            ctx.mark("polls", bool(inserted or updated))
            return {"inserted": inserted, "updated": updated}
        _run(ledger, "sync:polls", polls)


def _load_phase(ctx: SyncContext, ledger: RunLedger, full: bool) -> bool:
    from supagraf.backfill import backfill_print_committee_sitting_links
    from supagraf.backfill.agenda_refs import relink_agenda_print_refs
    from supagraf.backfill.mp_club_history import backfill_mp_club_history
    from supagraf.backfill.sitting_links import relink_changed_sittings
    from supagraf.db import call_rpc_scalar
    from supagraf.fetch.acts import refresh_stale_eli

    term, dirty = ctx.term, ctx.dirty
    first_step = len(ledger.steps)
    _run(ledger, "load", lambda: {"dirty": sorted(dirty),
                                  **run_loaders(term, dirty, full=full, changed_keys=ctx.changed_keys)})
    if ledger.steps[-1].status == "failed":
        return False
    if {"prints", "processes"} & dirty and "proceedings" not in dirty:
        _run(ledger, "load:relink_agenda_refs", lambda: relink_agenda_print_refs(term=term))
    if {"prints", "committee_sittings"} & dirty or full:
        _run(ledger, "backfill:print_committee_sitting_links",
             lambda: dict(backfill_print_committee_sitting_links(term=term) or {}))
    if {"acts", "processes"} & dirty or full:
        _run(ledger, "backfill:process_act_links",
             lambda: {"affected": call_rpc_scalar("backfill_process_act_links", {"p_term": term})})
    if "votings" in dirty or full:
        _run(ledger, "backfill:mp_club_history", lambda: dict(backfill_mp_club_history(term=term) or {}))
    if {"proceedings", "votings", "prints"} & dirty or full:
        _run(ledger, "backfill:sitting_links", lambda: relink_changed_sittings(
            term=term, sittings=ctx.changed_keys.get("proceedings", set()) | ctx.changed_keys.get("votings", set()),
            full=full, today=ctx.today, window_days=ctx.window_days))

    def stale_eli() -> dict:
        out = refresh_stale_eli(term=term)
        ctx.mark("acts", bool(out.get("fetched_acts")))
        return {k: v for k, v in out.items() if k != "sample_eli"}
    _run(ledger, "backfill:refresh_stale_eli", stale_eli)
    return not any(s.status == "failed" for s in ledger.steps[first_step:])


def _enrich_phase(ctx: SyncContext, ledger: RunLedger, workers: int | None) -> None:
    from supagraf.enrich.jobs import DEFAULT_WORKERS, enrich_pending_prints, enrich_pending_statements
    from supagraf.enrich.llm import is_deepseek_peak_hour
    from supagraf.enrich.voting_short_title import enrich_votings

    if is_deepseek_peak_hour():
        logger.warning("DeepSeek peak pricing window (weekdays 01-04 & 06-10 UTC) — enrichment costs 2x")
    w, term = workers or DEFAULT_WORKERS, ctx.term
    _run(ledger, "enrich:prints", lambda: enrich_pending_prints(term=term, workers=w).to_dict())
    from supagraf.enrich.story_images import run_images
    _run(ledger, "enrich:images", lambda: run_images(term=term))
    _run(ledger, "enrich:statements", lambda: enrich_pending_statements(term=term, workers=w).to_dict())
    _run(ledger, "enrich:voting_short_title",
         lambda: dict(zip(("fast", "llm", "failed"), enrich_votings(term=term, days=30))))
    if os.environ.get("SUPAGRAF_ENABLE_ACT_SHORT_TITLE") == "1":
        from supagraf.enrich.act_short_title import enrich_acts
        _run(ledger, "enrich:act_short_title", lambda: dict(zip(("llm", "failed"), enrich_acts(days=30))))


def _embed_phase(ctx: SyncContext, ledger: RunLedger) -> None:
    from supagraf.cli import cmd_enrich_promises
    from supagraf.enrich.embed_statement import embed_pending_statements
    from supagraf.enrich.jobs import embed_pending_prints

    limit, term = int(os.environ.get("SUPAGRAF_EMBED_LIMIT", "0") or 0), ctx.term
    _run(ledger, "embed:prints", lambda: embed_pending_prints(term=term, limit=limit).to_dict())
    _run(ledger, "embed:statements",
         lambda: dict(zip(("ok", "failed"), embed_pending_statements(term=term, limit=limit))))
    _run(ledger, "embed:promises", lambda: cmd_enrich_promises(kind="embed", limit=limit))


def _network_phase(ctx: SyncContext, ledger: RunLedger, *, skip_load: bool, load_succeeded: bool) -> None:
    """Publish only when source dependencies are healthy. Retry every daily run.

    A bounded rebuild also expires documents outside the rolling time window,
    even when upstream is unchanged, and retries earlier publication failures.
    """
    dependencies = {"sync:mps", "sync:clubs", "sync:questions", "sync:votings",
                    "sync:prints", "sync:processes", "load", "backfill:sitting_links"}
    if skip_load or not load_succeeded or any(s.name in dependencies for s in ledger.failed_steps):
        ledger.skip("network", "source sync/load incomplete or --skip-load; previous snapshot preserved")
        return
    from supagraf.network_publish import refresh_network
    _run(ledger, "network", lambda: refresh_network(term=ctx.term))


def run_daily(
    *,
    term: int = 10,
    skip_fetch: bool = False,
    skip_load: bool = False,
    skip_enrich: bool = False,
    skip_embed: bool = False,
    full: bool = False,
    window_days: int = 14,
    only: tuple[str, ...] | None = None,
    workers: int | None = None,
    concurrency: int = 8,
    persist_ledger: bool = True,
    api: SejmApi | None = None,
) -> RunLedger:
    from supagraf.enrich.llm import usage_snapshot, usage_since
    usage0 = usage_snapshot()
    ledger = RunLedger(kind="daily", term=term, persist=persist_ledger, args={
        "skip_fetch": skip_fetch, "skip_load": skip_load, "skip_enrich": skip_enrich,
        "skip_embed": skip_embed, "full": full, "window_days": window_days, "only": only})
    with ledger.step("schema", fatal=True):
        ensure_schema()
    ledger.start()
    own_api = api is None
    api = api or SejmApi(concurrency=concurrency)
    ctx = SyncContext(term=term, api=api, full=full, window_days=window_days)
    load_succeeded = True
    try:
        if skip_fetch:
            ledger.skip("sync", "--skip-fetch (all resources treated as dirty)")
            ctx.dirty |= set(RESOURCES) | EXTERNAL
        else:
            _sync_phase(ctx, ledger, only)

        if full:
            # Preserve the complete plan for a retry even if --full found no diff.
            ctx.dirty |= set(RESOURCES) | EXTERNAL
            ctx.changed_keys.clear()

        pending: PendingLoad | None = None
        with ledger.step("load:recover") as step:
            pending = merge_pending(
                PendingLoad(dirty=set(ctx.dirty), changed_keys={k: set(v) for k, v in ctx.changed_keys.items()}),
                read_pending(term),
            )
            ctx.dirty, ctx.changed_keys = pending.dirty, pending.changed_keys
            step.counts = {"dirty": sorted(ctx.dirty)}
        if ledger.steps[-1].status == "failed":
            load_succeeded = False
            ledger.skip("load", "pending-load cursor unavailable")
        elif ctx.dirty or full:
            with ledger.step("load:checkpoint") as step:
                write_pending(term, pending or PendingLoad())
                step.counts = {"dirty": sorted(ctx.dirty)}
            if ledger.steps[-1].status == "failed":
                load_succeeded = False
                ledger.skip("load", "pending-load checkpoint failed")
            elif skip_load:
                ledger.skip("load", "--skip-load; pending checkpoint preserved")
            else:
                load_succeeded = _load_phase(ctx, ledger, full)
                if load_succeeded:
                    with ledger.step("load:clear_checkpoint"):
                        clear_pending(term)
                    load_succeeded = ledger.steps[-1].status != "failed"
        elif skip_load:
            ledger.skip("load", "--skip-load")
        else:
            ledger.skip("load", "nothing changed upstream")

        if not load_succeeded:
            ledger.skip("enrich", "load failed")
        elif skip_enrich:
            ledger.skip("enrich", "--skip-enrich")
        else:
            _enrich_phase(ctx, ledger, workers)

        if not load_succeeded:
            ledger.skip("embed", "load failed")
        elif skip_embed or os.environ.get("SUPAGRAF_DAILY_SKIP_EMBED") == "1":
            ledger.skip("embed", "--skip-embed / SUPAGRAF_DAILY_SKIP_EMBED")
        else:
            _embed_phase(ctx, ledger)

        if not load_succeeded:
            ledger.skip("refresh", "load failed")
        elif skip_load:
            ledger.skip("refresh", "--skip-load")
        else:
            _run(ledger, "refresh", lambda: run_refreshes(term, ctx.dirty, full=full))
        _network_phase(ctx, ledger, skip_load=skip_load, load_succeeded=load_succeeded)
    finally:
        with ledger.step("llm:usage") as step:
            step.counts = usage_since(usage0)
        if own_api:
            api.close()
        logger.info("daily {}: {}", ledger.status, json.dumps(ledger.finish(), ensure_ascii=False, default=str))
    return ledger
