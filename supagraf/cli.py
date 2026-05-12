"""Top-level CLI for supagraf operations."""
from __future__ import annotations

import os
from enum import Enum
from pathlib import Path
from typing import Callable

import typer
from loguru import logger

from supagraf.db import supabase
from supagraf.fixtures.storage import fixtures_root
from supagraf.load import run_core_load
from supagraf.stage import acts as stage_acts
from supagraf.stage import bills as stage_bills
from supagraf.stage import clubs as stage_clubs
from supagraf.stage import committees as stage_committees
from supagraf.stage import committee_sittings as stage_committee_sittings
from supagraf.stage import districts as stage_districts
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
    resources: list[str] = typer.Argument(None, help="mps|clubs|votings|committees|committee_sittings|processes|bills|questions|videos|proceedings|districts|postcodes|promises|acts (default: all)"),
    term: int = 10,
):
    """Stage fixture JSON to _stage_* tables."""
    targets = resources or [
        "clubs", "mps", "votings", "committees", "committee_sittings",
        "processes", "bills",
        "questions", "videos", "proceedings",
        "districts", "postcodes", "promises",
        "acts",
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


@app.command("daily")
def cmd_daily(
    term: int = typer.Option(10, "--term", "-t"),
    skip_fetch: bool = typer.Option(False, "--skip-fetch", help="skip Sejm API fetch"),
    skip_enrich: bool = typer.Option(False, "--skip-enrich"),
    skip_embed: bool = typer.Option(False, "--skip-embed"),
):
    """End-to-end daily incremental: fetch new Sejm data -> stage -> load
    -> enrich (unified) -> embed (qwen) -> refresh aggregates.

    Designed for cron / GitHub Actions: idempotent (skips already-processed
    items via partial-index pending filters), bounded cost (LLM only on
    not-yet-summarized prints), and safe to interrupt at any phase.

    Phases (each independent — `--skip-*` flags re-run only what's needed):
      1. fetch:  refresh fixtures from api.sejm.gov.pl (clubs/mps/votings/
                 prints/processes/proceedings/statements + bodies + photos)
      2. stage:  fixtures -> _stage_* tables
      3. load:   _stage_* -> production tables
      4. enrich: unified Gemini call on prints with no impact_punch yet
      5. embed:  qwen3 embeddings on prints/statements/promises with no
                 embedded_at marker yet
      6. refresh: matviews mp_discipline_summary + mp_attendance +
                 mp_activity_summary + minister_reply_stats

    Exit code 0 only if every phase finished without unhandled exceptions.
    """
    if not skip_fetch:
        logger.info("=== daily phase 1/6: fetch ===")
        # Sejm API base resources — incremental on the API side (each
        # capture-then-cache fetcher only writes new fixture files).
        from supagraf.fetch.proceedings_bodies import fetch_proceeding_bodies
        from supagraf.fetch.mp_photos import fetch_mp_photos
        from supagraf.fetch.committees import fetch_committees
        try:
            fetch_proceeding_bodies(term=term)
        except Exception as e:
            logger.error("proceedings_bodies fetch failed: {!r}", e)
        try:
            fetch_mp_photos(term=term)
        except Exception as e:
            logger.error("mp_photos fetch failed: {!r}", e)
        # Committees roster: idempotent — skips already-cached fixtures.
        # Always runs the list call so new committees mid-term are picked up.
        try:
            fetch_committees(term=term)
        except Exception as e:
            logger.error("committees fetch failed: {!r}", e)
        # Committee sittings: ALWAYS re-fetches (mutable: status PLANNED→
        # ONGOING→FINISHED, agenda edits). ~31 GETs/day at 1s throttle.
        try:
            from supagraf.fetch.committee_sittings import fetch_committee_sittings
            fetch_committee_sittings(term=term)
        except Exception as e:
            logger.error("committee_sittings fetch failed: {!r}", e)

    logger.info("=== daily phase 2-3/6: stage + load ===")
    cmd_stage(None, term=term)
    cmd_load(term=term)

    if not skip_enrich:
        logger.info("=== daily phase 4/6: enrich (unified) ===")
        # 0 limit = process every pending print. Daily volume is tiny
        # (~5-30 new drukı per session day) so cost stays bounded.
        cmd_enrich_prints(kind=EnrichKind.unified, term=term, limit=0)

    if not skip_embed:
        logger.info("=== daily phase 5/6: embed ===")
        cmd_enrich_prints(kind=EnrichKind.embed, term=term, limit=0)
        # Statements + promises run via their dedicated commands.
        try:
            cmd_enrich_statements(term=term, limit=0)
        except Exception as e:
            logger.error("statement embed failed: {!r}", e)
        try:
            cmd_enrich_promises(kind="embed", limit=0)
        except Exception as e:
            logger.error("promise embed failed: {!r}", e)

    logger.info("=== daily phase 6/6: refresh aggregates ===")
    try:
        cmd_refresh_aggregates()
    except Exception as e:
        logger.error("refresh aggregates failed: {!r}", e)

    # Atlas matviews — voting_by_club_mv + klub_pair_agreement_mv. Refresh
    # CONCURRENTLY (no read lock) so frontend keeps serving during reload.
    logger.info("=== daily: refresh atlas matviews ===")
    try:
        r = supabase().rpc("refresh_atlas_matviews", {"p_term": term}).execute()
        logger.info("refresh_atlas_matviews: {}", r.data)
    except Exception as e:
        logger.error("refresh_atlas_matviews failed: {!r}", e)

    # voting.short_title — citizen-readable headline parallel to prints.short_title.
    # Daily runs the last-30d slice only; idempotent so already-enriched rows are
    # skipped. Fast-path (linked-print copy) costs nothing; LLM fallback gated by
    # SUPAGRAF_VOTING_LLM_MODEL availability — failures here don't break daily.
    logger.info("=== daily: enrich-voting-short-title (last 30d) ===")
    try:
        from supagraf.enrich.voting_short_title import enrich_votings
        n_fast, n_llm, n_failed = enrich_votings(term=term, days=30)
        logger.info(
            "enrich_voting_short_title fast={} llm={} failed={}",
            n_fast, n_llm, n_failed,
        )
    except Exception as e:
        logger.error("enrich_voting_short_title failed: {!r}", e)

    # acts.short_title — Tygodnik "WCHODZI W ŻYCIE" headline. Testing-phase
    # rollout: gated by SUPAGRAF_ENABLE_ACT_SHORT_TITLE=1; default off until
    # the 30-day slice has been observed and the rewrites look clean.
    if os.environ.get("SUPAGRAF_ENABLE_ACT_SHORT_TITLE") == "1":
        logger.info("=== daily: enrich-act-short-title (last 30d) ===")
        try:
            from supagraf.enrich.act_short_title import enrich_acts
            n_llm, n_failed = enrich_acts(days=30)
            logger.info(
                "enrich_act_short_title llm={} failed={}", n_llm, n_failed,
            )
        except Exception as e:
            logger.error("enrich_act_short_title failed: {!r}", e)
    else:
        logger.info("=== daily: enrich-act-short-title SKIPPED (set SUPAGRAF_ENABLE_ACT_SHORT_TITLE=1 to enable) ===")

    # Polls (sondaże) — Wikipedia EN scrape, idempotent. Failure here does
    # not block downstream MV refreshes for other resources.
    logger.info("=== daily: fetch-polls ===")
    try:
        from supagraf.fetch.polls import fetch_polls
        from supagraf.stage.polls import stage_polls_from_wikipedia
        p = fetch_polls()
        inserted, updated = stage_polls_from_wikipedia(p)
        logger.info("fetch_polls inserted={} updated={}", inserted, updated)
    except Exception as e:
        logger.error("fetch_polls failed: {!r}", e)

    # Atlas A5: club-switch history derived from votes.club_ref series.
    # Idempotent (~1.8s) — re-running after a fresh load picks up any new
    # transitions detected from votes added since last run.
    logger.info("=== daily: backfill mp_club_history ===")
    try:
        from supagraf.backfill.mp_club_history import backfill_mp_club_history
        out = backfill_mp_club_history(term=term)
        logger.info("backfill_mp_club_history: {}", out)
    except Exception as e:
        logger.error("backfill_mp_club_history failed: {!r}", e)

    # Backfill processes.eli_act_id from acts table — idempotent SQL fn shipped
    # in 0038. Runs after fetch/load so newly-published acts get linked to the
    # processes that culminated in them. Cheap (single UPDATE), so no skip flag.
    logger.info("=== daily: backfill_process_act_links ===")
    try:
        r = supabase().rpc("backfill_process_act_links", {"p_term": term}).execute()
        logger.info("backfill_process_act_links affected={}", r.data)
    except Exception as e:
        logger.error("backfill_process_act_links failed: {!r}", e)

    # Re-pull processes that passed but still lack eli_act_id (Dz.U./MP
    # publication often lags Sejm passage by 2-4 weeks). Tolerant: errors
    # logged but daily continues — this is a tail-fix job, not critical path.
    logger.info("=== daily: refresh-stale-eli ===")
    try:
        from supagraf.fetch.acts import refresh_stale_eli
        out = refresh_stale_eli(term=term)
        logger.info("refresh_stale_eli: {}", out)
    except Exception as e:
        logger.error("refresh_stale_eli failed: {!r}", e)

    logger.info("daily complete")


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


def _resolve_pdf_relpath(print_row: dict) -> str | None:
    """Pick best document attachment: prefer .docx (clean text from Sejm's
    editable source) over .pdf (often a scanned signed copy without text layer).

    Returns relpath under fixtures/ or None if no usable document found.
    """
    atts = sorted(print_row.get("attachments") or [], key=lambda a: a.get("ordinal", 0))
    docx_match = pdf_match = None
    for a in atts:
        fn = a.get("filename")
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
    return f"sejm/prints/{print_row['number']}__{chosen}"


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
    needs_pdf = kind != EnrichKind.embed  # embed reads summary from DB; others need PDF
    for row in prints_rows:
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
        except Exception as e:
            # Scanned PDFs (no text layer) raise from pymupdf+pypdf. Treat as
            # 'skipped' rather than 'failed' so totals reflect actionable
            # failures (LLM/network/schema), not an inherent property of the
            # source. The audit row is still written by @with_model_run with
            # status='failed' for traceability.
            msg = str(e)
            if "0 chars" in msg or "scanned PDF" in msg or "no .pdf attachment" in msg:
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
):
    """Run an enrichment job over prints that don't yet have it.

    Uses partial indexes (summary_pending, stance_pending, mentions_pending,
    embedding_pending) so each run scans only what's left. Failures don't
    abort the loop; check enrichment_failures + model_runs(status='failed')
    for diagnostics. Exit 3 if any failures so scripts notice.
    """
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
    client = supabase()
    for fn in (
        "refresh_mp_discipline",
        "refresh_mp_activity",
        "refresh_mp_rebellion_count",
        "refresh_voting_promise_link",
        "refresh_polls_mv",
        "refresh_minister_reply_stats",
    ):
        try:
            client.rpc(fn).execute()
            print(f"refreshed: {fn}")
        except Exception as e:
            if "57014" in str(e) or "timeout" in str(e).lower():
                logger.error(
                    "PostgREST timeout on {}; use service-role key or run "
                    "`select {}();` via psql",
                    fn, fn,
                )
                raise typer.Exit(code=2)
            raise


@app.command("fetch")
def cmd_fetch(
    resource: str = typer.Argument(..., help="proceeding-bodies|mp-photos|acts|committees|committee-sittings"),
    term: int = typer.Option(10, "--term", "-t"),
    throttle_s: float = typer.Option(0.2, "--throttle", help="seconds between requests (5 req/s default)"),
    limit: int = typer.Option(0, "--limit", "-n", help="cap on statements to attempt; 0 = no cap"),
    publisher: str = typer.Option("both", "--publisher",
        help="for acts: 'du' | 'mp' | 'both' (default 'both' covers Dziennik Ustaw + Monitor Polski)"),
    year: int = typer.Option(0, "--year",
        help="for acts: single year override (0 = use SUPAGRAF_ELI_YEARS env / default)"),
    force: bool = typer.Option(False, "--force",
        help="for committees: re-fetch all committee detail JSON, ignoring cached fixtures"),
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
