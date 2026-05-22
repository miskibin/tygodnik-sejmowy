"""Attribute each proceeding_statement to ONE specific print.

Distinct from statement_print_links (many-to-many catalogue of every
draft a speech references). This module picks the SINGLE draft the
speech actually debates, persisted as proceeding_statements.primary_print_id
(migration 0103). Powers:

  * /tygodnik print top_quote — no greedy dedup needed; each statement
    is naturally claimed by exactly one print.
  * /proces/[term]/[number] — "all wypowiedzi z dyskusji o TEJ ustawie"
    filtered by primary_print_id without joins.

Two-pass strategy (skipped LLM where deterministic):

  Pass 1 — single-print agenda items: a statement linked via
  statement_print_links(source='agenda_item') to one and only one
  print → that print is assigned outright. No LLM cost. Covers ~30 %
  of agenda-linked statements (sample: 3255 / 10463 term 10).

  Pass 2 — joint debates: the same statement linked to 2+ prints via
  source='agenda_item' (joint sprawozdania, projekt + autopoprawka,
  rival drafts in one point). Call deepseek-flash with the prints'
  titles + statement body and have it pick the main subject.
  Returning null is OK — surfaces as "could not attribute".

NULL primary_print_id stays when:
  * statement has no source='agenda_item' link (procedural / Marshal /
    pure-debate agenda items without a druk)
  * LLM in pass 2 returns null (couldn't decide)
"""
from __future__ import annotations

import argparse
import os
from collections import defaultdict
from typing import Optional

from loguru import logger
from pydantic import BaseModel, ConfigDict, Field

from supagraf.db import supabase
from supagraf.enrich import LLM_MODELS
from supagraf.enrich.audit import with_model_run
from supagraf.enrich.llm import call_structured

JOB_NAME = "statement_primary_print"
PROMPT_NAME = "statement_primary_print"

MAX_INPUT_CHARS = 4000

PRIMARY_PRINT_LLM_MODEL = os.environ.get(
    "SUPAGRAF_PRIMARY_PRINT_LLM_MODEL", LLM_MODELS["flash"]
)


class PrimaryPrintOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    primary_print_number: Optional[str] = Field(default=None)
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    reason: str = Field(default="", max_length=400)


@with_model_run(
    fn_name=JOB_NAME,
    model=PRIMARY_PRINT_LLM_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg="prompt_version",
    prompt_sha256_arg="prompt_sha256",
)
def _disambiguate_one(
    *,
    entity_type: str,
    entity_id: str,
    body_text: str,
    prints_block: str,
    prompt_version: int | None = None,
    prompt_sha256: str | None = None,
    llm_model: str = PRIMARY_PRINT_LLM_MODEL,
    model_run_id: int | None = None,
) -> PrimaryPrintOutput:
    """LLM call for ONE statement in a joint debate.

    `prints_block` is the formatted list of candidate prints (number +
    short_title) the speaker is choosing from; the body text is the
    speech itself (truncated to MAX_INPUT_CHARS).
    """
    user_input = f"DRUKI OMAWIANE W PUNKCIE:\n{prints_block}\n\nWYPOWIEDŹ:\n{body_text[:MAX_INPUT_CHARS]}"
    call = call_structured(
        model=llm_model,
        prompt_name=PROMPT_NAME,
        user_input=user_input,
        output_model=PrimaryPrintOutput,
        prompt_version=prompt_version,
    )
    return call.parsed  # type: ignore[return-value]


