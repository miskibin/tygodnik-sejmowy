"""The daily updater. `python -m supagraf daily` ends up here.

Phases (each a ledger step; a failing step is recorded and the run goes on
unless the failure makes later phases meaningless):

  0. schema check     migration 0105 present, else refuse to run
  1. sync             every upstream resource → `_stage_*` (only changes)
                      + MP photo probe + polls scrape
  2. load             `load_*` for dirty resources only, then the cheap
                      relinks/backfills that depend on what changed
  3. enrich           unified LLM pass on new prints, flash pass on the
                      newest sitting's statements, voting short titles
  4. embed            qwen3 embeddings for prints / statements / promises
  5. refresh          matviews whose inputs changed
  6. finish           `etl_runs` row stamped; exit code 1 if any step failed

`--skip-fetch` treats every resource as dirty (there is nothing to diff
against), which reproduces the old "reload everything" behaviour.
"""
from __future__ import annotations

import json
import os
from typing import Callable

from loguru import logger

from supagraf.sync.context import SyncContext
from supagraf.sync.http import SejmApi
from supagraf.sync.loaders import run_loaders, run_refreshes
from supagraf.sync.runlog import RunLedger, ensure_schema
from supagraf.sync.stage import SyncResult

# Order matters only for readability of the log; every resource sync is
# independent (the FK ordering lives in loaders.LOAD_CHAIN).
RESOURCES: tuple[str, ...] = (
    "mps", "clubs", "committees", "committee_sittings",
    "prints", "processes", "proceedings", "votings",
    "bills", "videos", "questions", "acts",
)
ALL_LOAD_RESOURCES: frozenset[str] = frozenset(RESOURCES) | {
    "districts", "postcodes", "promises", "mp_office_expenses", "polls",
}


def _resource_fn(name: str) -> Callable[[SyncContext], SyncResult]:
    import importlib

    mod = importlib.import_module(f"supagraf.sync.resources.{name}")
    return mod.sync


def sync_resources(ctx: SyncContext, ledger: RunLedger, names: tuple[str, ...] = RESOURCES) -> dict[str, SyncResult]:
    out: dict[str, SyncResult] = {}
    for name in names:
        with ledger.step(f"sync:{name}") as step:
            res = _resource_fn(name)(ctx)
            out[name] = res
            step.counts = res.to_counts()
            if res.errors:
                step.status = "failed"
                step.error = f"{len(res.errors)} item errors, e.g. {res.errors[0]}"[:500]
    return out


