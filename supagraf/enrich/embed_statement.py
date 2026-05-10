"""Enrichment job: proceeding_statement -> embedding row + provenance stamp.

Mirrors embed_promise.py — a no-prompt embedding pass over body_text. Each
statement is embedded once per (entity_type, entity_id, model) tuple via the
shared embeddings table. Provenance columns on proceeding_statements (added
in 0033) flag "is this row embedded?" without joining embeddings.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from loguru import logger

from supagraf.db import supabase
from supagraf.enrich.audit import with_model_run
from supagraf.enrich.embed import (
    DEFAULT_EMBED_MODEL,
    EMBED_DIM,
    EmbedResult,
    embed_and_store,
)

JOB_NAME = "embed_statement"
# nomic-embed-text-v2-moe is 512-tok context (1400 chars Polish ~ 466 tok safe).
# qwen3-embedding:0.6b context is much larger but we keep the same cap so
# excerpts stay focused on the speaker's substantive opening rather than a
# rambling 5-minute speech that washes out the embedding signal.
MAX_INPUT_CHARS = 1400

# Polish parliamentary speeches universally open with vocative formalities
# ("Panie Marszałku! Wysoka Izbo! Szanowny Panie Ministrze!"). They appear in
# every statement, contribute zero semantic signal, and pollute search excerpts
# (frontend review #4: "Panie Marszałku" dominated query results). Strip them
# before embedding so the vector reflects the speech's actual topic.
_BOILERPLATE_RE = re.compile(
    r"""^(\s*
        (?:
          Pose[łł][ka]?\s+[A-ZŁŚŻĆŃÓ][^:]{0,80}: # "Poseł Jan Kowalski:" header
          |
          (?:Pan(?:ie|i)?|Państwo)\s+(?:Marszałk[au]|Marszałkowie|Ministrowie|Minister(?:ze)?|Prezesie|Prezes|Wicemarszałk[au])
          |
          (?:Szanown[aey](?:\sPan(?:ie|i))?\s+\w+)
          |
          Wysok(?:a|i|ie)\s+Izb[aoy]
        )
        [!,.\s]*
    )+
    """,
    re.IGNORECASE | re.VERBOSE,
)


def strip_speech_boilerplate(text: str) -> str:
    """Remove vocative opening from a parliamentary speech body.

    Polish Sejm speeches start with chained vocatives ("Poseł X: Panie
    Marszałku! Wysoka Izbo! Szanowny Panie Ministrze!") that crowd out the
    substantive opening ~200 chars. Stripping them improves both the embedding
    quality and any text excerpt shown to the user.
    """
    return _BOILERPLATE_RE.sub("", text, count=1).lstrip()


@with_model_run(
    fn_name=JOB_NAME,
    model=DEFAULT_EMBED_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg=None,
    prompt_sha256_arg=None,
)
def embed_statement(
    *,
    entity_type: str,           # always 'proceeding_statement' — decorator validates
    entity_id: str,             # proceeding_statements.id as text
    embed_model: str = DEFAULT_EMBED_MODEL,
    model_run_id: int | None = None,
) -> EmbedResult:
    cli = supabase()
    row = (
        cli.table("proceeding_statements")
        .select("id, body_text")
        .eq("id", int(entity_id))
        .single()
        .execute()
    )
    body = ((row.data or {}).get("body_text") or "").strip()
    if not body:
        # Caller is expected to filter via the partial index; defensively raise
        # so the audit trail records the bad selection.
        raise ValueError(f"empty body_text for proceeding_statement {entity_id}")

    # Strip vocative formalities so the embedding reflects the substantive
    # topic, not the universal "Panie Marszałku! Wysoka Izbo!" prefix that
    # otherwise dominates the first 200 chars and pollutes search excerpts.
    text = strip_speech_boilerplate(body)[:MAX_INPUT_CHARS]
    result = embed_and_store(
        text=text,
        entity_type=entity_type,
        entity_id=entity_id,
        model=embed_model,
    )
    assert len(result.vec) == EMBED_DIM

    # Stamp provenance so "needs embedding?" queries don't have to join
    # embeddings. CHECK constraint enforces (model, ts) move together.
    cli.table("proceeding_statements").update(
        {
            "embedding_model": embed_model,
            "embedded_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", int(entity_id)).execute()
    return result


def embed_pending_statements(
    *,
    term: int = 10,
    limit: int = 0,
    embed_model: str = DEFAULT_EMBED_MODEL,
) -> tuple[int, int]:
    """Embed every statement with body_text but no embedding yet.

    Selection uses the partial index `statement_embedding_pending_idx` on
    (id) where embedded_at is null and body_text is not null.

    Returns:
      (n_ok, n_failed)
    """
    cli = supabase()
    # PostgREST doesn't expose explicit index hints — rely on planner to use
    # the partial index when both predicates are present.
    page = 1000
    offset = 0
    n_ok = 0
    n_failed = 0
    while True:
        q = (
            cli.table("proceeding_statements")
            .select("id")
            .eq("term", term)
            .is_("embedded_at", "null")
            .not_.is_("body_text", "null")
            .order("id")
            .range(offset, offset + page - 1)
        )
        rows = q.execute().data or []
        if not rows:
            break
        for r in rows:
            sid = str(r["id"])
            try:
                embed_statement(
                    entity_type="proceeding_statement",
                    entity_id=sid,
                    embed_model=embed_model,
                )
                n_ok += 1
            except Exception as e:  # noqa: BLE001
                logger.error("embed_statement {} failed: {!r}", sid, e)
                n_failed += 1
            if limit > 0 and (n_ok + n_failed) >= limit:
                logger.info(
                    "embed_pending_statements: limit={} reached ok={} failed={}",
                    limit,
                    n_ok,
                    n_failed,
                )
                return n_ok, n_failed
            if (n_ok + n_failed) % 100 == 0:
                logger.info(
                    "embed progress: ok={} failed={} (offset={})",
                    n_ok,
                    n_failed,
                    offset,
                )
        offset += len(rows)
        if len(rows) < page:
            break
    return n_ok, n_failed
