"""Dump system + user prompt for one print to files — for manual LLM testing.

Usage:
    uv run python scripts/dump_llm_example.py --term 10 --number 2457

Writes:
    .tmp_llm_system.md  — prompt body (call_structured: system role)
    .tmp_llm_user.md    — full user_input (METADATA + OKŁADKA + CIAŁO)
    .tmp_llm_schema.json — Pydantic JSON schema (Gemini response_schema)
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from supagraf.db import supabase
from supagraf.enrich.llm import _resolve_prompt
from supagraf.enrich.pdf import extract_pdf, extract_pdf_cover
from supagraf.enrich.pdf_fetch import resolve_print_pdf
from supagraf.enrich.print_unified import (
    MAX_COVER_CHARS,
    MAX_INPUT_CHARS,
    PROMPT_NAME,
    PrintUnifiedOutput,
)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--term", type=int, default=10)
    ap.add_argument("--number", type=str, required=True)
    ap.add_argument("--out-dir", type=Path, default=Path("."))
    args = ap.parse_args()

    row = (
        supabase().table("prints")
        .select(
            "number, document_category, sponsor_authority, title, opinion_source, "
            "is_meta_document, attachments:print_attachments(filename, ordinal)"
        )
        .eq("term", args.term).eq("number", args.number)
        .single().execute().data
    )
    if not row:
        raise SystemExit(f"print {args.term}/{args.number} not found")

    atts = sorted(row.get("attachments") or [], key=lambda a: a.get("ordinal", 0))
    docx_match = pdf_match = None
    for a in atts:
        fn = a.get("filename") or ""
        low = fn.lower()
        if docx_match is None and low.endswith(".docx"):
            docx_match = fn
        elif pdf_match is None and low.endswith(".pdf"):
            pdf_match = fn
    chosen = docx_match or pdf_match
    if not chosen:
        raise SystemExit(f"no attachment for {args.term}/{args.number}")
    pdf_relpath = f"sejm/prints/{row['number']}__{chosen}"

    pdf_path = resolve_print_pdf(pdf_relpath)
    extraction = extract_pdf(pdf_path)
    body_text = extraction.text

    cover_text = ""
    if pdf_path.suffix.lower() == ".docx":
        sib = pdf_path.with_suffix(".pdf")
        if sib.exists():
            cover_text = extract_pdf_cover(sib, max_pages=2).strip()
            if not cover_text:
                cover_text = extract_pdf_cover(sib, max_pages=4).strip()
            cover_text = cover_text[:MAX_COVER_CHARS]

    header = (
        "## METADATA\n"
        f"Kategoria: {row.get('document_category')}\n"
        f"Autorytet: {row.get('sponsor_authority')}\n"
        f"Opinion source: {row.get('opinion_source') or 'N/A'}\n"
        f"Tytuł oryginalny: {row.get('title')}\n\n"
    )
    cover_section = (
        f"## OKŁADKA PDF (sygnatariusze + metadata)\n{cover_text}\n\n"
        if cover_text else ""
    )
    budget = MAX_INPUT_CHARS - len(header) - len(cover_section)
    body_section = f"## CIAŁO DOKUMENTU\n{body_text[:max(0, budget)]}"
    user_input = header + cover_section + body_section

    prompt = _resolve_prompt(PROMPT_NAME)
    schema = PrintUnifiedOutput.model_json_schema()

    sys_path = args.out_dir / ".tmp_llm_system.md"
    usr_path = args.out_dir / ".tmp_llm_user.md"
    sch_path = args.out_dir / ".tmp_llm_schema.json"
    sys_path.write_text(prompt.body, encoding="utf-8")
    usr_path.write_text(user_input, encoding="utf-8")
    sch_path.write_text(json.dumps(schema, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"system  -> {sys_path}  ({len(prompt.body)} chars, prompt v{prompt.version})")
    print(f"user    -> {usr_path}  ({len(user_input)} chars)")
    print(f"schema  -> {sch_path}  ({len(schema['properties'])} fields)")
    print(f"\nmodel:  gemini-3.1-flash-lite-preview")
    print(f"backend: gemini  (response_mime_type=application/json, response_schema=<above>)")
    print(f"temperature: 0.1")


if __name__ == "__main__":
    main()
