"""Opt-in print re-enrichment scoped to one completed sitting.

The normal daily ``enrich_pending_prints`` job remains unchanged.  This module
reconstructs the same high-confidence print references as the weekly frontend:
anchored transcript preambles plus voting titles from exactly one sitting.
Everything is read and frozen into a manifest before any enrichment starts.
"""
from __future__ import annotations

import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any, Callable

from loguru import logger

from supagraf.db import supabase
from supagraf.enrich.llm import LLMBudgetError, PromptRef, usage_since, usage_snapshot

PAGE_SIZE = 500
DEFAULT_PROMPT_NAME = "print_citizen_review"
DEFAULT_PROMPT_VERSION = 9

_PRINT_REF_RE = re.compile(
    r"\bdruk(?:i|u|ów)?\s+nr\s+((?:\d+(?:-[A-Za-z0-9]+)?)(?:(?:\s*,\s*|\s+(?:i|oraz)\s+)(?:nr\s+)?\d+(?:-[A-Za-z0-9]+)?)*)",
    re.IGNORECASE,
)
_PREAMBLE_RE = re.compile(
    r"^(?:\d+\.\s*kadencja,[\s\S]{0,130}?\)\s*)?"
    r"(\d+)\.\s*punkt porz[ąa]dku dziennego:\s*",
    re.IGNORECASE,
)
_SPEAKER_RE = re.compile(
    r"\s(?:Poseł|Posłanka|Minister|Sekretarz|Podsekretarz|Prezes|Szef|"
    r"Senator|Rzecznik|Marszałek|Wicemarszałek)(?=\s|:)",
    re.IGNORECASE,
)
_VOTE_RE = re.compile(r"^Pkt\.\s*(\d+)\s+", re.IGNORECASE)


def print_numbers(text: str | None) -> list[str]:
    """Extract explicit ``druk nr`` references using the frontend grammar."""
    if not text:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for match in _PRINT_REF_RE.finditer(text):
        for number in re.findall(r"\d+(?:-[A-Za-z0-9]+)?", match.group(1)):
            if number not in seen:
                seen.add(number)
                out.append(number)
    return out


def transcript_context(body: str | None) -> tuple[int, str, list[str]] | None:
    """Parse only an anchored statement preamble, never its speech body."""
    if not body:
        return None
    match = _PREAMBLE_RE.match(body)
    if not match:
        return None
    rest = body[match.end():]
    title = _SPEAKER_RE.split(rest, maxsplit=1)[0][:2500].strip()
    return int(match.group(1)), title, print_numbers(title)


def collect_sitting_print_numbers(
    statements: list[dict[str, Any]], votes: list[dict[str, Any]]
) -> list[str]:
    """Mirror ``buildWeeklyStories`` print membership for one sitting."""
    return [number for _ordinal, numbers in collect_sitting_print_groups(statements, votes)
            for number in numbers]


def collect_sitting_print_groups(
    statements: list[dict[str, Any]], votes: list[dict[str, Any]]
) -> list[tuple[int, list[str]]]:
    """Return ordered agenda groups and their explicit print references."""
    groups: dict[int, set[str]] = {}
    for statement in statements:
        context = transcript_context(statement.get("body_text"))
        if context is None:
            continue
        ordinal, _title, numbers = context
        groups.setdefault(ordinal, set()).update(numbers)

    for vote in votes:
        title = vote.get("title") or ""
        context_match = _VOTE_RE.match(title)
        numbers = print_numbers(title if context_match else f"{title} {vote.get('topic') or ''}")
        if context_match:
            groups.setdefault(int(context_match.group(1)), set()).update(numbers)
            continue
        matching_groups = [group for group in groups.values() if set(numbers) & group]
        if len(matching_groups) == 1:
            matching_groups[0].update(numbers)

    return [
        (ordinal, sorted(numbers, key=_number_sort_key))
        for ordinal, numbers in sorted(groups.items())
    ]


def _number_sort_key(value: str) -> tuple[int, str]:
    match = re.match(r"(\d+)(.*)", value)
    return (int(match.group(1)), match.group(2)) if match else (10**12, value)


