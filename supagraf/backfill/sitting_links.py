"""Link debates using transcript headings, never the planned agenda ordinal.

The initial agenda can be renumbered during a sitting. This backfill reads
the actual source preamble and only fills missing links / primary subjects.
Run a bounded audit: python -m supagraf.backfill.sitting_links --sitting 64
Apply the reviewed scope by adding --apply. No LLM calls or schema changes.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from datetime import date, timedelta

from supagraf.db import supabase

_PREAMBLE = re.compile(
    r"^(?:\d+\.\s*kadencja,[\s\S]{0,130}?\)\s*)?"
    r"\d+\.\s*punkt porz[ąa]dku dziennego:\s*", re.I,
)
_SPEAKER = re.compile(
    r"\s(?:Poseł|Posłanka|Minister|Sekretarz|Podsekretarz|Prezes|Szef|Senator|"
    r"Rzecznik|Marszałek|Wicemarszałek)(?=\s|:)"
)
_PRINTS = re.compile(
    r"\bdruk(?:i|u|ów)?\s+nr\s+(\d+(?:-[A-Za-z0-9]+)?"
    r"(?:(?:\s*,\s*|\s+(?:i|oraz)\s+)(?:nr\s+)?\d+(?:-[A-Za-z0-9]+)?)*)", re.I,
)


def heading_print_numbers(body: str) -> list[str]:
    """Only references before the speaker count as debate attribution."""
    match = _PREAMBLE.match(body or "")
    if not match:
        return []
    return print_numbers(_SPEAKER.split(body[match.end():], maxsplit=1)[0])


def print_numbers(title: str) -> list[str]:
    return list(dict.fromkeys(
        number for match in _PRINTS.finditer(title or "")
        for number in re.findall(r"\d+(?:-[A-Za-z0-9]+)?", match[1])
    ))


def link_candidates(statements: list[dict], votes: list[dict], prints: list[dict]) -> dict:
    by_number = {p["number"]: p for p in prints}
    statement_links, vote_links, primary = [], [], defaultdict(list)
    for s in statements:
        related = [by_number[n] for n in heading_print_numbers(s.get("body_text") or "") if n in by_number]
        for p in related:
            statement_links.append({"statement_id": s["id"], "print_id": p["id"],
                                    "source": "agenda_item", "confidence": 0.95, "agenda_item_id": None})
        # Reports and auto-amendments are documents about a draft, not rival
        # subjects. Joint debates retain all links without guessing a primary.
        projects = [p for p in related if p.get("document_category") in {"projekt_ustawy", "projekt_uchwaly"}
                    and not p.get("is_meta_document")]
        if len(projects) == 1 and s.get("primary_print_id") is None:
            primary[projects[0]["id"]].append(s["id"])
    for v in votes:
        related = [by_number[n] for n in print_numbers(v.get("title") or "") if n in by_number]
        projects = [p for p in related if p.get("document_category") in {"projekt_ustawy", "projekt_uchwaly"}]
        for p in related:
            role = "other"
            if p.get("document_category") == "sprawozdanie_komisji":
                role = "sprawozdanie"
            elif v.get("motion_polarity") == "amendment":
                role = "poprawka"
            elif len(projects) > 1:
                role = "joint"
            elif v.get("motion_polarity") == "pass" and p in projects:
                role = "main"
            vote_links.append({"voting_id": v["id"], "print_id": p["id"],
                               "source": "voting_title_regex", "role": role})
    return {"statement_links": statement_links, "vote_links": vote_links, "primary": dict(primary)}


def _pages(query) -> list[dict]:
    rows = []
    for offset in range(0, 1_000_000, 500):
        page = query().range(offset, offset + 499).execute().data or []
        rows.extend(page)
        if len(page) < 500:
            return rows
    raise RuntimeError("Unexpected page count while linking a sitting")


def relink_sitting(*, term: int, sitting: int, dry_run: bool = True) -> dict:
    sb = supabase()
    proceeding = sb.table("proceedings").select("id").eq("term", term).eq("number", sitting).execute().data
    if not proceeding:
        return {"sitting": sitting, "statements": 0, "votings": 0, "primary": 0}
    days = sb.table("proceeding_days").select("id").eq("proceeding_id", proceeding[0]["id"]).execute().data or []
    speeches = []
    for day in days:
        speeches.extend(_pages(lambda: sb.table("proceeding_statements")
                              .select("id,body_text,primary_print_id").eq("term", term)
                              .eq("proceeding_day_id", day["id"]).order("id")))
    votes = _pages(lambda: sb.table("votings").select("id,title,motion_polarity")
                   .eq("term", term).eq("sitting", sitting).order("id"))
    numbers = sorted({n for s in speeches for n in heading_print_numbers(s.get("body_text") or "")}
                     | {n for v in votes for n in print_numbers(v.get("title") or "")})
    prints = []
    for start in range(0, len(numbers), 100):
        prints.extend(sb.table("prints").select("id,number,document_category,is_meta_document")
                      .eq("term", term).in_("number", numbers[start:start + 100]).execute().data or [])
    plan = link_candidates(speeches, votes, prints)
    report = {"sitting": sitting, "statements": len(speeches), "votings": len(votes),
              "statement_links": len(plan["statement_links"]), "vote_links": len(plan["vote_links"]),
              "primary": sum(map(len, plan["primary"].values())), "dry_run": dry_run}
    if not dry_run:
        # Ignore conflicts: preserve manual curation and stronger provenance.
        for key, table, conflict in [("statement_links", "statement_print_links", "statement_id,print_id,source"),
                                     ("vote_links", "voting_print_links", "voting_id,print_id")]:
            for start in range(0, len(plan[key]), 500):
                sb.table(table).upsert(plan[key][start:start + 500], on_conflict=conflict,
                                       ignore_duplicates=True).execute()
        for print_id, ids in plan["primary"].items():
            for start in range(0, len(ids), 100):
                sb.table("proceeding_statements").update({"primary_print_id": print_id})\
                    .in_("id", ids[start:start + 100]).is_("primary_print_id", "null").execute()
    return report


def relink_changed_sittings(*, term: int, sittings: set[int], full: bool = False,
                           today: date | None = None, window_days: int = 14) -> dict:
    """Retry recent sittings even when only prints changed or fetch was skipped."""
    targets = set(sittings)
    if full or not targets:
        sb = supabase()
        query = lambda: sb.table("proceedings").select("number").eq("term", term).order("number")
        if full:
            targets.update(p["number"] for p in _pages(query))
        else:
            cutoff = ((today or date.today()) - timedelta(days=window_days)).isoformat()
            # Day dates are canonical; no assumptions about proceedings JSON.
            days = _pages(lambda: sb.table("proceeding_days").select("proceeding_id")
                          .gte("date", cutoff).order("id"))
            ids = sorted({d["proceeding_id"] for d in days})
            for start in range(0, len(ids), 100):
                targets.update(p["number"] for p in sb.table("proceedings").select("number")
                               .eq("term", term).in_("id", ids[start:start + 100]).execute().data or [])
    return {"sittings": [relink_sitting(term=term, sitting=n, dry_run=False) for n in sorted(targets)]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--term", type=int, default=10)
    parser.add_argument("--sitting", type=int, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    print(json.dumps(relink_sitting(term=args.term, sitting=args.sitting, dry_run=not args.apply)))
