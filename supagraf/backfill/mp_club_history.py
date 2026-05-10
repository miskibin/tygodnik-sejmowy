"""Atlas A5: derive mp_club_history from the votes.club_ref series.

The Sejm API has no first-class clubChanges endpoint, so we walk each MP's
vote series ordered by voting date and emit one row per detected transition
plus one synthetic "initial assignment" row (from_club_id=NULL) per MP.

The heavy lifting (LAG window over ~280k vote rows) lives in the
`detect_mp_club_transitions(p_term)` Postgres function shipped in
migration 0054. This module just unpacks the function's output, resolves
club short-codes to FK ids via the `clubs` table, and upserts into
`mp_club_history` idempotently.
"""
from __future__ import annotations

import time

from loguru import logger

from supagraf.db import supabase


def backfill_mp_club_history(*, term: int = 10, dry_run: bool = False) -> dict[str, int]:
    """Backfill mp_club_history for the given term.

    Idempotent: ON CONFLICT (term, mp_id, change_date, to_club_id) DO NOTHING
    via PostgREST upsert. Re-running yields zero new rows.
    """
    client = supabase()
    t0 = time.perf_counter()

    # 1. Resolve club short-code -> clubs.id for this term.
    clubs = (
        client.table("clubs").select("id, club_id").eq("term", term).execute().data or []
    )
    short_to_id: dict[str, int] = {c["club_id"]: c["id"] for c in clubs}
    logger.info(
        "mp_club_history term={}: loaded {} clubs for FK resolution", term, len(short_to_id)
    )

    # 2. Pull every transition in one RPC call (set-based SQL, fast).
    rpc_t0 = time.perf_counter()
    res = client.rpc("detect_mp_club_transitions", {"p_term": term}).execute()
    transitions = res.data or []
    rpc_elapsed = time.perf_counter() - rpc_t0
    logger.info(
        "mp_club_history term={}: detect_mp_club_transitions returned {} rows in {:.2f}s",
        term, len(transitions), rpc_elapsed,
    )

    # 3. Map to rows for mp_club_history. Skip transitions whose to_club_short
    # isn't in the clubs table (shouldn't happen, log if it does).
    rows: list[dict] = []
    unresolved_to: dict[str, int] = {}
    unresolved_from: dict[str, int] = {}
    for t in transitions:
        to_short = t.get("to_club_short")
        from_short = t.get("from_club_short")
        if not to_short:
            continue
        to_id = short_to_id.get(to_short)
        if to_id is None:
            unresolved_to[to_short] = unresolved_to.get(to_short, 0) + 1
            continue
        from_id: int | None = None
        if from_short is not None:
            from_id = short_to_id.get(from_short)
            if from_id is None:
                unresolved_from[from_short] = unresolved_from.get(from_short, 0) + 1
                # Keep the row with from_id=NULL? No — it would look like an
                # initial assignment. Skip and warn instead.
                continue
        rows.append({
            "term": term,
            "mp_id": t["mp_id"],
            "from_club_id": from_id,
            "to_club_id": to_id,
            "change_date": t["change_date"],
            "source": "vote_series_derived",
        })

    if unresolved_to:
        logger.warning("mp_club_history: unresolved to_club_short codes: {}", unresolved_to)
    if unresolved_from:
        logger.warning("mp_club_history: unresolved from_club_short codes: {}", unresolved_from)

    if dry_run:
        elapsed = time.perf_counter() - t0
        logger.info(
            "mp_club_history term={} DRY-RUN: would insert {} rows ({:.2f}s)",
            term, len(rows), elapsed,
        )
        return {"inserted": 0, "updated": 0, "skipped": len(rows), "elapsed_s": round(elapsed, 2)}

    # 4. Pull existing keys once so the reported `inserted` count reflects
    # truly new rows (not just the upsert request size). PostgREST upsert
    # with ignore_duplicates=True is a no-op on conflict; the DB stays stable
    # but we want accurate metrics on re-run.
    existing = (
        client.table("mp_club_history")
        .select("mp_id,change_date,to_club_id")
        .eq("term", term)
        .execute()
        .data
        or []
    )
    existing_keys = {
        (r["mp_id"], r["change_date"], r["to_club_id"]) for r in existing
    }
    new_rows = [
        r for r in rows
        if (r["mp_id"], r["change_date"], r["to_club_id"]) not in existing_keys
    ]
    skipped_existing = len(rows) - len(new_rows)

    # Upsert in batches. ON CONFLICT on the unique (term, mp_id, change_date,
    # to_club_id) tuple makes this safe to re-run.
    inserted = 0
    if new_rows:
        for i in range(0, len(new_rows), 500):
            batch = new_rows[i : i + 500]
            client.table("mp_club_history").upsert(
                batch,
                on_conflict="term,mp_id,change_date,to_club_id",
                ignore_duplicates=True,
            ).execute()
            inserted += len(batch)

    elapsed = time.perf_counter() - t0
    logger.info(
        "mp_club_history term={}: inserted={} skipped_existing={} elapsed={:.2f}s",
        term, inserted, skipped_existing, elapsed,
    )
    return {
        "inserted": inserted,
        "updated": 0,
        "skipped": skipped_existing,
        "elapsed_s": round(elapsed, 2),
    }
