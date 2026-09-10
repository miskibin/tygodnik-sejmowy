"""Bounded, read-only politician-network snapshot from public Sejm data."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from itertools import combinations
from typing import Any, Callable, Iterable
import json
import sys
from pathlib import Path

import httpx

from supagraf.db import supabase

SCHEMA_VERSION = "1"
MAX_VOTINGS, VOTING_SCAN_LIMIT, QUESTION_SCAN_LIMIT = 120, 600, 2_000
TOP_EDGES_PER_MP, MIN_COMPARABLE_VOTES = 8, 20
VALID_VOTES = frozenset(("YES", "NO", "ABSTAIN"))
SOURCE_VOTES = VALID_VOTES | frozenset(("ABSENT", "PRESENT", "VOTE_VALID"))
SUBSTANTIVE_POLARITIES = frozenset(("pass", "reject", "amendment", "minority"))


def question_url(term: int, kind: str, num: int) -> str:
    path = "interpellations" if kind == "interpellation" else "writtenQuestions"
    return f"https://api.sejm.gov.pl/sejm/term{term}/{path}/{num}"


def voting_url(term: int, sitting: int | None, num: int | None) -> str | None:
    return (
        None
        if sitting is None or num is None
        else f"https://api.sejm.gov.pl/sejm/term{term}/votings/{sitting}/{num}"
    )


def _date(value: Any) -> str | None:
    return None if value is None else str(value)[:10]


def _pair(a: int, b: int) -> tuple[int, int]:
    return (a, b) if a < b else (b, a)


def _top(edges: list[dict[str, Any]], layer: str) -> list[dict[str, Any]]:
    key = (
        (lambda e: (-e["weight"], -e["coauthored_count"], e["a"], e["b"]))
        if layer == "questions"
        else (lambda e: (-e["excess"], -e["agreement"], -e["n"], e["a"], e["b"]))
    )
    per_mp: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for edge in edges:
        per_mp[edge["a"]].append(edge)
        per_mp[edge["b"]].append(edge)
    keep = {
        (e["a"], e["b"])
        for rows in per_mp.values()
        for e in sorted(rows, key=key)[:TOP_EDGES_PER_MP]
    }
    return sorted((e for e in edges if (e["a"], e["b"]) in keep), key=key)


def build_question_edges(
    questions: Iterable[dict[str, Any]], *, term: int
) -> list[dict[str, Any]]:
    """Fractional one-mode projection of question-author hyperedges."""
    totals: dict[tuple[int, int], dict[str, Any]] = {}
    for q in questions:
        authors = sorted({int(x) for x in q.get("authors", []) if x is not None})
        if len(authors) < 2:
            continue
        evidence = {
            "question_id": int(q["id"]),
            "num": int(q["num"]),
            "date": _date(q.get("sent_date") or q.get("receipt_date")),
            "title": str(q.get("title") or ""),
            "url": question_url(
                term, str(q.get("kind") or "interpellation"), int(q["num"])
            ),
        }
        for a, b in combinations(authors, 2):
            edge = totals.setdefault(
                (a, b),
                {"a": a, "b": b, "weight": 0.0, "coauthored_count": 0, "evidence": []},
            )
            edge["weight"] += 1 / (len(authors) - 1)
            edge["coauthored_count"] += 1
            edge["evidence"].append(evidence)
    out = []
    for edge in totals.values():
        edge["weight"] = round(edge["weight"], 6)
        edge["evidence"] = sorted(
            edge["evidence"],
            key=lambda x: (x["date"] or "", x["question_id"]),
            reverse=True,
        )[:5]
        out.append(edge)
    return _top(out, "questions")


def _modal(rows: list[dict[str, Any]]) -> dict[str, str]:
    clubs: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        clubs[str(row["club_ref"])].append(str(row["vote"]))
    out: dict[str, str] = {}
    for club, votes in clubs.items():
        counts, maximum = Counter(votes), max(Counter(votes).values())
        winners = [vote for vote, n in counts.items() if n == maximum]
        if len(votes) >= 5 and len(winners) == 1:
            out[club] = winners[0]
    return out


def build_vote_layer(
    votings: Iterable[dict[str, Any]], *, term: int
) -> dict[str, list[dict[str, Any]]]:
    """MP pair agreement and leave-one-out deviations, using vote-time clubs."""
    pairs: dict[tuple[int, int], Counter[str]] = defaultdict(Counter)
    evidence: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    deviations: dict[int, Counter[str]] = defaultdict(Counter)
    for voting in votings:
        rows = [
            r
            for r in voting.get("votes", [])
            if r.get("vote") in VALID_VOTES and r.get("club_ref")
        ]
        if (
            not rows
            or max(Counter(str(r["vote"]) for r in rows).values()) / len(rows) >= 0.95
        ):
            continue
        modal = _modal(rows)
        ev = {
            "voting_id": int(voting["id"]),
            "date": _date(voting.get("date")),
            "title": str(voting.get("title") or voting.get("topic") or ""),
            "url": voting_url(term, voting.get("sitting"), voting.get("voting_number")),
        }
        for left, right in combinations(sorted(rows, key=lambda r: int(r["mp_id"])), 2):
            left_club, right_club = str(left["club_ref"]), str(right["club_ref"])
            # Same condition for observed and baseline agreement: cross-club,
            # uniquely modal clubs. This prevents denominator drift.
            if (
                left_club == right_club
                or left_club not in modal
                or right_club not in modal
            ):
                continue
            pair = _pair(int(left["mp_id"]), int(right["mp_id"]))
            stat = pairs[pair]
            stat["n"] += 1
            stat["agree"] += left["vote"] == right["vote"]
            stat["baseline_agree"] += modal[left_club] == modal[right_club]
            if left["vote"] == right["vote"]:
                evidence[pair].append(
                    {**ev, "_surprising": modal[left_club] != modal[right_club]}
                )
        clubs: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            clubs[str(row["club_ref"])].append(row)
        for members in clubs.values():
            if len(members) < 6:
                continue
            for member in members:
                counts = Counter(str(x["vote"]) for x in members if x is not member)
                maximum = max(counts.values(), default=0)
                winners = [v for v, n in counts.items() if n == maximum]
                if maximum and len(winners) == 1:
                    d = deviations[int(member["mp_id"])]
                    d["n"] += 1
                    d["deviations"] += member["vote"] != winners[0]
    edges = []
    for (a, b), stat in pairs.items():
        n = int(stat["n"])
        if n < MIN_COMPARABLE_VOTES or not stat["agree"]:
            continue
        agreement, baseline = stat["agree"] / n, stat["baseline_agree"] / n
        proof = sorted(
            evidence[(a, b)],
            key=lambda x: (int(x["_surprising"]), x["date"] or "", x["voting_id"]),
            reverse=True,
        )[:5]
        for item in proof:
            item.pop("_surprising")
        edges.append(
            {
                "a": a,
                "b": b,
                "n": n,
                "agreement": round(agreement, 6),
                "baseline_agreement": round(baseline, 6),
                "excess": round(agreement - baseline, 6),
                "evidence": proof,
            }
        )
    rows = [
        {
            "mp_id": mp,
            "n": int(s["n"]),
            "deviations": int(s["deviations"]),
            "rate": round(s["deviations"] / s["n"], 6),
        }
        for mp, s in deviations.items()
        if s["n"]
    ]
    return {
        "edges": _top(edges, "votes"),
        "mp_deviations": sorted(rows, key=lambda d: (-d["rate"], -d["n"], d["mp_id"])),
    }


def _pages(
    client: Any,
    table: str,
    columns: str,
    configure: Callable[[Any], Any],
    *,
    limit: int | None = None,
    page_size: int = 1_000,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    start = 0
    while limit is None or len(out) < limit:
        size = min(page_size, limit - len(out)) if limit is not None else page_size
        page = (
            configure(client.table(table).select(columns))
            .range(start, start + size - 1)
            .execute()
            .data
            or []
        )
        out.extend(page)
        if len(page) < size:
            break
        start += size
    return out


def _in_pages(
    client: Any,
    table: str,
    columns: str,
    column: str,
    values: list[int],
    *,
    chunk: int = 100,
    page_size: int = 1_000,
) -> list[dict[str, Any]]:
    """Avoid oversized PostgREST URLs when a bounded read has many IDs."""
    out: list[dict[str, Any]] = []
    secondary = {
        "question_authors": "mp_id",
        "voting_print_links": "print_id",
        "votes": "mp_id",
    }.get(table)
    for start in range(0, len(values), chunk):
        part = values[start : start + chunk]
        out.extend(
            _pages(
                client,
                table,
                columns,
                lambda q, part=part: q.in_(column, part).order(column).order(secondary)
                if secondary
                else q.in_(column, part).order(column),
                page_size=page_size,
            )
        )
    return out


def _validate_source_ballots(
    voting: dict[str, Any], rows: list[dict[str, Any]], *, mp_key: str
) -> None:
    """Reject incomplete or malformed ballot sets before a snapshot is emitted."""
    expected = int(voting.get("totalVoted", voting.get("total_voted", 0))) + int(
        voting.get("notParticipating", voting.get("not_participating", 0))
    )
    ids: list[int] = []
    for row in rows:
        try:
            mp_id = int(row.get(mp_key))
        except (TypeError, ValueError):
            raise RuntimeError("invalid ballot MP id") from None
        if mp_id <= 0 or row.get("vote") not in SOURCE_VOTES:
            raise RuntimeError("invalid ballot row")
        ids.append(mp_id)
    if expected <= 0 or len(rows) != expected or len(set(ids)) != len(ids):
        raise RuntimeError("incomplete ballot set")


def _ballots_from_stage(
    client: Any, selected: list[dict[str, Any]], term: int
) -> dict[int, list[dict[str, Any]]]:
    keys = [f"{int(v['sitting'])}__{int(v['voting_number'])}" for v in selected]
    stage: list[dict[str, Any]] = []
    for start in range(0, len(keys), 50):
        part = keys[start : start + 50]
        stage.extend(
            _pages(
                client,
                "_stage_votings",
                "natural_id,payload",
                lambda q, part=part: q.eq("term", term)
                .in_("natural_id", part)
                .order("natural_id"),
            )
        )
    payload_by_key = {str(row["natural_id"]): row.get("payload") or {} for row in stage}
    out: dict[int, list[dict[str, Any]]] = {}
    for voting, key in zip(selected, keys):
        payload = payload_by_key.get(key)
        votes = payload.get("votes") if isinstance(payload, dict) else None
        if not isinstance(votes, list) or not votes:
            raise RuntimeError("incomplete stage ballots")
        _validate_source_ballots(payload, votes, mp_key="MP")
        out[int(voting["id"])] = [
            {
                "mp_id": row.get("MP"),
                "club_ref": row.get("club"),
                "vote": row.get("vote"),
            }
            for row in votes
        ]
    return out


def _ballots_from_official_api(
    selected: list[dict[str, Any]], term: int
) -> dict[int, list[dict[str, Any]]]:
    """Fallback used only when staged ballots are unavailable; validates all rows."""
    out: dict[int, list[dict[str, Any]]] = {}
    with httpx.Client(timeout=12.0, headers={"Accept": "application/json"}) as http:
        for voting in selected:
            url = voting_url(term, voting.get("sitting"), voting.get("voting_number"))
            if not url:
                raise RuntimeError("selected voting has no official URL")
            response = http.get(url)
            response.raise_for_status()
            payload = response.json()
            votes = payload.get("votes") if isinstance(payload, dict) else None
            if not isinstance(votes, list) or not votes:
                raise RuntimeError("incomplete official ballots")
            _validate_source_ballots(payload, votes, mp_key="MP")
            out[int(voting["id"])] = [
                {
                    "mp_id": row.get("MP"),
                    "club_ref": row.get("club"),
                    "vote": row.get("vote"),
                }
                for row in votes
            ]
    return out


def _load_ballots(
    client: Any, selected: list[dict[str, Any]], term: int
) -> tuple[dict[int, list[dict[str, Any]]], str]:
    try:
        ballots = _ballots_from_stage(client, selected, term)
        _require_complete_ballots(selected, ballots)
        return ballots, "stage_payload"
    except Exception:
        # No partial output: either every selected ballot arrives from the
        # fallback, or the caller receives a generic failure from main().
        ballots = _ballots_from_official_api(selected, term)
        _require_complete_ballots(selected, ballots)
        return ballots, "official_api"


def _require_complete_ballots(
    selected: list[dict[str, Any]], ballots: dict[int, list[dict[str, Any]]]
) -> None:
    for voting in selected:
        rows = ballots.get(int(voting["id"]))
        if not rows:
            raise RuntimeError("incomplete ballot set")
        _validate_source_ballots(voting, rows, mp_key="mp_id")


def build_network(
    *,
    term: int = 10,
    days: int = 180,
    client: Any | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """Read PostgREST only and return a compact JSON-safe public-data snapshot."""
    if days < 1:
        raise ValueError("days must be positive")
    client, today = client or supabase(), today or datetime.now(timezone.utc).date()
    since = (today - timedelta(days=days)).isoformat()
    mps = _pages(
        client,
        "mps",
        "mp_id,first_last_name,club_ref,active,photo_url",
        lambda q: q.eq("term", term).order("mp_id"),
    )
    nodes = [
        {
            "mp_id": int(m["mp_id"]),
            "name": str(m.get("first_last_name") or ""),
            "photo_url": m.get("photo_url"),
            "current_club": m.get("club_ref"),
            "active": bool(m.get("active")),
        }
        for m in mps
    ]
    questions = _pages(
        client,
        "questions",
        "id,kind,num,title,sent_date,receipt_date",
        lambda q: q.eq("term", term)
        .gte("sent_date", since)
        .lte("sent_date", today.isoformat())
        .order("sent_date", desc=True)
        .order("id", desc=True),
        limit=QUESTION_SCAN_LIMIT,
    )
    ids = [int(q["id"]) for q in questions]
    authors = (
        _in_pages(client, "question_authors", "question_id,mp_id", "question_id", ids)
        if ids
        else []
    )
    by_question: dict[int, list[int]] = defaultdict(list)
    for row in authors:
        by_question[int(row["question_id"])].append(int(row["mp_id"]))
    for q in questions:
        q["authors"] = by_question[int(q["id"])]
    candidates = _pages(
        client,
        "votings",
        "id,date,title,topic,sitting,voting_number,motion_polarity,kind,total_voted,not_participating",
        lambda q: q.eq("term", term)
        .eq("kind", "ELECTRONIC")
        .gte("date", since)
        .lt("date", (today + timedelta(days=1)).isoformat())
        .order("date", desc=True)
        .order("id", desc=True),
        limit=VOTING_SCAN_LIMIT,
    )
    eligible = [
        v for v in candidates if v.get("motion_polarity") in SUBSTANTIVE_POLARITIES
    ]
    candidate_ids = [int(v["id"]) for v in eligible]
    links = (
        _in_pages(
            client,
            "voting_print_links",
            "voting_id,print_id",
            "voting_id",
            candidate_ids,
        )
        if candidate_ids
        else []
    )
    print_ids = sorted({int(x["print_id"]) for x in links})
    prints = (
        _in_pages(
            client, "prints", "id,number,is_primary,parent_number", "id", print_ids
        )
        if print_ids
        else []
    )
    print_map = {int(p["id"]): p for p in prints}
    blocks: dict[int, str] = {}
    for link in links:
        p = print_map.get(int(link["print_id"]))
        block = p and (
            p.get("number") if p.get("is_primary") else p.get("parent_number")
        )
        if block:
            blocks[int(link["voting_id"])] = str(block)
    selected: list[dict[str, Any]] = []
    seen: set[str] = set()
    for voting in eligible:
        block = blocks.get(int(voting["id"]))
        if block and block in seen:
            continue
        selected.append(voting)
        if block:
            seen.add(block)
        if len(selected) == MAX_VOTINGS:
            break
    selected_ids = [int(v["id"]) for v in selected]
    by_voting, ballot_transport = (
        _load_ballots(client, selected, term) if selected_ids else ({}, "none")
    )
    for voting in selected:
        voting["votes"] = by_voting[int(voting["id"])]
    return {
        "schema_version": SCHEMA_VERSION,
        "term": term,
        "window": {"days": days, "from": since, "to": today.isoformat()},
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "sampling": {
            "questions": {
                "scan_limit": QUESTION_SCAN_LIMIT,
                "selected": len(questions),
                "with_multiple_authors": sum(len(q["authors"]) > 1 for q in questions),
                "without_authors": sum(not q["authors"] for q in questions),
                "author_rows": len(authors),
                "cap_reached": len(questions) == QUESTION_SCAN_LIMIT,
            },
            "votings": {
                "scan_limit": VOTING_SCAN_LIMIT,
                "candidate_rows": len(candidates),
                "eligible": len(eligible),
                "selected": len(selected),
                "limit": MAX_VOTINGS,
                "ballot_transport": ballot_transport,
                "selection": "latest substantive ELECTRONIC; at most one per linked primary-print block when available",
            },
        },
        "nodes": nodes,
        "layers": {
            "questions": {"edges": build_question_edges(questions, term=term)},
            "votes": build_vote_layer(selected, term=term),
        },
        "limitations": [
            "Krawędzie pokazują wyłącznie wspólne autorstwo pytania lub zgodność oddanych głosów; nie wyjaśniają motywów ani nie przewidują zmiany klubu.",
            "Pominięto nieobecności, obecność bez głosu, głosy listowe, głosy proceduralne i głosy, w których 95% lub więcej ważnych głosów było identycznych.",
            "To ograniczona próba najnowszych głosowań, a nie pełna kadencja; liczby próby są podane przy wykresie.",
            "Nazwa aktualnego klubu służy do opisu, a porównanie głosów używa klubu wpisanego przy tym głosowaniu.",
        ],
    }


def main() -> int:
    """Small safe runner: never serialize environment or transport errors."""
    try:
        snapshot = build_network()
        output = Path(".tmp_supagraf/network-preview.json")
        output.parent.mkdir(exist_ok=True)
        output.write_text(
            json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(
            json.dumps(
                {"output": str(output), "sampling": snapshot["sampling"]},
                ensure_ascii=False,
            )
        )
    except Exception:  # credentials and response bodies can be sensitive/noisy
        print(
            "Nie udało się odczytać danych sieci. Sprawdź konfigurację i dostępność bazy.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
