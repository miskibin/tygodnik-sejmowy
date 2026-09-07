"""Top-level CLI for supagraf operations."""
from __future__ import annotations

import os
import re
from enum import Enum
from pathlib import Path
from typing import Callable

import typer
from loguru import logger

from supagraf.db import supabase
from supagraf.fixtures.storage import fixtures_root
from supagraf.load import _rpc_int, run_core_load
from supagraf.stage import acts as stage_acts
from supagraf.stage import bills as stage_bills
from supagraf.stage import clubs as stage_clubs
from supagraf.stage import committees as stage_committees
from supagraf.stage import committee_sittings as stage_committee_sittings
from supagraf.stage import districts as stage_districts
from supagraf.stage import mp_office_expenses as stage_mp_office_expenses
from supagraf.stage import mps as stage_mps
from supagraf.stage import proceedings as stage_proceedings
from supagraf.stage import processes as stage_processes
from supagraf.stage import promises as stage_promises
from supagraf.stage import questions as stage_questions
from supagraf.stage import videos as stage_videos
from supagraf.stage import votings as stage_votings

app = typer.Typer(no_args_is_help=True, add_completion=False)
enrich_app = typer.Typer(no_args_is_help=True, add_completion=False)
app.add_typer(enrich_app, name="enrich", help="LLM/embedding enrichment over loaded prints")

backfill_app = typer.Typer(no_args_is_help=True, add_completion=False)
app.add_typer(backfill_app, name="backfill",
              help="Backfill jobs for migration 0047 (voting_print_links, "
                   "opinion_source, autopoprawka relations, joint prints, etc.)")


def _print_counts(name: str, counts: dict) -> None:
    print(f"\nbackfill {name}: inserted={counts.get('inserted', 0)} "
          f"updated={counts.get('updated', 0)} skipped={counts.get('skipped', 0)}")


@backfill_app.command("voting-links")
def cmd_backfill_voting_links(dry_run: bool = typer.Option(False, "--dry-run")):
    """Populate voting_print_links from process_stages.voting jsonb +
    voting title regex (druk nr X, Y i Z)."""
    from supagraf.backfill import backfill_voting_print_links
    _print_counts("voting-links", backfill_voting_print_links(dry_run=dry_run))


@backfill_app.command("opinion-source")
def cmd_backfill_opinion_source(dry_run: bool = typer.Option(False, "--dry-run")):
    """Extract prints.opinion_source from sub-print/meta-document titles."""
    from supagraf.backfill import backfill_opinion_source
    _print_counts("opinion-source", backfill_opinion_source(dry_run=dry_run))


@backfill_app.command("joint-prints")
def cmd_backfill_joint_prints(dry_run: bool = typer.Option(False, "--dry-run")):
    """Merge print_numbers from voting titles into processes.prints_considered_jointly."""
    from supagraf.backfill import backfill_prints_considered_jointly
    _print_counts("joint-prints", backfill_prints_considered_jointly(dry_run=dry_run))


@backfill_app.command("autopoprawka-relations")
def cmd_backfill_autopoprawka(dry_run: bool = typer.Option(False, "--dry-run")):
    """Insert print_relationships(relation_type='autopoprawka') for NNNN-X prints."""
    from supagraf.backfill import backfill_autopoprawka_relations
    _print_counts("autopoprawka-relations", backfill_autopoprawka_relations(dry_run=dry_run))


@backfill_app.command("rapporteur-mp-ids")
def cmd_backfill_rapporteur(dry_run: bool = typer.Option(False, "--dry-run")):
    """Resolve process_stages.rapporteur_id from rapporteur_name (fuzzy)."""
    from supagraf.backfill import backfill_rapporteur_mp_ids
    _print_counts("rapporteur-mp-ids", backfill_rapporteur_mp_ids(dry_run=dry_run))


@backfill_app.command("committee-ids")
def cmd_backfill_committees(dry_run: bool = typer.Option(False, "--dry-run")):
    """Resolve process_stages.committee_id from committee_code/name."""
    from supagraf.backfill import backfill_committee_ids
    _print_counts("committee-ids", backfill_committee_ids(dry_run=dry_run))


@backfill_app.command("statement-print-links")
def cmd_backfill_statement_print_links(dry_run: bool = typer.Option(False, "--dry-run")):
    """No-op (source data not in schema). Returns empty counts."""
    from supagraf.backfill import backfill_statement_print_links
    _print_counts("statement-print-links", backfill_statement_print_links(dry_run=dry_run))


@backfill_app.command("statement-primary-print")
def cmd_backfill_statement_primary_print(
    term: int = typer.Option(10, "--term"),
    sitting_min: int = typer.Option(
        55, "--sitting-min", help="Only sittings >= this number"
    ),
    dry_run: bool = typer.Option(False, "--dry-run"),
    limit: int = typer.Option(None, "--limit", help="Cap for testing"),
    workers: int = typer.Option(
        8, "--workers", help="Parallel LLM workers in pass 2 (default 8)"
    ),
):
    """Attribute each statement to ONE specific print (primary_print_id).

    Pass 1: single-print agenda items → deterministic. No LLM cost.
    Pass 2: joint debates (2+ prints in same agenda item) → deepseek-flash
            picks the main subject. ~$0.001 per joint-debate statement.
    """
    from supagraf.enrich.statement_primary_print import backfill_primary_print
    counts = backfill_primary_print(
        term=term,
        sitting_min=sitting_min,
        dry_run=dry_run,
        limit=limit,
        workers=workers,
    )
    # backfill_primary_print returns its own counter keys (single_print,
    # joint_resolved, joint_null, ...) — don't reuse _print_counts which
    # only knows inserted/updated/skipped and would log zeros.
    print(
        f"\nbackfill statement-primary-print: total={counts.get('total', 0)} "
        f"single_print={counts.get('single_print', 0)} "
        f"joint_resolved={counts.get('joint_resolved', 0)} "
        f"joint_null={counts.get('joint_null', 0)} "
        f"hallucinated={counts.get('hallucinated', 0)} "
        f"llm_error={counts.get('llm_error', 0)}"
    )


@backfill_app.command("is-procedural-substantive")
def cmd_backfill_procedural(dry_run: bool = typer.Option(False, "--dry-run")):
    """Fix is_procedural for misclassified bills + procedural categories."""
    from supagraf.backfill import backfill_is_procedural_substantive
    _print_counts("is-procedural-substantive", backfill_is_procedural_substantive(dry_run=dry_run))


@backfill_app.command("topic")
def cmd_backfill_topic(
    term: int = typer.Option(10, "--term", "-t"),
    dry_run: bool = typer.Option(False, "--dry-run"),
):
    """Atlas A8: keyword-classify prints.topic from title (idempotent — only
    updates rows where topic IS NULL)."""
    from supagraf.backfill.topic import backfill_topic
    _print_counts("topic", backfill_topic(term=term, dry_run=dry_run))


@backfill_app.command("mp-club-history")
def cmd_backfill_mp_club_history(
    term: int = typer.Option(10, "--term", "-t"),
    dry_run: bool = typer.Option(False, "--dry-run"),
):
    """Atlas A5: derive club-switch history from votes.club_ref series
    (idempotent ON CONFLICT (term, mp_id, change_date, to_club_id))."""
    from supagraf.backfill.mp_club_history import backfill_mp_club_history
    _print_counts(
        "mp-club-history", backfill_mp_club_history(term=term, dry_run=dry_run)
    )