def _paged(make_query: Callable[[int, int], Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for offset in range(0, 10**9, PAGE_SIZE):
        page = make_query(offset, offset + PAGE_SIZE - 1).execute().data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
    raise RuntimeError("pagination safety limit reached")


def _load_sitting_context(client: Any, term: int, sitting: int) -> tuple[list[tuple[int, list[str]]], dict[str, int]]:
    proceeding = (
        client.table("proceedings").select("id").eq("term", term).eq("number", sitting)
        .maybe_single().execute().data
    )
    if not proceeding:
        raise ValueError(f"sitting not found: term={term} sitting={sitting}")
    proceeding_id = proceeding["id"]
    days = _paged(lambda start, end: (
        client.table("proceeding_days").select("id").eq("proceeding_id", proceeding_id)
        .order("id").range(start, end)
    ))
    day_ids = [row["id"] for row in days]
    statements: list[dict[str, Any]] = []
    if day_ids:
        statements = _paged(lambda start, end: (
            client.table("proceeding_statements")
            .select("id, body_text").eq("term", term)
            .in_("proceeding_day_id", day_ids).order("id").range(start, end)
        ))
    votes = _paged(lambda start, end: (
        client.table("votings").select("id, voting_number, title, topic")
        .eq("term", term).eq("sitting", sitting).order("voting_number").range(start, end)
    ))
    groups = collect_sitting_print_groups(statements, votes)
    return groups, {"days": len(days), "statements": len(statements), "votes": len(votes)}


def _load_print_rows(client: Any, term: int, numbers: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for start in range(0, len(numbers), 100):
        chunk = numbers[start:start + 100]
        rows.extend((client.table("prints").select(
            "id, term, number, attachments:print_attachments(filename, ordinal), "
            "summary_prompt_version, summary_prompt_sha256, document_category, "
            "is_meta_document, summary_plain, impact_punch"
        ).eq("term", term).in_("number", chunk).order("number").execute().data or []))
    # The number is the composite-key component used by the enricher. Keep one
    # row per number even if a mocked/joined response repeats it.
    unique: dict[str, dict[str, Any]] = {}
    for row in rows:
        number = str(row.get("number", "")).strip()
        if number and number not in unique:
            unique[number] = row
    return [unique[number] for number in numbers if number in unique]


@dataclass
class ScopedPrintPlan:
    term: int
    sitting: int
    prompt: PromptRef
    numbers: list[str]
    rows: list[dict[str, Any]]
    context_counts: dict[str, int]
    groups: list[tuple[int, list[str]]] = field(default_factory=list)
    discovered_rows: list[dict[str, Any]] = field(default_factory=list)
    selection_reasons: dict[str, str] = field(default_factory=dict)

    @property
    def already_processed(self) -> list[dict[str, Any]]:
        version = str(self.prompt.version)
        return [row for row in self.rows if (
            str(row.get("summary_prompt_version") or "") == version
            and row.get("summary_prompt_sha256") == self.prompt.sha256
        )]

    @property
    def runnable(self) -> list[dict[str, Any]]:
        done = {str(row.get("number")) for row in self.already_processed}
        return [row for row in self.rows if str(row.get("number")) not in done]

    def manifest(self, *, force: bool, limit: int = 0) -> dict[str, Any]:
        done = self.already_processed
        runnable = self.rows if force else self.runnable
        if limit > 0:
            runnable = runnable[:limit]
        return {
            "term": self.term,
            "sitting": self.sitting,
            "prompt_name": self.prompt.name,
            "prompt_version": self.prompt.version,
            "prompt_sha256": self.prompt.sha256,
            "source": "proceeding_statements.preamble+votings.title",
            "reference_count": len(self.numbers),
            "references": self.numbers,
            "discovered_count": len(self.discovered_rows),
            "discovered_numbers": [str(row.get("number")) for row in self.discovered_rows],
            "candidate_count": len(self.rows),
            "candidate_ids": [row.get("id") for row in self.rows],
            "selected_count": len(self.rows),
            "selected_numbers": [str(row.get("number")) for row in self.rows],
            "selection_reasons": self.selection_reasons,
            "groups": [{"ordinal": ordinal, "references": numbers}
                       for ordinal, numbers in self.groups],
            "already_processed_same_prompt": len(done),
            "to_run": len(runnable),
            "runnable_ids": [row.get("id") for row in runnable],
            "runnable_numbers": [str(row.get("number")) for row in runnable],
            "missing_references": [
                number for number in self.numbers
                if number not in {str(row.get("number")) for row in self.discovered_rows}
            ],
            "limit": limit,
            "forced": force,
            "context_counts": self.context_counts,
        }


def select_source_rows(
    groups: list[tuple[int, list[str]]], discovered_rows: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Select the documents the weekly story actually uses per agenda group."""
    by_number = {str(row.get("number")): row for row in discovered_rows}
    selected: list[dict[str, Any]] = []
    reasons: dict[str, str] = {}
    seen: set[str] = set()
    for _ordinal, group in groups:
        group_rows = [by_number[number] for number in group if number in by_number]
        projects = [row for row in group_rows if (
            not row.get("is_meta_document")
            and row.get("document_category") in {"projekt_ustawy", "projekt_uchwaly"}
        )]
        if projects:
            chosen = projects
            reason = "substantive_project"
        else:
            chosen = next((
                [row] for row in group_rows
                if row.get("summary_plain") or row.get("impact_punch")
            ), [])
            reason = "primary_existing_summary"
        for row in chosen:
            number = str(row.get("number"))
            if number in seen:
                continue
            seen.add(number)
            selected.append(row)
            reasons[number] = reason
    return selected, reasons


def build_plan(
    *, term: int = 10, sitting: int, prompt_name: str = DEFAULT_PROMPT_NAME,
    prompt_version: int = DEFAULT_PROMPT_VERSION, client: Any | None = None,
) -> ScopedPrintPlan:
    from supagraf.enrich.llm import _resolve_prompt

    sb = client or supabase()
    prompt = _resolve_prompt(prompt_name, prompt_version)
    groups, counts = _load_sitting_context(sb, term, sitting)
    numbers = list(dict.fromkeys(number for _ordinal, group in groups for number in group))
    discovered_rows = _load_print_rows(sb, term, numbers)
    selected, reasons = select_source_rows(groups, discovered_rows)
    return ScopedPrintPlan(term, sitting, prompt, numbers, selected, counts, groups,
                           discovered_rows, reasons)


@dataclass
class ScopedStats:
    ok: int = 0
    failed: int = 0
    skipped: int = 0
    aborted: bool = False
    errors: list[tuple[str, str]] = field(default_factory=list)
    tokens: dict[str, int | float] = field(default_factory=dict)
    manifest: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "failed": self.failed, "skipped": self.skipped,
                "aborted": self.aborted, "errors": self.errors[:20],
                "tokens": self.tokens, "manifest": self.manifest}


def run_scoped_prints(
    *, term: int = 10, sitting: int, dry_run: bool = False, force: bool = False,
    prompt_name: str = DEFAULT_PROMPT_NAME,
    prompt_version: int = DEFAULT_PROMPT_VERSION, limit: int = 0, workers: int = 1,
    client: Any | None = None,
    enricher: Callable[..., Any] | None = None,
) -> ScopedStats:
    """Build a frozen one-sitting scope, then optionally enrich each print once."""
    plan = build_plan(term=term, sitting=sitting, prompt_name=prompt_name,
                      prompt_version=prompt_version, client=client)
    stats = ScopedStats(manifest=plan.manifest(force=force, limit=limit))
    if dry_run:
        logger.info("scoped enrich dry-run: {}", stats.manifest)
        return stats
    todo = plan.rows if force else plan.runnable
    if limit > 0:
        todo = todo[:limit]
    if not todo:
        return stats
    if enricher is None:
        from supagraf.enrich.print_unified import enrich_print_unified
        enricher = enrich_print_unified
    usage0 = usage_snapshot()
    lock = threading.Lock()
    stop_event = threading.Event()

    def one(row: dict[str, Any]) -> None:
        number = str(row["number"])
        if stop_event.is_set():
            return
        try:
            from supagraf.enrich.jobs import resolve_print_document
            relpath = resolve_print_document(row)
            if relpath is None:
                with lock:
                    stats.skipped += 1
                return
            if stop_event.is_set():
                return
            enricher(entity_type="print", entity_id=number, pdf_relpath=relpath,
                     term=term, prompt_name=plan.prompt.name,
                     prompt_version=plan.prompt.version, prompt_sha256=plan.prompt.sha256)
        except LLMBudgetError as exc:
            stop_event.set()
            with lock:
                stats.aborted = True
                stats.errors.append((number, str(exc)[:300]))
            return
        except Exception as exc:  # noqa: BLE001 — keep this row pending; prior values stay intact
            with lock:
                stats.failed += 1
                stats.errors.append((number, repr(exc)[:300]))
            return
        with lock:
            stats.ok += 1

    with ThreadPoolExecutor(max_workers=max(1, workers), thread_name_prefix="scoped-print") as pool:
        futures = [pool.submit(one, row) for row in todo]
        for future in as_completed(futures):
            future.result()
    stats.tokens = usage_since(usage0)
    return stats
