"""Resolve queued agenda → print references once the prints exist.

`load_proceeding` queues `unresolved_agenda_print_refs` for agenda points
that name a print not loaded yet. This surgical relink moves them into
`agenda_item_prints` without re-running the proceedings loader.
"""
from __future__ import annotations


from loguru import logger

from supagraf.db import supabase


def relink_agenda_print_refs(*, term: int) -> None:
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
    logger.info("relink: {} unresolved agenda refs to check", len(unresolved))

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
        "relink: {} of {} unresolved refs now point to real prints",
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
        "relink: relink done — agenda_item_prints +{} rows, "
        "{} unresolved refs marked resolved",
        inserted_rows, len(resolvable),
    )