def _relink_agenda_refs(term: int) -> None:
    from supagraf.cli import _resolve_unresolved_agenda_refs

    _resolve_unresolved_agenda_refs(term=term)


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
    ledger = RunLedger(
        kind="daily", term=term, persist=persist_ledger,
        args={"skip_fetch": skip_fetch, "skip_load": skip_load, "skip_enrich": skip_enrich,
              "skip_embed": skip_embed, "full": full, "window_days": window_days, "only": only},
    )
    with ledger.step("schema", fatal=True):
        ensure_schema()
    ledger.start()

    own_api = api is None
    api = api or SejmApi(concurrency=concurrency)
    ctx = SyncContext(term=term, api=api, full=full, window_days=window_days)
    try:
        # ---- 1. sync --------------------------------------------------------
        if skip_fetch:
            ledger.skip("sync", "--skip-fetch (all resources treated as dirty)")
            ctx.dirty |= ALL_LOAD_RESOURCES
        else:
            names = tuple(n for n in RESOURCES if not only or n in only)
            sync_resources(ctx, ledger, names)
            with ledger.step("sync:http") as step:
                step.counts = api.stats.to_dict()
            if not only or "mp_photos" in only:
                with ledger.step("sync:mp_photos") as step:
                    from supagraf.fetch.mp_photos import fetch_mp_photos
                    step.counts = fetch_mp_photos(term=term).to_dict()
            if not only or "polls" in only:
                with ledger.step("sync:polls") as step:
                    from supagraf.fetch.polls import fetch_polls
                    from supagraf.stage.polls import stage_polls_from_wikipedia
                    inserted, updated = stage_polls_from_wikipedia(fetch_polls())
                    step.counts = {"inserted": inserted, "updated": updated}
                    ctx.mark("polls", bool(inserted or updated))

        # ---- 2. load --------------------------------------------------------
        if skip_load:
            ledger.skip("load", "--skip-load")
        elif not ctx.dirty and not full:
            ledger.skip("load", "nothing changed upstream")
        else:
            with ledger.step("load") as step:
                step.counts = {"dirty": sorted(ctx.dirty), **run_loaders(term, ctx.dirty, full=full)}
            if ({"prints", "processes"} & ctx.dirty) and "proceedings" not in ctx.dirty:
                with ledger.step("load:relink_agenda_refs"):
                    _relink_agenda_refs(term)
            if {"prints", "committee_sittings"} & ctx.dirty or full:
                with ledger.step("backfill:print_committee_sitting_links") as step:
                    from supagraf.backfill import backfill_print_committee_sitting_links
                    step.counts = dict(backfill_print_committee_sitting_links(term=term) or {})
            if {"acts", "processes"} & ctx.dirty or full:
                with ledger.step("backfill:process_act_links") as step:
                    from supagraf.db import call_rpc_scalar
                    step.counts = {"affected": call_rpc_scalar("backfill_process_act_links", {"p_term": term})}
            if "votings" in ctx.dirty or full:
                with ledger.step("backfill:mp_club_history") as step:
                    from supagraf.backfill.mp_club_history import backfill_mp_club_history
                    step.counts = dict(backfill_mp_club_history(term=term) or {})
            with ledger.step("backfill:refresh_stale_eli") as step:
                from supagraf.fetch.acts import refresh_stale_eli
                out = refresh_stale_eli(term=term)
                step.counts = {k: v for k, v in out.items() if k != "sample_eli"}
                if out.get("fetched_acts"):
                    ctx.mark("acts", True)

        # ---- 3. enrich ------------------------------------------------------
        if skip_enrich:
            ledger.skip("enrich", "--skip-enrich")
        else:
            from supagraf.enrich.jobs import DEFAULT_WORKERS, enrich_pending_prints, enrich_pending_statements
            from supagraf.enrich.llm import is_deepseek_peak_hour

            if is_deepseek_peak_hour():
                logger.warning("DeepSeek peak pricing window (weekdays 01-04 & 06-10 UTC) — "
                               "enrichment costs 2x; consider scheduling the daily outside it")
            w = workers or DEFAULT_WORKERS
            with ledger.step("enrich:prints") as step:
                st = enrich_pending_prints(term=term, workers=w)
                step.counts = st.to_dict()
                if st.failed or st.aborted:
                    step.status = "failed"
                    step.error = f"failed={st.failed} aborted={st.aborted}"
            with ledger.step("enrich:statements") as step:
                st = enrich_pending_statements(term=term, workers=w)
                step.counts = st.to_dict()
                if st.failed:
                    step.status = "failed"
                    step.error = f"failed={st.failed}"
            with ledger.step("enrich:voting_short_title") as step:
                from supagraf.enrich.voting_short_title import enrich_votings
                n_fast, n_llm, n_failed = enrich_votings(term=term, days=30)
                step.counts = {"fast": n_fast, "llm": n_llm, "failed": n_failed}
            if os.environ.get("SUPAGRAF_ENABLE_ACT_SHORT_TITLE") == "1":
                with ledger.step("enrich:act_short_title") as step:
                    from supagraf.enrich.act_short_title import enrich_acts
                    n_llm, n_failed = enrich_acts(days=30)
                    step.counts = {"llm": n_llm, "failed": n_failed}

        # ---- 4. embed -------------------------------------------------------
        if skip_embed or os.environ.get("SUPAGRAF_DAILY_SKIP_EMBED") == "1":
            ledger.skip("embed", "--skip-embed / SUPAGRAF_DAILY_SKIP_EMBED")
        else:
            limit = int(os.environ.get("SUPAGRAF_EMBED_LIMIT", "0") or 0)
            with ledger.step("embed:prints") as step:
                from supagraf.cli import EnrichKind, _pending_query, _run_kind_for_prints
                q = _pending_query(EnrichKind.embed, term)
                rows = (q.limit(limit) if limit else q).execute().data or []
                ok, failed, skipped = _run_kind_for_prints(EnrichKind.embed, rows) if rows else (0, 0, 0)
                step.counts = {"ok": ok, "failed": failed, "skipped": skipped}
            with ledger.step("embed:statements") as step:
                from supagraf.enrich.embed_statement import embed_pending_statements
                ok, failed = embed_pending_statements(term=term, limit=limit)
                step.counts = {"ok": ok, "failed": failed}
            with ledger.step("embed:promises") as step:
                from supagraf.cli import cmd_enrich_promises
                cmd_enrich_promises(kind="embed", limit=limit)

        # ---- 5. refresh -----------------------------------------------------
        if skip_load:
            ledger.skip("refresh", "--skip-load")
        else:
            with ledger.step("refresh") as step:
                step.counts = run_refreshes(term, ctx.dirty, full=full)
                if any(v.startswith("failed") for v in step.counts.values()):
                    step.status = "failed"
                    step.error = "; ".join(f"{k}: {v}" for k, v in step.counts.items() if v.startswith("failed"))[:500]
    finally:
        if own_api:
            api.close()
        summary = ledger.finish()
        logger.info("daily {}: {}", ledger.status, json.dumps(summary, ensure_ascii=False, default=str))
    return ledger
