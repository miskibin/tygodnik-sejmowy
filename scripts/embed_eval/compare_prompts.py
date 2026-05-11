"""A/B compare two print_unified prompt versions on real prints.

For each test print:
  1. Build the same user_input string production uses (METADATA + OKŁADKA + CIAŁO)
  2. Call deepseek-v4-flash twice — once with each prompt version
  3. Parse both as PrintUnifiedOutput, compare field-by-field
  4. Score: schema-valid? same stance? same is_procedural? persona overlap?
     banlist hits? short_title length? summary length?

Usage:
  .venv/Scripts/python.exe -m scripts.embed_eval.compare_prompts \
      --prints 1056 2168 2197 2294 2363 2412-001 2520 \
      --prompts 5 6 \
      --model deepseek-v4-flash

Output: scripts/embed_eval/_cache/prompt_compare_<date>.json + markdown summary.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from loguru import logger

from supagraf.db import supabase
from supagraf.enrich.llm import _resolve_prompt, call_structured
from supagraf.enrich.pdf import extract_pdf, extract_pdf_cover
from supagraf.enrich.pdf_fetch import resolve_print_pdf
from supagraf.enrich.print_unified import (
    BLACKLIST_RE,
    ACTION_BANLIST_RE,
    MAX_COVER_CHARS,
    MAX_INPUT_CHARS,
    PROMPT_NAME,
    PrintUnifiedOutput,
)

CACHE_DIR = Path("scripts/embed_eval/_cache")
LLM_MODEL = os.environ.get("SUPAGRAF_LLM_MODEL_FLASH", "deepseek-v4-flash")


@dataclass
class CallResult:
    print_number: str
    prompt_version: int
    ok: bool
    parsed: PrintUnifiedOutput | None
    error: str | None
    raw: str | None
    prompt_chars: int


FIXTURES_DIR = Path("fixtures/sejm/prints")


def _fetch_meta(term: int, number: str) -> dict:
    r = (
        supabase()
        .table("prints")
        .select("number,title,document_category,sponsor_authority,opinion_source,is_meta_document,parent_number")
        .eq("term", term)
        .eq("number", number)
        .single()
        .execute()
    )
    return r.data or {}


def _resolve_pdf_relpath_from_fixture(number: str, parent_number: str | None) -> str:
    """Mirror supagraf.cli._resolve_pdf_relpath but read from local fixtures.

    Sub-prints (e.g. '2412-001') don't have their own fixture file; their PDF
    lives under the parent's attachments listed in the parent fixture.
    """
    fixture_number = parent_number or number
    # Strip any '-A', '-001' suffix — parent fixture name uses base number.
    base = fixture_number.split("-")[0]
    fixture_path = FIXTURES_DIR / f"{base}.json"
    if not fixture_path.exists():
        # Try the exact number as fallback
        fixture_path = FIXTURES_DIR / f"{number}.json"
    if not fixture_path.exists():
        raise RuntimeError(f"no fixture for {number} (tried {base} and {number})")
    data = json.loads(fixture_path.read_text(encoding="utf-8"))
    atts = data.get("attachments") or []
    docx_match = pdf_match = None
    for fn in atts:
        if not fn:
            continue
        low = fn.lower()
        if docx_match is None and low.endswith(".docx"):
            docx_match = fn
        elif pdf_match is None and low.endswith(".pdf"):
            pdf_match = fn
    chosen = docx_match or pdf_match
    if chosen is None:
        raise RuntimeError(f"no usable attachment in fixture {fixture_path.name}")
    return f"sejm/prints/{number}__{chosen}"


def _build_user_input(meta: dict) -> str:
    pdf_relpath = _resolve_pdf_relpath_from_fixture(
        meta["number"], meta.get("parent_number")
    )
    pdf_path = resolve_print_pdf(pdf_relpath)
    extraction = extract_pdf(pdf_path)
    body_text = extraction.text

    cover_text = ""
    if pdf_path.suffix.lower() == ".docx":
        sibling_pdf = pdf_path.with_suffix(".pdf")
        if sibling_pdf.exists():
            try:
                cover_text = extract_pdf_cover(sibling_pdf, max_pages=2).strip()
                if not cover_text:
                    cover_text = extract_pdf_cover(sibling_pdf, max_pages=4).strip()
                cover_text = cover_text[:MAX_COVER_CHARS]
            except Exception:
                cover_text = ""

    header = (
        "## METADATA\n"
        f"Kategoria: {meta.get('document_category')}\n"
        f"Autorytet: {meta.get('sponsor_authority')}\n"
        f"Opinion source: {meta.get('opinion_source') or 'N/A'}\n"
        f"Tytuł oryginalny: {meta.get('title')}\n\n"
    )
    cover_section = (
        f"## OKŁADKA PDF (sygnatariusze + metadata)\n{cover_text}\n\n"
        if cover_text else ""
    )
    budget_for_body = MAX_INPUT_CHARS - len(header) - len(cover_section)
    body_section = f"## CIAŁO DOKUMENTU\n{body_text[:max(0, budget_for_body)]}"
    return header + cover_section + body_section


def _call(model: str, prompt_version: int, user_input: str, number: str) -> CallResult:
    prompt_chars = len(_resolve_prompt(PROMPT_NAME, prompt_version).body)
    try:
        call = call_structured(
            model=model,
            prompt_name=PROMPT_NAME,
            user_input=user_input,
            output_model=PrintUnifiedOutput,
            prompt_version=prompt_version,
        )
        return CallResult(
            print_number=number,
            prompt_version=prompt_version,
            ok=True,
            parsed=call.parsed,  # type: ignore[arg-type]
            error=None,
            raw=call.raw_response,
            prompt_chars=prompt_chars,
        )
    except Exception as e:
        return CallResult(
            print_number=number,
            prompt_version=prompt_version,
            ok=False,
            parsed=None,
            error=f"{type(e).__name__}: {e}",
            raw=None,
            prompt_chars=prompt_chars,
        )


def _score_one(r: CallResult) -> dict:
    """Quality-axis flags for one call (excluding cross-version diff)."""
    if not r.ok or r.parsed is None:
        return {"valid": False}
    p = r.parsed
    return {
        "valid": True,
        "short_title_chars": len(p.short_title),
        "short_title_over_50": len(p.short_title) > 50,
        "summary_chars": len(p.summary),
        "n_persona_tags": len(p.persona_tags),
        "n_topic_tags": len(p.topic_tags),
        "is_procedural": p.is_procedural,
        "stance": p.stance,
        "citizen_action_is_null": p.citizen_action is None,
        "citizen_action_chars": len(p.citizen_action) if p.citizen_action else 0,
        "impact_punch_banlist_hit": bool(BLACKLIST_RE.search(p.impact_punch or "")),
        "summary_plain_banlist_hit": bool(BLACKLIST_RE.search(p.summary_plain or "")),
        "action_banlist_hit": bool(
            p.citizen_action and ACTION_BANLIST_RE.search(p.citizen_action)
        ),
        "n_mentions": len(p.mentions),
        "n_affected_groups": len(p.affected_groups),
    }


def _diff(a: CallResult, b: CallResult) -> dict:
    """Cross-version agreement metrics."""
    if not (a.ok and b.ok):
        return {"both_ok": False}
    pa = a.parsed
    pb = b.parsed
    persona_a = set(pa.persona_tags or [])
    persona_b = set(pb.persona_tags or [])
    topic_a = set(pa.topic_tags or [])
    topic_b = set(pb.topic_tags or [])
    return {
        "both_ok": True,
        "stance_agree": pa.stance == pb.stance,
        "is_procedural_agree": pa.is_procedural == pb.is_procedural,
        "persona_jaccard": (
            len(persona_a & persona_b) / max(1, len(persona_a | persona_b))
            if (persona_a or persona_b) else 1.0
        ),
        "topic_jaccard": (
            len(topic_a & topic_b) / max(1, len(topic_a | topic_b))
            if (topic_a or topic_b) else 1.0
        ),
        "short_title_a": pa.short_title,
        "short_title_b": pb.short_title,
        "impact_punch_a": pa.impact_punch,
        "impact_punch_b": pb.impact_punch,
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--prints", nargs="+", required=True, help="print numbers, e.g. 1056 2168")
    p.add_argument("--prompts", nargs=2, type=int, default=[5, 6], help="two prompt versions to compare")
    p.add_argument("--model", default=LLM_MODEL)
    p.add_argument("--term", type=int, default=10)
    args = p.parse_args()

    v_a, v_b = args.prompts
    rows: list[dict] = []
    for number in args.prints:
        logger.info(f"=== print {number} ===")
        try:
            meta = _fetch_meta(args.term, number)
            if not meta:
                logger.error(f"no metadata for {number}")
                continue
            user_input = _build_user_input(meta)
        except Exception as e:
            logger.error(f"input build failed for {number}: {e}")
            continue

        logger.info(f"  v{v_a} call …")
        ra = _call(args.model, v_a, user_input, number)
        logger.info(f"    ok={ra.ok} prompt={ra.prompt_chars}c err={ra.error}")
        logger.info(f"  v{v_b} call …")
        rb = _call(args.model, v_b, user_input, number)
        logger.info(f"    ok={rb.ok} prompt={rb.prompt_chars}c err={rb.error}")

        rows.append({
            "print": number,
            "title": meta.get("title"),
            "category": meta.get("document_category"),
            f"v{v_a}": {"chars": ra.prompt_chars, **_score_one(ra), "error": ra.error},
            f"v{v_b}": {"chars": rb.prompt_chars, **_score_one(rb), "error": rb.error},
            "diff": _diff(ra, rb),
        })

    out_path = CACHE_DIR / f"prompt_compare_v{v_a}_v{v_b}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.success(f"wrote {out_path}")

    # Aggregate
    n = len(rows)
    diff_rows = [r["diff"] for r in rows if r["diff"].get("both_ok")]
    stance_agree = sum(1 for d in diff_rows if d.get("stance_agree")) / max(1, len(diff_rows))
    proc_agree = sum(1 for d in diff_rows if d.get("is_procedural_agree")) / max(1, len(diff_rows))
    persona_j = sum(d.get("persona_jaccard", 0.0) for d in diff_rows) / max(1, len(diff_rows))
    topic_j = sum(d.get("topic_jaccard", 0.0) for d in diff_rows) / max(1, len(diff_rows))
    a_ok = sum(1 for r in rows if r[f"v{v_a}"].get("valid"))
    b_ok = sum(1 for r in rows if r[f"v{v_b}"].get("valid"))
    print("\n=== SUMMARY ===")
    print(f"prints tested: {n}")
    print(f"v{v_a} schema-valid: {a_ok}/{n}")
    print(f"v{v_b} schema-valid: {b_ok}/{n}")
    print(f"stance_agree: {stance_agree:.2f}")
    print(f"is_procedural_agree: {proc_agree:.2f}")
    print(f"persona_jaccard (mean): {persona_j:.2f}")
    print(f"topic_jaccard (mean): {topic_j:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