def _fetch_candidates(
    *, term: int, sitting_min: int
) -> list[dict]:
    """Pull every term-10 statement in sittings >= sitting_min along
    with its agenda_item-source linked prints. One row per statement
    with `links` list aggregated.

    Uses exec_sql RPC to bypass PostgREST's per-request row limit; the
    aggregate keeps the result set small (one row per statement).
    """
    sb = supabase()
    sql = """
        select ps.id as statement_id,
               ps.body_text,
               array_agg(jsonb_build_object(
                 'print_id', p.id,
                 'number', p.number,
                 'short_title', p.short_title,
                 'title', p.title
               ) order by p.number) as links
        from proceeding_statements ps
        join proceeding_days pd on pd.id = ps.proceeding_day_id
        join proceedings pc     on pc.id = pd.proceeding_id
        join statement_print_links spl on spl.statement_id = ps.id
        join prints p on p.id = spl.print_id
        where ps.term = %(term)s
          and pc.number >= %(sitting_min)s
          and spl.source = 'agenda_item'
          and ps.primary_print_id is null
        group by ps.id, ps.body_text
        order by ps.id
    """
    # supabase-py exec_sql RPC doesn't bind params — interpolate the
    # ints inline (safe: validated to int by argparse).
    sql_inline = sql.replace("%(term)s", str(int(term))).replace(
        "%(sitting_min)s", str(int(sitting_min))
    )
    res = sb.rpc("exec_sql", {"query": sql_inline}).execute()
    return list(res.data or [])


def _resolve_print_number(
    *, links: list[dict], chosen_number: str | None
) -> int | None:
    """Map LLM-chosen druk number back to prints.id, defensive against
    hallucinations (numbers not in the candidate list)."""
    if chosen_number is None:
        return None
    for link in links:
        if str(link["number"]) == chosen_number:
            return int(link["print_id"])
    return None


def _write_primary_print(*, statement_id: int, print_id: int) -> None:
    supabase().table("proceeding_statements").update(
        {"primary_print_id": print_id}
    ).eq("id", statement_id).execute()


def backfill_primary_print(
    *,
    term: int = 10,
    sitting_min: int = 55,
    dry_run: bool = False,
    limit: int | None = None,
) -> dict[str, int]:
    """Run two-pass attribution.

    Returns counts: {single_print, joint_resolved, joint_null,
                     hallucinated, total}
    """
    rows = _fetch_candidates(term=term, sitting_min=sitting_min)
    if limit:
        rows = rows[:limit]

    counts: dict[str, int] = defaultdict(int)
    counts["total"] = len(rows)
    logger.info(f"primary_print backfill: {len(rows)} candidate statements")

    for i, row in enumerate(rows, 1):
        if i % 100 == 0:
            logger.info(f"  progress {i}/{len(rows)} — {dict(counts)}")
        statement_id = int(row["statement_id"])
        links: list[dict] = row["links"] or []
        if not links:
            continue
        # Pass 1 — single-print agenda item.
        if len(links) == 1:
            counts["single_print"] += 1
            if not dry_run:
                _write_primary_print(
                    statement_id=statement_id,
                    print_id=int(links[0]["print_id"]),
                )
            continue
        # Pass 2 — joint debate, LLM disambiguation.
        prints_block = "\n".join(
            f"- druk {ln['number']}: \"{ln.get('short_title') or ln.get('title') or ''}\""
            for ln in links
        )
        try:
            parsed = _disambiguate_one(
                entity_type="proceeding_statement",
                entity_id=str(statement_id),
                body_text=row.get("body_text") or "",
                prints_block=prints_block,
            )
        except Exception:
            logger.exception(f"LLM call failed for statement {statement_id}")
            counts["llm_error"] += 1
            continue
        if parsed.primary_print_number is None or parsed.confidence < 0.5:
            counts["joint_null"] += 1
            continue
        resolved = _resolve_print_number(
            links=links, chosen_number=parsed.primary_print_number
        )
        if resolved is None:
            counts["hallucinated"] += 1
            logger.warning(
                f"statement {statement_id}: LLM returned print "
                f"{parsed.primary_print_number!r} not in candidate list"
            )
            continue
        counts["joint_resolved"] += 1
        if not dry_run:
            _write_primary_print(statement_id=statement_id, print_id=resolved)

    logger.info(f"primary_print backfill done: {dict(counts)}")
    return dict(counts)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--term", type=int, default=10)
    parser.add_argument(
        "--sitting-min",
        type=int,
        default=55,
        help="Only statements from sittings >= this number (default 55)",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Cap for testing; default = all candidates",
    )
    args = parser.parse_args()
    backfill_primary_print(
        term=args.term,
        sitting_min=args.sitting_min,
        dry_run=args.dry_run,
        limit=args.limit,
    )


if __name__ == "__main__":
    main()
