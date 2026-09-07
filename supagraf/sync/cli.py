"""Updater commands: `daily`, `sync`, `db-exec`. Mounted in supagraf.__main__."""
from __future__ import annotations

import json
from pathlib import Path

import typer
from loguru import logger

app = typer.Typer(no_args_is_help=False, add_completion=False)


@app.command("daily")
def cmd_daily(
    term: int = typer.Option(10, "--term", "-t"),
    skip_fetch: bool = typer.Option(False, "--skip-fetch", help="skip the upstream sync; every resource is then treated as dirty and reloaded"),
    skip_load: bool = typer.Option(False, "--skip-load", help="skip load_* and matview refreshes"),
    skip_enrich: bool = typer.Option(False, "--skip-enrich"),
    skip_embed: bool = typer.Option(False, "--skip-embed"),
    full: bool = typer.Option(False, "--full", help="ignore cursors/diffs: refetch every entity, run every loader and refresh"),
    window_days: int = typer.Option(14, "--window-days", help="days back that count as 'still moving'"),
    only: list[str] = typer.Option(None, "--only", help="restrict the sync phase to these resources (repeatable)"),
    workers: int = typer.Option(0, "--workers", help="LLM enrichment concurrency (0 = SUPAGRAF_ENRICH_WORKERS)"),
    concurrency: int = typer.Option(8, "--concurrency", help="parallel requests against api.sejm.gov.pl"),
    no_ledger: bool = typer.Option(False, "--no-ledger", help="do not write the etl_runs row (dev)"),
    summary_json: Path = typer.Option(None, "--summary-json", help="write the run summary to this file"),
):
    """Incremental daily update: sync → load → enrich → embed → refresh.

    Only what changed upstream is fetched and only the loaders whose inputs
    changed run (see docs/updater.md). Every phase lands in `etl_runs`;
    exit code 1 when any step failed.
    """
    from supagraf.sync.daily import run_daily
    from supagraf.sync.runlog import SchemaMissing

    try:
        ledger = run_daily(
            term=term, skip_fetch=skip_fetch, skip_load=skip_load, skip_enrich=skip_enrich,
            skip_embed=skip_embed, full=full, window_days=window_days,
            only=tuple(only) if only else None, workers=workers or None,
            concurrency=concurrency, persist_ledger=not no_ledger,
        )
    except SchemaMissing as e:
        logger.error(str(e))
        raise typer.Exit(2)
    if summary_json:
        summary_json.write_text(json.dumps(ledger.summary(), ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    failed = [s.name for s in ledger.failed_steps]
    logger.info("daily {}: {} steps, failed={}, run_id={}", ledger.status, len(ledger.steps), failed or "none", ledger.run_id)
    raise typer.Exit(ledger.exit_code)


@app.command("sync")
def cmd_sync(
    resources: list[str] = typer.Argument(..., help="mps|clubs|committees|committee_sittings|prints|processes|proceedings|votings|bills|videos|questions|acts"),
    term: int = typer.Option(10, "--term", "-t"),
    full: bool = typer.Option(False, "--full", help="ignore cursors/diffs for these resources"),
    load: bool = typer.Option(False, "--load", help="run the affected load_* chain afterwards"),
    window_days: int = typer.Option(14, "--window-days"),
    concurrency: int = typer.Option(8, "--concurrency"),
):
    """Sync one or more upstream resources into `_stage_*` (no enrich/embed)."""
    from supagraf.sync.context import SyncContext
    from supagraf.sync.daily import RESOURCES, sync_resources
    from supagraf.sync.http import SejmApi
    from supagraf.sync.loaders import run_loaders
    from supagraf.sync.runlog import RunLedger, SchemaMissing, ensure_schema

    if unknown := [r for r in resources if r not in RESOURCES]:
        logger.error("unknown resource(s): {} (known: {})", unknown, ", ".join(RESOURCES))
        raise typer.Exit(1)
    try:
        ensure_schema()
    except SchemaMissing as e:
        logger.error(str(e))
        raise typer.Exit(2)
    ledger = RunLedger(kind="sync", term=term, args={"resources": resources, "full": full, "load": load})
    ledger.start()
    with SejmApi(concurrency=concurrency) as api:
        ctx = SyncContext(term=term, api=api, full=full, window_days=window_days)
        sync_resources(ctx, ledger, tuple(r for r in RESOURCES if r in resources))
        if load and ctx.dirty:
            with ledger.step("load") as step:
                step.counts = run_loaders(term, ctx.dirty, full=full, changed_keys=ctx.changed_keys)
    ledger.finish()
    raise typer.Exit(ledger.exit_code)


@app.command("db-exec")
def cmd_db_exec(
    file: Path = typer.Option(None, "--file", "-f", help="SQL file to run (e.g. a migration)"),
    query: str = typer.Option(None, "--query", "-q", help="inline SQL"),
):
    """Run SQL through the service-role `exec_sql` RPC (no SSH/Tailscale needed).

    `python -m supagraf db-exec -f supabase/migrations/0105_etl_runs_cursors.sql`
    """
    from supagraf.db import exec_sql

    if not file and not query:
        logger.error("pass --file or --query")
        raise typer.Exit(1)
    out = exec_sql(file.read_text(encoding="utf-8") if file else query)
    logger.info("{}", out if not isinstance(out, list) else f"{len(out)} rows: {out[:5]}")