@backfill_app.command("motion-polarity")
def cmd_backfill_motion_polarity(
    term: int = typer.Option(None, "--term", "-t", help="Restrict to one term; default = all."),
    dry_run: bool = typer.Option(False, "--dry-run"),
):
    """Re-tag votings.motion_polarity from votings.topic (mig 0087).

    DB trigger handles fresh inserts; run this after widening the regex set
    or after migration first apply. Idempotent — only updates rows whose
    label disagrees with the current classifier.
    """
    from supagraf.backfill import backfill_motion_polarity
    _print_counts("motion-polarity", backfill_motion_polarity(term=term, dry_run=dry_run))


@backfill_app.command("committee-sitting-links")
def cmd_backfill_committee_sitting_links(
    term: int = typer.Option(10, "--term", "-t"),
    dry_run: bool = typer.Option(False, "--dry-run"),
):
    """Link prints to real committee sittings via agenda regex."""
    from supagraf.backfill import backfill_print_committee_sitting_links
    _print_counts(
        "committee-sitting-links",
        backfill_print_committee_sitting_links(term=term, dry_run=dry_run),
    )


@backfill_app.command("all")
def cmd_backfill_all(dry_run: bool = typer.Option(False, "--dry-run")):
    """Run every backfill in safe dependency order. Idempotent.

    Exits 1 if any backfill errors so CI catches partial failures (was
    silently exiting 0 before). Partial results still printed.
    """
    from supagraf.backfill import run_all
    from supagraf.backfill.etl_review import BackfillFailures
    try:
        out = run_all(dry_run=dry_run)
    except BackfillFailures as e:
        print("\n=== backfill all PARTIAL — failures ===")
        for name, counts in e.partial.items():
            _print_counts(name, counts)
        for name, err in e.failed.items():
            logger.error("  {}: {}", name, err)
        raise typer.Exit(1)
    print("\n=== backfill all summary ===")
    for name, counts in out.items():
        _print_counts(name, counts)


@app.command("stage")
def cmd_stage(
    resources: list[str] = typer.Argument(None, help="mps|clubs|votings|committees|committee_sittings|processes|bills|questions|videos|proceedings|districts|postcodes|promises|acts|mp_office_expenses (default: all)"),
    term: int = 10,
):
    """Stage fixture JSON to _stage_* tables."""
    targets = resources or [
        "clubs", "mps", "votings", "committees", "committee_sittings",
        "processes", "bills",
        "questions", "videos", "proceedings",
        "districts", "postcodes", "promises",
        "acts", "mp_office_expenses",
    ]
    runners = {
        "clubs": stage_clubs.stage,
        "mps": stage_mps.stage,
        "votings": stage_votings.stage,
        "committees": stage_committees.stage,
        "committee_sittings": stage_committee_sittings.stage,
        "processes": stage_processes.stage,
        "bills": stage_bills.stage,
        "questions": stage_questions.stage,
        "videos": stage_videos.stage,
        "proceedings": stage_proceedings.stage,
        "districts": stage_districts.stage_districts,
        "postcodes": stage_districts.stage_district_postcodes,
        "promises": stage_promises.stage_promises,
        "acts": stage_acts.stage,
        "mp_office_expenses": stage_mp_office_expenses.stage,
    }
    for r in targets:
        if r not in runners:
            logger.error("unknown resource: {}", r)
            raise typer.Exit(1)
        report = runners[r](term=term)
        if not report.ok():
            logger.error("stage {} failed: {} errors", r, len(report.errors))
            for src, err in report.errors[:5]:
                logger.error("  {}: {}", src, err)
            raise typer.Exit(2)


@app.command("load")
def cmd_load(term: int = 10):
    """Run the SQL load orchestrator (clubs, inferred, mps, mp_club, votings, votes)."""
    report = run_core_load(term=term)
    print(f"\nTotal rows touched: {report.total()}")


@app.command("run-all")
def cmd_run_all(term: int = 10):
    """Stage everything, then load everything."""
    cmd_stage(None, term=term)
    cmd_load(term=term)


@app.command("backfill-prints")
def cmd_backfill_prints(
    term: int = typer.Option(10, "--term", "-t"),
    skip_relink: bool = typer.Option(
        False, "--skip-relink",
        help="skip re-running load_proceedings to resolve agenda refs",
    ),
):
    """Sweep ALL upstream prints regardless of year, stage + load them.

    `daily` filters `capture_prints` by `SUPAGRAF_CAPTURE_YEAR` (default:
    current year) — historical prints from earlier years of the term get
    skipped on the per-day path. Symptom: prints listed in agenda HTML as
    `druki nr 1, 2, 3` end up in `unresolved_agenda_print_refs` because
    the `prints` row never existed locally.

    This command runs the same fetch path with `year=None`, then runs the
    prints chain of SQL loaders. By default also re-runs `load_proceedings`
    so previously-unresolved agenda refs resolve into `agenda_item_prints`.

    Idempotent: existing on-disk fixtures and prints rows aren't refetched
    (refresh=False). Cost: one HTTP GET per missing print + N upserts.

    NOT SAFE TO RUN CONCURRENTLY with `daily` — both write to
    `_stage_prints` and the loaders are not write-locked. Run this when
    cron is off, or just accept that daily picks up what backfill misses
    on the next pass.
    """
    import asyncio

    from supagraf.fixtures.client import SejmClient
    from supagraf.fixtures.sources import sejm as sejm_src
    from supagraf.schema.prints import Print
    from supagraf.stage.base import StreamingStager

    out_root = fixtures_root()
    staged_count = 0

    async def _go() -> None:
        nonlocal staged_count
        async with SejmClient(concurrency=5) as client:
            with StreamingStager(
                resource="prints", table="_stage_prints", model=Print, term=term,
            ) as stager:
                ids = await sejm_src.capture_prints(
                    client, out_root, term,
                    year=None,  # NO year filter — that's the whole point.
                    refresh=False, no_binaries=True, limit=None,
                    on_record=lambda nid, p, src: stager.push(
                        natural_id=nid, payload=p, source_path=src,
                    ),
                )
                staged_count = len(ids)

    logger.info("backfill-prints: fetching all upstream prints (no year filter)…")
    asyncio.run(_go())
    logger.info("backfill-prints: staged {} prints", staged_count)

    # Prints chain — order matters (see supagraf/load/__init__.py:_PRE_STEPS).
    # additional/relationships/attachments depend on prints existing first.
    chain = (
        "load_prints",
        "load_prints_additional",
        "load_print_relationships",
        "load_print_attachments",
    )
    for fn in chain:
        n = _rpc_int(fn, term)
        logger.info("backfill-prints: {} affected={}", fn, n)

    if not skip_relink:
        _resolve_unresolved_agenda_refs(term=term)

    logger.info("backfill-prints: done")


