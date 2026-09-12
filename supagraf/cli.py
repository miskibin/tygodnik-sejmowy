"""Top-level CLI for supagraf operations."""
from __future__ import annotations

import os
import re
from pathlib import Path

import typer
from loguru import logger

from supagraf.db import supabase
from supagraf.load import run_core_load
from supagraf.stage import districts as stage_districts
from supagraf.stage import mp_office_expenses as stage_mp_office_expenses
from supagraf.stage import promises as stage_promises

app = typer.Typer(no_args_is_help=True, add_completion=False)


@app.command("network")
def cmd_network(
    term: int = typer.Option(10, min=1),
    days: int = typer.Option(180, min=1, max=365),
    output: Path | None = typer.Option(None, "--output", help="Save the research snapshot as JSON"),
    publish: bool = typer.Option(False, "--publish", help="Publish to the database after a successful build"),
):
    """Build the experimental network. Read-only unless --publish is supplied."""
    import json
    from supagraf.network import build_network

    payload = build_network(term=term, days=days)
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    if publish:
        from supagraf.network_publish import publish_network
        publish_network(payload)
    typer.echo(json.dumps({"term": term, "nodes": len(payload["nodes"]),
                           "sampling": payload["sampling"], "published": publish}, ensure_ascii=False))


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
    resources: list[str] = typer.Argument(None, help="districts|postcodes|promises|mp_office_expenses (default: all)"),
    term: int = 10,
):
    """Stage the external (non-Sejm-API) fixture JSON to `_stage_*`.

    Sejm resources go through `sync <resource>`; this covers the sources that
    are still curated as files under fixtures/external/.
    """
    runners = {
        "districts": stage_districts.stage_districts,
        "postcodes": stage_districts.stage_district_postcodes,
        "promises": stage_promises.stage_promises,
        "mp_office_expenses": stage_mp_office_expenses.stage,
    }
    for r in resources or list(runners):
        if r not in runners:
            logger.error("unknown resource: {} (known: {})", r, ", ".join(runners))
            raise typer.Exit(1)
        report = runners[r](term=term)
        if not report.ok():
            logger.error("stage {} failed: {} errors: {}", r, len(report.errors), report.errors[:5])
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


# ---- enrich subcommand ----------------------------------------------------


@enrich_app.command("images")
def cmd_enrich_images(
    term: int = typer.Option(10, "--term"),
    sitting: int | None = typer.Option(None, "--sitting", help="Default: latest sitting with votes"),
    dry_run: bool = typer.Option(False, "--dry-run"),
    force: bool = typer.Option(False, "--force"),
):
    """Match optional licensed Commons photos. No LLM calls; one sitting only."""
    import json
    from supagraf.enrich.story_images import run_images
    result = run_images(term=term, sitting=sitting, dry_run=dry_run, force=force)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["failed"]:
        raise typer.Exit(3)


