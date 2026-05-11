"""Mine 30+ citizen-style Polish queries from print titles via deepseek-flash.

Each print's title becomes a one-sentence query a citizen might search
to find that bill. Gold = the source print number.

Output: tests/fixtures/embed_eval/queries_pl.jsonl

Run: `.venv/Scripts/python.exe -m scripts.embed_eval.mine_queries --n 40`

Set `EMBED_EVAL_QUERY_BACKEND=template` to skip the LLM and use a
deterministic template paraphrase — useful when the API key is missing
or for offline reproducibility.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from pathlib import Path

import httpx
from loguru import logger
from pydantic import BaseModel, Field

from scripts.embed_eval.corpus import load_corpus

OUT_PATH = Path("tests/fixtures/embed_eval/queries_pl.jsonl")
DEEPSEEK_URL = os.environ.get(
    "DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"
).rstrip("/") + "/chat/completions"
DEEPSEEK_MODEL = os.environ.get("SUPAGRAF_LLM_MODEL_FLASH", "deepseek-chat")
SYSTEM = (
    "Jesteś polskim asystentem. Otrzymasz tytuł ustawy lub projektu z Sejmu "
    "RP. Wymyśl JEDNO krótkie pytanie albo frazę, którą obywatel mógłby "
    "wpisać w wyszukiwarce, żeby znaleźć właśnie ten dokument. Pisz "
    "naturalnym, potocznym językiem (NIE biurokratycznym). Maksymalnie 12 "
    "słów. Bez cudzysłowów, bez emoji, bez kropki na końcu. Odpowiedz w "
    "formacie JSON: {\"query\": \"...\"}."
)


class QueryOut(BaseModel):
    query: str = Field(min_length=4, max_length=200)


def _template_paraphrase(title: str, short_title: str | None) -> str:
    base = (short_title or title or "").lower().rstrip(".")
    return f"co dotyczy: {base}"[:200]


def _call_deepseek(title: str, short_title: str | None, *, timeout_s: float = 30.0) -> str:
    key = os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        raise RuntimeError("DEEPSEEK_API_KEY missing")
    user_msg = f"Tytuł: {title}"
    if short_title and short_title.strip() and short_title != title:
        user_msg += f"\nPodtytuł: {short_title}"
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.7,
        "max_tokens": 80,
    }
    r = httpx.post(
        DEEPSEEK_URL,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=timeout_s,
    )
    r.raise_for_status()
    body = r.json()
    raw = body["choices"][0]["message"]["content"]
    parsed = QueryOut.model_validate_json(raw)
    return parsed.query.strip()


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--n", type=int, default=40, help="how many queries to mine (>30 for picking)")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--term", type=int, default=10)
    p.add_argument("--corpus-limit", type=int, default=500)
    p.add_argument("--backend", choices=["llm", "template"], default=os.environ.get("EMBED_EVAL_QUERY_BACKEND", "llm"))
    args = p.parse_args()

    rows = load_corpus(term=args.term, limit=args.corpus_limit)
    if len(rows) < args.n:
        logger.warning(f"corpus only has {len(rows)} rows, mining all")
        sample = rows
    else:
        rng = random.Random(args.seed)
        sample = rng.sample(rows, args.n)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as fh:
        for i, r in enumerate(sample, 1):
            try:
                if args.backend == "llm":
                    query = _call_deepseek(r.title, r.short_title)
                else:
                    query = _template_paraphrase(r.title, r.short_title)
            except Exception as e:
                logger.error(f"[{i}/{len(sample)}] {r.number}: paraphrase failed: {e}; falling back to template")
                query = _template_paraphrase(r.title, r.short_title)
            entry = {
                "query": query,
                "expected_print_number": r.number,
                "source_title": r.title,
                "short_title": r.short_title,
                "mining_method": args.backend,
                "gold": True,
            }
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
            logger.info(f"[{i:>3}/{len(sample)}] {r.number}: {query}")
            if args.backend == "llm":
                time.sleep(0.15)  # be polite to API
    logger.success(f"wrote {len(sample)} queries to {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