def _resolve_unresolved_agenda_refs(*, term: int) -> None:
    """Targeted relink: move `unresolved_agenda_print_refs` rows whose
    print_number is now present in `prints` into `agenda_item_prints`.

    Why not just call `load_proceedings` RPC: that function does a full
    delete + re-insert of every agenda_item, statement, and link for every
    proceeding in the term — too heavy for Cloudflare/Kong's nginx upstream
    timeout (60s), times out as 504 on hosted PostgREST.

    This function does the surgical version: only the rows where a previously
    unresolved ref now has a matching print. All via PostgREST table ops so
    each request is small (<8s) — no direct-DSN required.
    """
    client = supabase()

    # 1. Pull all unresolved refs for the term — paginate since PostgREST
    #    caps at 1000 rows per request.
    unresolved: list[dict] = []
    page = 1000
    offset = 0
    while True:
        rows = (
            client.table("unresolved_agenda_print_refs")
            .select("id, agenda_item_id, term, print_number")
            .eq("term", term)
            .is_("resolved_at", "null")
            .order("id")
            .range(offset, offset + page - 1)
            .execute()
            .data
            or []
        )
        if not rows:
            break
        unresolved.extend(rows)
        if len(rows) < page:
            break
        offset += len(rows)
    logger.info("backfill-prints: {} unresolved agenda refs to check", len(unresolved))

    if not unresolved:
        return

    # 2. Which print_numbers now exist? Pull the set once.
    refs = sorted({r["print_number"] for r in unresolved})
    have: set[str] = set()
    batch = 500  # in-clause length limit
    for i in range(0, len(refs), batch):
        chunk = refs[i:i + batch]
        rows = (
            client.table("prints")
            .select("number")
            .eq("term", term)
            .in_("number", chunk)
            .execute()
            .data
            or []
        )
        have.update(r["number"] for r in rows)

    resolvable = [r for r in unresolved if r["print_number"] in have]
    logger.info(
        "backfill-prints: {} of {} unresolved refs now point to real prints",
        len(resolvable), len(unresolved),
    )

    # 3. Upsert into agenda_item_prints with on-conflict ignore.
    #    Count actually-inserted rows from `.execute().data` length per batch —
    #    PostgREST returns only the new/updated rows. Collisions silently drop.
    inserted_rows = 0
    if resolvable:
        rows_to_insert = [
            {"agenda_item_id": r["agenda_item_id"], "term": r["term"], "print_number": r["print_number"]}
            for r in resolvable
        ]
        for i in range(0, len(rows_to_insert), batch):
            res = (
                client.table("agenda_item_prints")
                .upsert(rows_to_insert[i:i + batch], on_conflict="agenda_item_id,term,print_number")
                .execute()
            )
            inserted_rows += len(res.data or [])

    # 4. Mark resolved.
    if resolvable:
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()
        ids = [r["id"] for r in resolvable]
        for i in range(0, len(ids), batch):
            (
                client.table("unresolved_agenda_print_refs")
                .update({"resolved_at": now})
                .in_("id", ids[i:i + batch])
                .execute()
            )

    # Two distinct counts:
    #   - inserted_rows: NEW rows in agenda_item_prints (may be < len(resolvable)
    #     if links already existed from another code path).
    #   - len(resolvable): unresolved refs we marked resolved this run.
    logger.info(
        "backfill-prints: relink done — agenda_item_prints +{} rows, "
        "{} unresolved refs marked resolved",
        inserted_rows, len(resolvable),
    )


@app.command("backfill-processes")
def cmd_backfill_processes(
    term: int = typer.Option(10, "--term", "-t"),
):
    """Sweep ALL upstream processes regardless of year, stage + load them.

    Same year-filter problem as `backfill-prints`: `capture_processes` filters
    `list_data` by `in_year(year)`, so historical processes from earlier years
    of the term get skipped on the daily path. Symptom: the
    `process_stages.sitting_num` lookup on the print page returns nothing for
    older prints, so the "Punkty obrad" badges (I/II czytanie, głosowanie)
    don't render even when the print actually was procedowany.

    Runs the same fetch path with `year=None`, then `load_processes` SQL
    function (idempotent — ON CONFLICT updates in-place, additional stages
    get re-derived from the fresh payload).

    NOT SAFE TO RUN CONCURRENTLY with `daily` (same `_stage_processes`
    table; the loaders don't take a write lock).
    """
    import asyncio

    from supagraf.fixtures.client import SejmClient
    from supagraf.fixtures.sources import sejm as sejm_src
    from supagraf.schema.processes import Process
    from supagraf.stage.base import StreamingStager

    out_root = fixtures_root()
    staged_count = 0

    async def _go() -> None:
        nonlocal staged_count
        async with SejmClient(concurrency=5) as client:
            with StreamingStager(
                resource="processes", table="_stage_processes", model=Process, term=term,
            ) as stager:
                ids = await sejm_src.capture_processes(
                    client, out_root, term,
                    year=None,
                    refresh=False, no_binaries=True, limit=None,
                    on_record=lambda nid, p, src: stager.push(
                        natural_id=nid, payload=p, source_path=src,
                    ),
                )
                staged_count = len(ids)

    logger.info("backfill-processes: fetching all upstream processes (no year filter)…")
    asyncio.run(_go())
    logger.info("backfill-processes: staged {} processes", staged_count)

    n = _rpc_int("load_processes", term)
    logger.info("backfill-processes: load_processes affected={}", n)
    logger.info("backfill-processes: done")


@app.command("backfill-sponsor-authority")
def cmd_backfill_sponsor_authority(
    term: int = typer.Option(10, "--term", "-t"),
    dry_run: bool = typer.Option(False, "--dry-run"),
):
    """Derive `prints.sponsor_authority` from `prints.title`.

    Sejm prints encode the sponsor in the title prefix:
      "Rządowy projekt ustawy…"      → rzad
      "Poselski projekt ustawy…"     → klub_poselski
      "Senacki projekt ustawy…"      → senat
      "Obywatelski projekt ustawy…"  → obywatele
      "Prezydencki projekt ustawy…"  → prezydent
      "Komisyjny projekt ustawy…"    → komisja
      "Przedstawiony przez Prezydium Sejmu…" → prezydium

    Deterministic — no LLM. Idempotent; only updates rows with NULL
    sponsor_authority (skips already-set values, incl. the rare 'inne'
    overrides written by `print_unified` for sub-prints with opinion_source).

    Sub-prints (e.g. "Do druku nr 1650 - ocena skutków regulacji") inherit
    parent sponsor_authority via processPrint; for now we skip them
    (`print_unified.py` collapses them to 'inne' when opinion_source is
    set, which is the correct behavior for meta-documents anyway).

    SAFETY / WHERE TO RUN:
    Must run inside the mixvm container (with `SUPAGRAF_RUN_LOCATION=vm`),
    NOT from a laptop pointed at `db.msulawiak.pl`. The Cloudflare front
    silently swallows PATCH writes during transient 503 events, and this
    command issues batched chunked PATCHes via PostgREST `update().in_(...)`
    — exactly the failure mode the project memory rule flags. The function
    refuses to run when it detects an off-VM environment.
    """
    import os
    import re
    from urllib.parse import urlparse

    # ---- Location guard: refuse off-VM execution ----------------------
    # Two signals; either disqualifies:
    #   - SUPAGRAF_RUN_LOCATION env not 'vm' (set inside the daily container)
    #   - SUPABASE_URL host is the public Cloudflare endpoint db.msulawiak.pl
    # The VM path uses internal Kong (http://kong:8000 or http://mixvm...:8000)
    # which is direct nginx -> PostgREST, no Cloudflare in the middle.
    run_location = os.environ.get("SUPAGRAF_RUN_LOCATION", "").lower()
    supabase_url = os.environ.get("SUPABASE_URL", "")
    cloudflare_host = "db.msulawiak.pl"
    parsed_host = urlparse(supabase_url).hostname or ""

    is_via_cloudflare = parsed_host == cloudflare_host
    is_vm = run_location == "vm"

    if is_via_cloudflare or not is_vm:
        raise typer.BadParameter(
            "backfill-sponsor-authority refuses to run outside the mixvm "
            "container. The Cloudflare front (db.msulawiak.pl) silently drops "
            "PATCH writes during 503 events, and this command issues batched "
            "chunked PATCHes against `prints`. Run inside the daily container:\n"
            "  ssh sejm@mixvm.bison-fort.ts.net\n"
            "  docker compose exec supagraf uv run python -m supagraf backfill-sponsor-authority --term {term}\n"
            f"(detected: SUPABASE_URL host={parsed_host or '<unset>'}, "
            f"SUPAGRAF_RUN_LOCATION={run_location or '<unset>'})"
        )

    client = supabase()

    # Title prefix → authority. Order matters: "Przedstawiony przez Prezydium"
    # must be checked before generic catch-alls. All matches are case-
    # sensitive on the first capitalized word (Sejm titles are stable).
    PATTERNS: list[tuple[re.Pattern[str], str]] = [
        (re.compile(r"^Rządowy\s+projekt"), "rzad"),
        (re.compile(r"^Poselski\s+projekt"), "klub_poselski"),
        (re.compile(r"^Senacki\s+projekt"), "senat"),
        (re.compile(r"^Obywatelski\s+projekt"), "obywatele"),
        (re.compile(r"^Prezydencki\s+projekt"), "prezydent"),
        (re.compile(r"^Komisyjny\s+projekt"), "komisja"),
        (re.compile(r"^Przedstawion[ya]\s+przez\s+Prezydium"), "prezydium"),
    ]

    # Pull all NULL-sponsor prints for the term, paginate (>4k rows).
    rows: list[dict] = []
    offset = 0
    page = 1000
    while True:
        chunk = (
            client.table("prints")
            .select("id, term, number, title")
            .eq("term", term)
            .is_("sponsor_authority", "null")
            .order("id")
            .range(offset, offset + page - 1)
            .execute()
            .data or []
        )
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page:
            break
        offset += len(chunk)
    logger.info("backfill-sponsor-authority: {} prints with NULL sponsor_authority", len(rows))

    matches: dict[str, list[int]] = {}
    unmatched: list[tuple[str, str]] = []
    for r in rows:
        t = r.get("title") or ""
        authority: str | None = None
        for pat, val in PATTERNS:
            if pat.match(t):
                authority = val
                break
        if authority:
            matches.setdefault(authority, []).append(r["id"])
        else:
            unmatched.append((r["number"], t[:60]))

    logger.info(
        "backfill-sponsor-authority: matched {} prints across {} buckets, {} unmatched (sub-prints + meta-docs)",
        sum(len(v) for v in matches.values()), len(matches), len(unmatched),
    )
    for auth, ids in matches.items():
        logger.info("  {}: {} prints", auth, len(ids))
    if unmatched[:5]:
        logger.info("  unmatched sample: {}", unmatched[:5])

    if dry_run:
        logger.info("backfill-sponsor-authority: --dry-run, no writes")
        return

    # Batch update by authority. PostgREST has no SQL UPDATE WHERE id IN —
    # we use the in_ filter via the supabase client; updates 1000 ids per call.
    batch = 500
    written = 0
    for authority, ids in matches.items():
        for i in range(0, len(ids), batch):
            chunk = ids[i:i + batch]
            client.table("prints").update({"sponsor_authority": authority}).in_("id", chunk).execute()
            written += len(chunk)
    logger.info("backfill-sponsor-authority: wrote {} updates", written)