@enrich_app.command("images-pipeline")
def cmd_images_pipeline(
    input_file: Path = typer.Option(..., "--input", exists=True, dir_okay=False, help="JSON list: term, number, title, summary"),
    output: Path = typer.Option(Path("artifacts/illustrations"), "--output", help="Local report, selected assets and HTML gallery"),
    generate: bool = typer.Option(False, "--generate", help="Enable bounded FLUX inference on SFGPU for generic scenes"),
):
    """Plan with DeepSeek, collect images and review them; never publish to the live site."""
    import json
    from supagraf.db import load_dotenv
    load_dotenv()
    from supagraf.enrich.illustrations.models import Article
    from supagraf.enrich.illustrations.pipeline import run_pipeline
    from supagraf.enrich.illustrations.gpu import generate_candidates
    from supagraf.enrich.illustrations.gallery import render_gallery
    try:
        raw = json.loads(input_file.read_text(encoding="utf-8-sig"))
        if not isinstance(raw, list) or not 1 <= len(raw) <= 20:
            raise ValueError("Input must contain 1 to 20 articles")
        articles = [Article.model_validate(row) for row in raw]
    except (ValueError, OSError) as exc:
        raise typer.BadParameter(str(exc), param_hint="--input") from None

    from supagraf.enrich.illustrations.sourcing import find_authentic, provider_fingerprint
    from supagraf.enrich.illustrations.gpu import runtime_fingerprint
    from supagraf.enrich.llm import usage_snapshot
    usage_before = usage_snapshot()

    report = run_pipeline(articles, output.resolve(), generate=generate,
                          authentic_search=find_authentic, generator=generate_candidates,
                          authentic_fingerprint=provider_fingerprint(), generator_fingerprint=runtime_fingerprint()["fingerprint"])
    usage_after = usage_snapshot()
    report["metrics"]["llm_usage"] = {k: usage_after[k] - usage_before[k] for k in usage_after}
    (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    selected = [{"article": row["article"], "candidate": item["candidate"],
                 "review": item["review"], "publication": "not published"}
                for row in report["articles"] for item in row.get("candidates", [])
                if item["candidate"]["id"] == row.get("selected_candidate_id")]
    (output / "selected.json").write_text(json.dumps(selected, ensure_ascii=False, indent=2), encoding="utf-8")
    gallery = render_gallery(report, output)
    print(json.dumps({"report": str(output / "report.json"), "gallery": str(gallery),
                      "metrics": report.get("metrics", {}), "publication": "preview only"},
                     ensure_ascii=False, indent=2))
    if any(row.get("candidate_error") or row["plan"]["reason"].startswith("Planning unavailable:")
           or any("unavailable:" in item["review"]["reason"].lower() for item in row.get("candidates", []))
           for row in report["articles"]):
        raise typer.Exit(3)


@enrich_app.command("prints")
def cmd_enrich_prints(
    kind: str = typer.Option("unified", "--kind", "-k", help="unified | embed"),
    term: int = typer.Option(10, "--term", "-t"),
    limit: int = typer.Option(0, "--limit", "-n", help="0 = no cap"),
    workers: int = typer.Option(0, "--workers", "-w", help="concurrent prints (0 = SUPAGRAF_ENRICH_WORKERS)"),
    sitting: int | None = typer.Option(None, "--sitting", "-s", help="scope unified enrichment to one sitting"),
    dry_run: bool = typer.Option(False, "--dry-run", help="print the frozen one-sitting manifest; never call the LLM or write"),
    force: bool = typer.Option(False, "--force", help="with --sitting, re-run rows already processed by this prompt"),
    prompt_version: int = typer.Option(9, "--prompt-version", help="with --sitting, opt-in citizen-review prompt version"),
):
    """Unified LLM enrichment (all citizen-facing fields in one call) or the
    qwen3 embedding pass over prints that still lack it. Exit 3 on failures."""
    from supagraf.enrich.jobs import DEFAULT_WORKERS, embed_pending_prints, enrich_pending_prints

    if kind == "unified":
        if sitting is not None:
            from supagraf.enrich.scoped_prints import run_scoped_prints
            st = run_scoped_prints(
                term=term, sitting=sitting, dry_run=dry_run, force=force,
                prompt_version=prompt_version, limit=limit, workers=workers or 1,
            )
            if dry_run:
                import json
                typer.echo(json.dumps(st.to_dict(), ensure_ascii=False, indent=2))
        else:
            if dry_run or force:
                logger.error("--dry-run and --force require --sitting")
                raise typer.Exit(1)
            st = enrich_pending_prints(term=term, limit=limit, workers=workers or DEFAULT_WORKERS)
    elif kind == "embed":
        if sitting is not None or dry_run or force:
            logger.error("--sitting/--dry-run/--force are supported only for unified enrichment")
            raise typer.Exit(1)
        st = embed_pending_prints(term=term, limit=limit)
    else:
        logger.error("unknown kind {!r}: expected unified | embed", kind)
        raise typer.Exit(1)
    logger.info("enrich {}: {}", kind, st.to_dict())
    if st.failed or st.aborted:
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
    resource: str = typer.Argument(..., help="mp-photos|mp-office-expenses"),
    term: int = typer.Option(10, "--term", "-t"),
    throttle_s: float = typer.Option(0.2, "--throttle", help="seconds between requests (5 req/s default)"),
    limit: int = typer.Option(0, "--limit", "-n", help="cap on statements to attempt; 0 = no cap"),
    year: int = typer.Option(0, "--year", help="for mp-office-expenses: reporting year (default 2025)"),
    force: bool = typer.Option(False, "--force", help="for mp-office-expenses: re-fetch cached PDFs"),
    workers: int = typer.Option(1, "--workers", "-w",
        help="for mp-office-expenses: parallel fetch+OCR+LLM workers (1=sequential; "
             "recommended 4–6 for full 460-PDF run)"),
):
    """Fetch real-data assets outside the Sejm JSON API (photos,
    office-expense PDFs). Sejm + ELI resources go through `sync`."""
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
                              help="LLM model (default: SUPAGRAF_UTTERANCE_LLM_MODEL or deepseek-flash)"),
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
                               help="Re-enrich rows already enriched (default: reuse existing titles)"),
    model: str = typer.Option(None, "--model", "-m",
                              help="LLM model (default: SUPAGRAF_ACT_LLM_MODEL or deepseek-flash)"),
):
    """Plain-Polish short_title for ELI acts. LLM-only path
    (deepseek-flash) — rewrites ceremonial Obwieszczenie/Ustawa/Rozp.
    titles into ≤80-char headlines for the tygodnik card. Idempotent: skips
    existing short titles unless --force.
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
                               help="Re-enrich rows already enriched (default: reuse existing titles)"),
    model: str = typer.Option(None, "--model", "-m",
                              help="LLM model (default: SUPAGRAF_VOTING_LLM_MODEL or deepseek-flash)"),
):
    """Plain-Polish short_title for votings. Fast-path via voting_print_links
    role='main' linked print short_title (no LLM cost), fallback to LLM
    (deepseek-flash) for the rest. Idempotent: skips existing short titles
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