@app.command("daily")
def cmd_daily(
    term: int = typer.Option(10, "--term", "-t"),
    skip_fetch: bool = typer.Option(False, "--skip-fetch", help="skip the upstream sync; every resource is then treated as dirty and reloaded"),
    skip_load: bool = typer.Option(False, "--skip-load", help="skip load_* and matview refreshes"),
    skip_enrich: bool = typer.Option(False, "--skip-enrich"),
    skip_embed: bool = typer.Option(False, "--skip-embed"),
    full: bool = typer.Option(False, "--full", help="ignore cursors/diffs: refetch every entity, run every loader and refresh"),
    window_days: int = typer.Option(14, "--window-days", help="days back that count as 'still moving' (proceedings, committee sittings)"),
    only: list[str] = typer.Option(None, "--only", help="restrict the sync phase to these resources (repeatable)"),
    workers: int = typer.Option(0, "--workers", help="LLM enrichment concurrency (0 = SUPAGRAF_ENRICH_WORKERS or 4)"),
    concurrency: int = typer.Option(8, "--concurrency", help="parallel requests against api.sejm.gov.pl"),
    no_ledger: bool = typer.Option(False, "--no-ledger", help="do not write the etl_runs row (dev)"),
    summary_json: Path = typer.Option(None, "--summary-json", help="write the run summary to this file"),
):
    """Incremental daily update: sync → load → enrich → embed → refresh.

    Only what changed upstream is fetched and only the loaders whose inputs
    changed run (see supagraf/sync/). Every phase is recorded in `etl_runs`;
    the exit code is 1 when any step failed, 0 otherwise.
    """
    import json

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
    summary = ledger.summary()
    if summary_json:
        summary_json.write_text(json.dumps(summary, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    failed = [s.name for s in ledger.failed_steps]
    print(f"\ndaily {ledger.status}: {len(ledger.steps)} steps, failed={failed or 'none'}, run_id={ledger.run_id}")
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

    unknown = [r for r in resources if r not in RESOURCES]
    if unknown:
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
    for s in ledger.steps:
        print(f"{s.name}: {s.status} {s.counts}")
    raise typer.Exit(ledger.exit_code)


@app.command("db-exec")
def cmd_db_exec(
    file: Path = typer.Option(None, "--file", "-f", help="SQL file to run (e.g. a migration)"),
    query: str = typer.Option(None, "--query", "-q", help="inline SQL"),
):
    """Run SQL through the service-role `exec_sql` RPC (no SSH/Tailscale needed).

    Typical use: `python -m supagraf db-exec -f supabase/migrations/0105_etl_runs_cursors.sql`.
    """
    from supagraf.db import exec_sql

    if not file and not query:
        logger.error("pass --file or --query")
        raise typer.Exit(1)
    sql = file.read_text(encoding="utf-8") if file else query
    out = exec_sql(sql)
    print(out if not isinstance(out, list) else f"{len(out)} rows: {out[:5]}")


# ---- enrich subcommand ----------------------------------------------------


class EnrichKind(str, Enum):
    # unified does all 7 LLM outputs in one call (~5x cheaper, ~5x faster)
    unified = "unified"
    summary = "summary"
    stance = "stance"
    mentions = "mentions"
    personas = "personas"
    action = "action"
    plain_polish = "plain_polish"
    impact = "impact"
    embed = "embed"
    all = "all"


def _pending_query(kind: EnrichKind, term: int):
    """Pending = needs this enrichment. Uses partial indexes added in
    0014/0016/0017/0018 so each run scans only what's left to do.

    Testing-phase rollout: SUPAGRAF_LLM_TESTING_FROM_DATE (ISO date) caps the
    scan to prints with change_date >= that date. Older corpus stays on
    whatever model produced its existing rows.
    """
    import os
    client = supabase()
    q = client.table("prints").select(
        "id, term, number, attachments:print_attachments(filename, ordinal)"
    )
    q = q.eq("term", term)
    testing_from = os.environ.get("SUPAGRAF_LLM_TESTING_FROM_DATE")
    if testing_from:
        q = q.gte("change_date", testing_from)
    if kind == EnrichKind.summary:
        q = q.is_("summary", "null")
    elif kind == EnrichKind.stance:
        q = q.is_("stance", "null")
    elif kind == EnrichKind.mentions:
        q = q.is_("mentions_extracted_at", "null")
    elif kind == EnrichKind.personas:
        q = q.is_("persona_tags", "null")
    elif kind == EnrichKind.action:
        q = q.is_("citizen_action_model", "null")
    elif kind == EnrichKind.plain_polish:
        q = q.is_("summary_plain", "null")
    elif kind == EnrichKind.impact:
        q = q.is_("impact_punch", "null")
    elif kind == EnrichKind.embed:
        # embed pulls from prints.summary, so require summary present.
        q = q.is_("embedded_at", "null").not_.is_("summary", "null")
    elif kind == EnrichKind.unified:
        # Unified pending = any of the 7 fields missing. Practical filter:
        # impact_punch is the last field set so its absence covers most cases
        # (drukı that have summary but no impact still need unified-or-impact).
        q = q.is_("impact_punch", "null")
    return q


# A handful of `prints.number` values are Lotus/Domino document GUIDs rather
# than Sejm print numbers (4 rows in term 10). api.sejm.gov.pl has no
# /prints/<guid>/ path — the WAF answers with an HTML "Request Rejected" page —
# so there is no document to enrich. Skip instead of failing every run.
_GUID_NUMBER_RE = re.compile(r"^[0-9A-Fa-f]{32}$")


def _resolve_pdf_relpath(print_row: dict) -> str | None:
    """Pick best document attachment: prefer .docx (clean text from Sejm's
    editable source) over .pdf (often a scanned signed copy without text layer).

    Returns relpath under fixtures/ or None if no usable document found.
    """
    # Upstream ships a few numbers with embedded newlines/spaces ("1041-004\n").
    # Left unstripped they end up verbatim in the request URL and httpx rejects
    # it (`InvalidURL: non-printable ASCII character`).
    number = (print_row.get("number") or "").strip()
    if not number or _GUID_NUMBER_RE.match(number):
        return None
    atts = sorted(print_row.get("attachments") or [], key=lambda a: a.get("ordinal", 0))
    docx_match = pdf_match = None
    for a in atts:
        fn = (a.get("filename") or "").strip()
        if not fn:
            continue
        low = fn.lower()
        if docx_match is None and low.endswith(".docx"):
            docx_match = fn
        elif pdf_match is None and low.endswith(".pdf"):
            pdf_match = fn
    chosen = docx_match or pdf_match
    if chosen is None:
        return None
    return f"sejm/prints/{number}__{chosen}"


def _runner_for(kind: EnrichKind) -> Callable:
    # Late import — avoids circular imports + speeds CLI startup when not needed.
    if kind == EnrichKind.unified:
        from supagraf.enrich.print_unified import enrich_print_unified
        return enrich_print_unified
    if kind == EnrichKind.summary:
        from supagraf.enrich.print_summary import summarize_print
        return summarize_print
    if kind == EnrichKind.stance:
        from supagraf.enrich.print_stance import classify_stance
        return classify_stance
    if kind == EnrichKind.mentions:
        from supagraf.enrich.print_mentions import extract_mentions
        return extract_mentions
    if kind == EnrichKind.personas:
        from supagraf.enrich.print_personas import tag_personas
        return tag_personas
    if kind == EnrichKind.action:
        from supagraf.enrich.print_action import suggest_print_action
        return suggest_print_action
    if kind == EnrichKind.plain_polish:
        from supagraf.enrich.print_plain_polish import summarize_plain_polish
        return summarize_plain_polish
    if kind == EnrichKind.impact:
        from supagraf.enrich.print_impact import assess_impact
        return assess_impact
    if kind == EnrichKind.embed:
        from supagraf.enrich.embed_print import embed_print
        return embed_print
    raise ValueError(f"no single runner for {kind}")


# Consecutive attachment-fetch failures that mean "upstream is down, stop
# trying" rather than "these particular prints are bad".
_FETCH_OUTAGE_THRESHOLD = int(os.environ.get("SUPAGRAF_FETCH_OUTAGE_THRESHOLD", "8"))


def _run_kind_for_prints(kind: EnrichKind, prints_rows: list[dict]) -> tuple[int, int, int]:
    """Returns (ok, failed, skipped). Failures logged + continue per plan:
    one bad print does not abort the loop — the @with_model_run decorator
    already records the failure to enrichment_failures + status='failed'.

    Each row is expected to carry `term` so the runner can scope DB lookups
    to (term, number) rather than just number — multi-term collisions are
    a real risk once historical terms get loaded.
    """
    runner = _runner_for(kind)
    ok = failed = skipped = 0
    consecutive_fetch_failures = 0
    needs_pdf = kind != EnrichKind.embed  # embed reads summary from DB; others need PDF
    for i, row in enumerate(prints_rows):
        try:
            kwargs = {
                "entity_type": "print",
                "entity_id": row["number"],
            }
            # Only LLM enrichers accept term (for multi-term DB scoping).
            # embed_print signature doesn't take it.
            if kind != EnrichKind.embed:
                kwargs["term"] = row.get("term", 10)
            if needs_pdf:
                rp = _resolve_pdf_relpath(row)
                if rp is None:
                    logger.warning("print {} has no .pdf attachment — skipping {}", row["number"], kind.value)
                    skipped += 1
                    continue
                runner(pdf_relpath=rp, **kwargs)
            else:
                runner(**kwargs)
            ok += 1
            consecutive_fetch_failures = 0
        except Exception as e:
            # Scanned PDFs (no text layer) raise from pymupdf+pypdf. Treat as
            # 'skipped' rather than 'failed' so totals reflect actionable
            # failures (LLM/network/schema), not an inherent property of the
            # source. The audit row is still written by @with_model_run with
            # status='failed' for traceability.
            from supagraf.enrich.pdf_fetch import PdfFetchError, PrintGoneError

            msg = str(e)
            # Upstream-wide outage guard. When api.sejm.gov.pl's document
            # backend goes down it 502s after a 60 s hang on EVERY attachment
            # (metadata keeps answering instantly), so the loop would spend
            # minutes per print for hours and finish with nothing enriched.
            # Bail out and leave the rest pending for the next run.
            if isinstance(e, PdfFetchError) and not isinstance(e, PrintGoneError):
                consecutive_fetch_failures += 1
                if consecutive_fetch_failures >= _FETCH_OUTAGE_THRESHOLD:
                    logger.error(
                        "enrich {}: {} consecutive fetch failures — upstream looks "
                        "down, aborting this phase ({} prints left pending)",
                        kind.value, consecutive_fetch_failures, len(prints_rows) - i,
                    )
                    failed += 1
                    break
            else:
                consecutive_fetch_failures = 0
            if isinstance(e, PrintGoneError):
                # Withdrawn/renumbered upstream — nothing to retry tomorrow.
                logger.warning("enrich {} {} skipped (gone upstream): {}", kind.value, row["number"], e)
                skipped += 1
            elif "0 chars" in msg or "scanned PDF" in msg or "no .pdf attachment" in msg:
                logger.warning("enrich {} {} skipped (no text layer): {}", kind.value, row["number"], type(e).__name__)
                skipped += 1
            else:
                logger.error("enrich {} {} failed: {!r}", kind.value, row["number"], e)
                failed += 1
    return ok, failed, skipped


@enrich_app.command("prints")
def cmd_enrich_prints(
    kind: EnrichKind = typer.Option(..., "--kind", "-k", help="summary|stance|mentions|personas|action|plain_polish|impact|embed|all"),
    term: int = typer.Option(10, "--term", "-t"),
    limit: int = typer.Option(0, "--limit", "-n", help="0 = no cap"),
    workers: int = typer.Option(0, "--workers", "-w", help="unified only: concurrent prints (0 = SUPAGRAF_ENRICH_WORKERS or 4)"),
):
    """Run an enrichment job over prints that don't yet have it.

    Uses partial indexes (summary_pending, stance_pending, mentions_pending,
    embedding_pending) so each run scans only what's left. Failures don't
    abort the loop; check enrichment_failures + model_runs(status='failed')
    for diagnostics. Exit 3 if any failures so scripts notice.

    `--kind unified` runs the concurrent runner from supagraf.enrich.jobs
    (failure backoff + upstream-outage guard); the per-field kinds keep the
    sequential legacy loop.
    """
    if kind == EnrichKind.unified:
        from supagraf.enrich.jobs import DEFAULT_WORKERS, enrich_pending_prints

        st = enrich_pending_prints(term=term, limit=limit, workers=workers or DEFAULT_WORKERS)
        print(f"\nenrich unified: ok={st.ok} failed={st.failed} skipped={st.skipped} "
              f"backoff={st.backoff} aborted={st.aborted}")
        if st.failed > 0 or st.aborted:
            raise typer.Exit(3)
        return
    kinds = (
        # embed last — depends on prints.summary produced by the summary job.
        [EnrichKind.summary, EnrichKind.stance, EnrichKind.mentions,
         EnrichKind.personas, EnrichKind.action,
         EnrichKind.plain_polish, EnrichKind.impact, EnrichKind.embed]
        if kind == EnrichKind.all
        else [kind]
    )
    totals = {"ok": 0, "failed": 0, "skipped": 0}
    for k in kinds:
        q = _pending_query(k, term)
        if limit > 0:
            q = q.limit(limit)
        rows = q.execute().data or []
        if not rows:
            logger.info("enrich {}: no pending prints (term={})", k.value, term)
            continue
        logger.info("enrich {}: {} pending prints", k.value, len(rows))
        ok, failed, skipped = _run_kind_for_prints(k, rows)
        totals["ok"] += ok
        totals["failed"] += failed
        totals["skipped"] += skipped
        logger.info("enrich {} done: ok={} failed={} skipped={}", k.value, ok, failed, skipped)

    print(f"\nenrich totals: ok={totals['ok']} failed={totals['failed']} skipped={totals['skipped']}")
    if totals["failed"] > 0:
        # Non-zero exit so CI / scripts see the partial failure.
        raise typer.Exit(3)


@enrich_app.command("promises")
def cmd_enrich_promises(
    kind: str = typer.Option("embed", "--kind", "-k", help="embed (only kind for now)"),
    limit: int = typer.Option(0, "--limit", "-n", help="0 = no cap"),
):
    """Embed promises that don't yet have an embedding row.

    Pending = promises.id with no matching embeddings row of entity_type='promise'.
    Failures are logged via @with_model_run + enrichment_failures, not aborted.
    """
    if kind != "embed":
        logger.error("only --kind embed supported for promises")
        raise typer.Exit(1)

    from supagraf.enrich.embed import DEFAULT_EMBED_MODEL
    from supagraf.enrich.embed_promise import embed_promise

    client = supabase()
    promises = (
        client.table("promises").select("id").order("id").execute().data or []
    )
    embedded = {
        row["entity_id"]
        for row in (
            client.table("embeddings")
            .select("entity_id")
            .eq("entity_type", "promise")
            .eq("model", DEFAULT_EMBED_MODEL)
            .execute()
            .data
            or []
        )
    }
    pending = [p for p in promises if str(p["id"]) not in embedded]
    if limit > 0:
        pending = pending[:limit]
    logger.info("enrich promises embed: {} pending", len(pending))

    ok = failed = 0
    for p in pending:
        try:
            embed_promise(entity_type="promise", entity_id=str(p["id"]))
            ok += 1
        except Exception as e:
            logger.error("embed_promise {} failed: {!r}", p["id"], e)
            failed += 1
    print(f"\nenrich promises embed: ok={ok} failed={failed}")
    if failed > 0:
        raise typer.Exit(3)


@app.command("match-promises")
def cmd_match_promises(
    term: int = typer.Option(10, "--term", "-t"),
    top_k: int = typer.Option(25, "--top-k"),
    max_distance: float = typer.Option(0.65, "--max-distance",
        help="Cosine distance ceiling. Default 0.65 (was 0.55) — after the "
             "2026-05-12 backfill, only 39% of promises had any surviving "
             "rerank verdict at 0.55. Widening admits more borderline matches "
             "for the LLM re-ranker (rerank-promises) to filter."),
):
    """Run match_promise_to_prints for every embedded promise.

    Promises without an embedding are skipped (run `enrich promises -k embed`
    first). Each call inserts/refreshes pending candidates; confirmed/rejected
    rows are preserved.
    """
    from supagraf.enrich.promise_matcher import match_all_promises

    totals = match_all_promises(term=term, top_k=top_k, max_distance=max_distance)
    print(
        f"\nmatch-promises: matched={totals['matched']} "
        f"skipped_no_embedding={totals['skipped_no_embedding']} "
        f"candidates={totals['candidates']}"
    )


@app.command("rerank-promises")
def cmd_rerank_promises(
    top_k: int = typer.Option(20, "--top-k",
        help="Number of cosine candidates per promise to send to the LLM."),
    model: str = typer.Option(None, "--model",
        help="LLM model name. Defaults to SUPAGRAF_LLM_MODEL env."),
    limit: int | None = typer.Option(None, "--limit",
        help="Process only the first N promises (use small values to verify "
             "the plumbing before paying tokens for the full set)."),
):
    """LLM re-rank cosine candidates per promise into confirmed/candidate/rejected.

    For each promise, batches all top-K cosine candidates into a single LLM
    call (saves tokens). Writes match_status, match_rationale, reranked_at,
    reranked_model to promise_print_candidates (columns added in 0046).
    """
    from supagraf.enrich import DEFAULT_LLM_MODEL
    from supagraf.enrich.promise_matcher import rerank_all_promises

    totals = rerank_all_promises(
        top_k=top_k,
        model=model or DEFAULT_LLM_MODEL,
        limit=limit,
    )
    print(
        f"\nrerank-promises: promises={totals['promises']} "
        f"confirmed={totals['confirmed']} candidate={totals['candidate']} "
        f"rejected={totals['rejected']} skipped={totals['skipped']}"
    )


@app.command("restore-diacritics")
def cmd_restore_diacritics(
    dry_run: bool = typer.Option(False, "--dry-run",
        help="Print pending count and the first 5 pending rows without calling the LLM."),
    limit: int = typer.Option(0, "--limit", "-n",
        help="0 = no cap. Use small N to spot-check before full run."),
    throttle_ms: int = typer.Option(0, "--throttle-ms",
        help="Sleep N ms between LLM calls. Use 500 for 2 req/s on external APIs."),
):
    """LLM-restore Polish diacritics on promise rows that were ASCII-folded
    by the legacy fixture pipeline.

    Idempotent: skips rows where promises.diacritics_restored_at is non-null.
    Validation hard rule: fold(restored) must equal original byte-for-byte;
    rejections are logged via @with_model_run + enrichment_failures.
    """
    import time
    from supagraf.enrich.restore_diacritics import restore_promise_diacritics

    client = supabase()
    pending = (
        client.table("promises")
        .select("id, title, normalized_text, source_quote")
        .is_("diacritics_restored_at", "null")
        .order("id")
        .execute()
        .data or []
    )
    if limit > 0:
        pending = pending[:limit]
    logger.info("restore-diacritics: {} pending", len(pending))
    if dry_run:
        for row in pending[:5]:
            print(f"  id={row['id']}: {row['title'][:80]}")
        print(f"\ndry-run: {len(pending)} rows would be processed")
        return

    ok = failed = title_changed = normalized_changed = 0
    for row in pending:
        try:
            result = restore_promise_diacritics(
                entity_type="promise",
                entity_id=str(row["id"]),
                title=row["title"],
                normalized_text=row["normalized_text"],
                source_quote=row.get("source_quote"),
            )
            ok += 1
            if result["title_changed"]:
                title_changed += 1
            if result["normalized_changed"]:
                normalized_changed += 1
        except Exception as e:
            logger.error("restore-diacritics id={} failed: {!r}", row["id"], e)
            failed += 1
        if throttle_ms > 0:
            time.sleep(throttle_ms / 1000.0)
    print(
        f"\nrestore-diacritics: ok={ok} failed={failed} "
        f"title_changed={title_changed} normalized_changed={normalized_changed}"
    )
    if failed > 0:
        raise typer.Exit(3)


@app.command("fetch-polls")
def cmd_fetch_polls(
    slug: str = typer.Option(
        "Opinion_polling_for_the_next_Polish_parliamentary_election",
        "--slug",
        help="Wikipedia EN article slug (default: current Sejm-election polling)",
    ),
):
    """Fetch Wikipedia polls article + parse + load. Idempotent."""
    from supagraf.fetch.polls import fetch_polls
    from supagraf.stage.polls import stage_polls_from_wikipedia
    try:
        p = fetch_polls(slug=slug)
        inserted, updated = stage_polls_from_wikipedia(p)
        print(f"\nfetch-polls: inserted={inserted} updated={updated}")
    except Exception as e:
        logger.error("fetch-polls failed: {!r}", e)
        raise typer.Exit(code=3)


@app.command("refresh-aggregates")
def cmd_refresh_aggregates():
    """Refresh on-demand materialized views (mp_discipline_summary, mp_attendance,
    mp_activity_summary, minister_reply_stats, …).

    Heavy: rebuilds matviews from large source tables. PostgREST anon role's
    8s statement_timeout will reject this — invoke against service-role-keyed
    SUPABASE_KEY, or run the SQL directly via psql:
        select refresh_mp_discipline();
        select refresh_mp_activity();
        select refresh_minister_reply_stats();
    """
    from supagraf.db import call_rpc_scalar
    # Direct-PG path (SUPAGRAF_LOAD_DIRECT_DSN set) sidesteps Kong/PostgREST
    # timeouts — these REFRESH MATERIALIZED VIEW calls regularly exceed the
    # 60s nginx upstream timeout. Falls back to Supabase HTTP client when
    # DSN is unset (dev box reaches db over Cloudflare with longer timeout).
    for fn in (
        "refresh_mp_discipline",
        "refresh_mp_activity",
        "refresh_mp_rebellion_count",
        "refresh_voting_promise_link",
        "refresh_polls_mv",
        "refresh_minister_reply_stats",
    ):
        try:
            call_rpc_scalar(fn)
            print(f"refreshed: {fn}")
        except Exception as e:
            if "57014" in str(e) or "timeout" in str(e).lower():
                logger.error(
                    "timeout on {}; set SUPAGRAF_LOAD_DIRECT_DSN to bypass "
                    "Kong, or run `select {}();` via psql",
                    fn, fn,
                )
                raise typer.Exit(code=2)
            raise


@app.command("fetch")
def cmd_fetch(
    resource: str = typer.Argument(..., help="proceeding-bodies|mp-photos|acts|committees|committee-sittings|mp-office-expenses"),
    term: int = typer.Option(10, "--term", "-t"),
    throttle_s: float = typer.Option(0.2, "--throttle", help="seconds between requests (5 req/s default)"),
    limit: int = typer.Option(0, "--limit", "-n", help="cap on statements to attempt; 0 = no cap"),
    publisher: str = typer.Option("both", "--publisher",
        help="for acts: 'du' | 'mp' | 'both' (default 'both' covers Dziennik Ustaw + Monitor Polski)"),
    year: int = typer.Option(0, "--year",
        help="for acts: single year override (0 = use SUPAGRAF_ELI_YEARS env / default)"),
    force: bool = typer.Option(False, "--force",
        help="for committees: re-fetch all committee detail JSON, ignoring cached fixtures"),
    workers: int = typer.Option(1, "--workers", "-w",
        help="for mp-office-expenses: parallel fetch+OCR+LLM workers (1=sequential; "
             "recommended 4–6 for full 460-PDF run)"),
):
    """Fetch real-data assets that aren't on disk yet (HTML statement bodies, etc.).

    proceeding-bodies: backfill HTML transcript bodies for any proceeding-day
    whose statements lack body_text in the DB. Re-run `stage proceedings` +
    `load` afterwards to surface the new bodies.
    """
    if resource == "proceeding-bodies":
        from supagraf.fetch.proceedings_bodies import fetch_proceeding_bodies
        report = fetch_proceeding_bodies(term=term, throttle_s=throttle_s, limit=limit)
        print(f"\nfetch proceeding-bodies: {report}")
        return
    if resource == "mp-photos":
        # P3.3 — extension. Dispatch added here so `cmd_fetch` stays the single
        # entry point. `--limit` is ignored for this resource (state-driven).
        from supagraf.fetch.mp_photos import fetch_mp_photos
        rep = fetch_mp_photos(term=term, throttle_s=throttle_s)
        print(
            f"\nfetch mp-photos: checked={rep.checked} has_photo={rep.has_photo} "
            f"no_photo={rep.no_photo} errors={rep.errors}"
        )
        return
    if resource == "acts":
        # P4.2 — ELI acts. Years scoped via --year (single override) or
        # SUPAGRAF_ELI_YEARS env (CSV) defaulting to 2024,2025,2026.
        # `--publisher` selects DU (Dziennik Ustaw), MP (Monitor Polski),
        # or 'both' (default — needed for full process->act coverage; ~half
        # the passed processes culminate in MP entries, not DU).
        # `--limit` caps detail fetches per (publisher, year).
        import os
        from supagraf.fetch.acts import fetch_acts
        if year > 0:
            years = [year]
        else:
            years_env = os.environ.get("SUPAGRAF_ELI_YEARS", "2024,2025,2026")
            years = [int(y.strip()) for y in years_env.split(",") if y.strip()]
        report = fetch_acts(
            years=years,
            publisher=publisher,
            throttle_s=throttle_s,
            limit_per_year=limit,
        )
        print(f"\nfetch acts: {report}")
        return
    if resource == "committees":
        # Phase G — committees roster. Per-committee idempotent (skips
        # cached fixtures unless --force). Throttle defaults to 1.0s here
        # to stay polite even though committee count is small.
        from supagraf.fetch.committees import fetch_committees
        rep = fetch_committees(term=term, force=force, throttle_s=max(throttle_s, 1.0))
        print(f"\nfetch committees: {rep.to_dict()}")
        return
    if resource == "committee-sittings":
        # Sittings + agenda + video links per committee. Always re-fetches
        # (mutable). Throttle floor 1.0s — committee count is small.
        from supagraf.fetch.committee_sittings import fetch_committee_sittings
        rep = fetch_committee_sittings(term=term, throttle_s=max(throttle_s, 1.0))
        print(f"\nfetch committee-sittings: {rep.to_dict()}")
        return
    if resource == "mp-office-expenses":
        # MP office expense reports (sprawozdania wydatków biur poselskich).
        # No Sejm API — PDFs hosted on orka.sejm.gov.pl. Reads
        # `fixtures/sejm/mp_office_expenses/_index.json` (manually curated:
        # one entry per {term, mp_id, year, pdf_url}), fetches each PDF
        # behind a 1s throttle, parses the standardized BOP form, writes
        # per-MP fixtures. Year defaults to 2025 (current reporting cycle),
        # override with --year.
        from supagraf.fetch.mp_office_expenses import fetch_mp_office_expenses
        target_year = year if year > 0 else 2025
        rep = fetch_mp_office_expenses(
            term=term,
            year=target_year,
            throttle_s=max(throttle_s, 1.0),
            force=force,
            workers=workers,
        )
        print(f"\nfetch mp-office-expenses: {rep.to_dict()}")
        return
    logger.error("unknown fetch resource: {}", resource)
    raise typer.Exit(1)


@app.command("refresh-stale-eli")
def cmd_refresh_stale_eli(
    term: int = typer.Option(10, "--term", "-t"),
    max_age_days: int = typer.Option(21, "--max-age-days",
        help="reserved for future last_refreshed_at filter (migration 0047). "
             "Today, all passed-but-unlinked processes are re-pulled."),
):
    """Re-fetch upstream process JSON for passed processes whose eli_act_id
    is still null, then fetch the corresponding ELI act detail (DU or MP)
    and run backfill_process_act_links.

    Plugs the publication-lag gap: Sejm passes a bill, Dz.U./MP publishes
    weeks later, our daily fetch missed the window. Run from cron.
    """
    from supagraf.fetch.acts import refresh_stale_eli
    out = refresh_stale_eli(term=term, max_age_days=max_age_days)
    print(f"\nrefresh-stale-eli: {out}")


@app.command("enrich-statements")
def cmd_enrich_statements(
    term: int = typer.Option(10, "--term", "-t"),
    limit: int = typer.Option(0, "--limit", "-n", help="0 = no cap"),
):
    """Embed proceeding_statements that have body_text but no embedding yet.

    Pending = body_text is not null AND embedded_at is null. Uses partial index
    statement_embedding_pending_idx (0033).
    """
    from supagraf.enrich.embed_statement import embed_pending_statements
    n_ok, n_failed = embed_pending_statements(term=term, limit=limit)
    print(f"\nenrich-statements: ok={n_ok} failed={n_failed}")
    if n_failed > 0:
        raise typer.Exit(3)


@app.command("enrich-utterances")
def cmd_enrich_utterances(
    term: int = typer.Option(10, "--term", "-t"),
    sitting: int = typer.Option(None, "--sitting", "-s",
                                help="Limit to a single sitting_num"),
    limit: int = typer.Option(0, "--limit", "-n", help="0 = no cap"),
    model: str = typer.Option(None, "--model", "-m",
                              help="LLM model (default: SUPAGRAF_UTTERANCE_LLM_MODEL or deepseek-v4-flash)"),
):
    """LLM enrichment over proceeding_statements: viral_score/quote/reason +
    tone + topic_tags + mentioned_entities + key_claims + addressee + summary.

    Powers Tygodnik viral_quote section (mig 0062 viral_quote_events_v) and
    side-features (MP profiles, fact-check, search). One LLM call per row;
    schema in supagraf/enrich/utterance_enrich.py:UtteranceEnrichmentOutput.

    Pending = enrichment_prompt_sha256 IS NULL AND body_text IS NOT NULL.
    """
    from supagraf.enrich.utterance_enrich import (
        UTTERANCE_LLM_MODEL,
        enrich_statements,
    )
    n_ok, n_failed = enrich_statements(
        term=term,
        sitting_num=sitting,
        limit=limit,
        llm_model=model or UTTERANCE_LLM_MODEL,
    )
    print(f"\nenrich-utterances: ok={n_ok} failed={n_failed}")
    if n_failed > 0:
        raise typer.Exit(3)


@app.command("enrich-act-short-title")
def cmd_enrich_act_short_title(
    limit: int = typer.Option(0, "--limit", "-n", help="0 = no cap"),
    days: int = typer.Option(0, "--days", "-d",
                             help="Limit to acts with legal_status_date in last N days (0 = no time limit)"),
    force: bool = typer.Option(False, "--force",
                               help="Re-enrich rows already enriched (default: skip <30 days)"),
    model: str = typer.Option(None, "--model", "-m",
                              help="LLM model (default: SUPAGRAF_ACT_LLM_MODEL or deepseek-v4-flash)"),
):
    """Plain-Polish short_title for ELI acts. LLM-only path
    (deepseek-v4-flash) — rewrites ceremonial Obwieszczenie/Ustawa/Rozp.
    titles into ≤80-char headlines for the tygodnik card. Idempotent: skips
    rows enriched <30 days unless --force.
    """
    from supagraf.enrich.act_short_title import (
        ACT_LLM_MODEL,
        enrich_acts,
    )
    days_arg: int | None = days if days > 0 else None
    n_llm, n_failed = enrich_acts(
        limit=limit,
        days=days_arg,
        force=force,
        llm_model=model or ACT_LLM_MODEL,
    )
    print(f"\nenrich-act-short-title: llm={n_llm} failed={n_failed}")
    if n_failed > 0:
        raise typer.Exit(3)


@app.command("verify-act-kind")
def cmd_verify_act_kind(
    per_kind: int = typer.Option(50, "--per-kind", "-n",
                                 help="Sample size per act_kind"),
    counts_only: bool = typer.Option(False, "--counts",
                                     help="Print kind counts only, skip sample dump"),
):
    """Eyeball act_kind classifications. Use BEFORE flipping the Tygodnik
    `act_kind` filter on, to confirm compute_act_kind() (migration 0077)
    didn't mis-bucket edge cases. Prints up to N rows per kind plus a
    final tally.
    """
    from supagraf.enrich.acts import ACT_KINDS, kind_counts, print_sample

    if not counts_only:
        print_sample(per_kind=per_kind)

    print("\n=== act_kind counts ===")
    counts = kind_counts()
    total = sum(counts.values())
    for kind in (*ACT_KINDS, "_null_"):
        n = counts.get(kind, 0)
        if n:
            pct = (n / total * 100.0) if total else 0.0
            print(f"  {kind:18s}  {n:6d}  ({pct:5.1f}%)")
    print(f"  {'TOTAL':18s}  {total:6d}")


@app.command("enrich-voting-short-title")
def cmd_enrich_voting_short_title(
    term: int = typer.Option(10, "--term", "-t"),
    limit: int = typer.Option(0, "--limit", "-n", help="0 = no cap"),
    days: int = typer.Option(0, "--days", "-d",
                             help="Limit to votings in last N days (0 = no time limit)"),
    force: bool = typer.Option(False, "--force",
                               help="Re-enrich rows already enriched (default: skip <30 days)"),
    model: str = typer.Option(None, "--model", "-m",
                              help="LLM model (default: SUPAGRAF_VOTING_LLM_MODEL or deepseek-v4-flash)"),
):
    """Plain-Polish short_title for votings. Fast-path via voting_print_links
    role='main' linked print short_title (no LLM cost), fallback to LLM
    (deepseek-v4-flash) for the rest. Idempotent: skips rows enriched <30 days
    unless --force.
    """
    from supagraf.enrich.voting_short_title import (
        VOTING_LLM_MODEL,
        enrich_votings,
    )
    days_arg: int | None = days if days > 0 else None
    n_fast, n_llm, n_failed = enrich_votings(
        term=term,
        limit=limit,
        days=days_arg,
        force=force,
        llm_model=model or VOTING_LLM_MODEL,
    )
    print(
        f"\nenrich-voting-short-title: fast={n_fast} llm={n_llm} failed={n_failed}"
    )
    if n_failed > 0:
        raise typer.Exit(3)


@app.command("import-patronite")
def cmd_import_patronite(
    month: str = typer.Option(..., "--month", help="YYYY-MM-01"),
    csv_path: Path = typer.Option(..., "--csv", help="path to Patronite export CSV"),
):
    """Idempotent monthly Patronite snapshot import."""
    from supagraf.import_csv.patronite import import_patronite_csv
    report = import_patronite_csv(month=month, csv_path=csv_path)
    print(report)


if __name__ == "__main__":
    app()
