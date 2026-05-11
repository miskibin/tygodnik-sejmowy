"""Parse Wikipedia EN polls article HTML -> polls + poll_results.

Strategy:
- Walk all `<table class="wikitable">`.
- Detect year polling tables by the preceding `<h2>/<h3>` header text
  matching a 4-digit year (2023..2030) AND header row containing
  'Polling firm' and party columns.
- Schema-sniff: read the first row's `<th>` text to map column index ->
  party_code via PARTY_HEADER_MAP. Non-party columns (pollster,
  fieldwork, sample, others, don't know, lead) are tracked separately.
- Per data row:
  * Skip if cell count < 12 or fieldwork cell has no data-sort-value
    (filters out 'Average' / event rows / color-band rows).
  * Pollster cell: take part before ' / ' (commissioning org), strip
    trailing whitespace; map to canonical code via POLLSTER_MAP. If no
    match -> skip row (don't dump unknowns into 'Aggregator').
  * Fieldwork: end_date = data-sort-value (ISO). start_date parsed
    from text, defaulting to end_date when text is a single date.
  * Sample size: parse '1,000' / '–' / empty. Strip footnote suffixes.
  * Each party % cell: numeric or NULL.
- Idempotent UPSERT on (pollster, conducted_at_end, sample_size,
  election_target).
"""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

from bs4 import BeautifulSoup, Tag
from loguru import logger

from supagraf.db import supabase

# Wikipedia party column headers -> canonical party_code.
PARTY_HEADER_MAP: dict[str, str] = {
    "PiS": "PiS",
    "KO": "KO",
    "Polska 2050": "Polska2050",
    "PSL": "PSL",
    "TD": "TD",
    "Lewica": "Lewica",
    "Razem": "Razem",
    "Konfederacja": "Konfederacja",
    "KKP": "KKP",
    "PJJ": "PJJ",
    "BS": "BS",
    "Others": "Inne",
    "Don't know": "Niezdecydowani",
}
# Non-party column headers (skipped from poll_results writes).
NON_PARTY_HEADERS = {"Polling firm/Link", "Fieldworkdate", "Samplesize", "Lead"}

# Some Wikipedia rows collapse pre-split alliances with colspan=2 instead of
# repeating the value under each child-party column. If we read those rows
# positionally, every value to the right shifts and corrupts the downstream
# trend chart (e.g. Konfederacja's ~15% becomes Razem's ~15%). Map these
# merged cells back to the canonical series we actually want to store.
MERGED_PARTY_CODE_MAP: dict[tuple[str, ...], str] = {
    ("Polska2050", "PSL"): "TD",
    ("Lewica", "Razem"): "Lewica",
    ("Konfederacja", "KKP"): "Konfederacja",
}

# Pollster name (split on ' / ', take first part) -> canonical code.
POLLSTER_MAP: dict[str, str] = {
    "ibris": "IBRiS",
    "cbos": "CBOS",
    "kantar": "Kantar",
    "kantar public": "Kantar",
    "pollster": "Pollster",
    "opinia spektrum": "OpiniaSpektrum",
    "opiniaspektrum": "OpiniaSpektrum",
    "opinia24": "Opinia24",
    "united surveys": "UnitedSurveys",
    "united surveys (drb)": "UnitedSurveys",
    "social changes": "SocialChanges",
    "ogb": "OGB",
    "ibsp": "IBSP",
    "estymator": "Estymator",
    "ipsos": "IPSOS",
    "pbs": "PBS",
    "sondaz.pl": "Sondaz.pl",
    "sondaż.pl": "Sondaz.pl",
    "research partner": "ResearchPartner",
    "cbm indicator": "CBMIndicator",
    "opinia 24": "Opinia24",
}

# 'Apr', 'May' -> month number for fallback parsing of fieldwork start.
MONTH_MAP = {
    m: i + 1 for i, m in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun",
         "jul", "aug", "sep", "oct", "nov", "dec"]
    )
}
MONTH_MAP_FULL = {
    m: i + 1 for i, m in enumerate(
        ["january", "february", "march", "april", "may", "june",
         "july", "august", "september", "october", "november", "december"]
    )
}

YEAR_RE = re.compile(r"^(20[2-3][0-9])$")
SAMPLE_RE = re.compile(r"^(\d{1,3}(?:[,\s]\d{3})*)")


def _normalize_pollster(raw: str) -> Optional[str]:
    """Take part before ' / ', lowercase, look up in POLLSTER_MAP."""
    if not raw:
        return None
    head = raw.split("/")[0].strip().strip('"').strip()
    head = re.sub(r"\s*\[.*?\]\s*$", "", head)  # strip ref [a]
    key = head.lower()
    if key in POLLSTER_MAP:
        return POLLSTER_MAP[key]
    # Try without parenthetical suffix
    base = re.sub(r"\s*\(.*?\)\s*$", "", key).strip()
    return POLLSTER_MAP.get(base)


def _parse_sample(text: str) -> Optional[int]:
    if not text or text in ("–", "-", "?"):
        return None
    m = SAMPLE_RE.match(text)
    if not m:
        return None
    try:
        return int(m.group(1).replace(",", "").replace(" ", ""))
    except ValueError:
        return None


def _parse_percent(text: str) -> Optional[float]:
    if not text or text in ("–", "-", "?", ""):
        return None
    # Strip ref tags like [a], bold/italic markup already gone via get_text
    cleaned = re.sub(r"\[.*?\]", "", text).strip()
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_fieldwork_dates(text: str, end_iso: str) -> tuple[date, date]:
    """Parse fieldwork text + end-date ISO -> (start, end).

    Examples:
      ('4-6 May', '2026-05-06')           -> (2026-05-04, 2026-05-06)
      ('27-30 Apr', '2026-04-30')         -> (2026-04-27, 2026-04-30)
      ('25 Mar - 4 Apr', '2026-04-04')    -> (2026-03-25, 2026-04-04)
      ('Apr', '2026-04-29')               -> (2026-04-29, 2026-04-29)
      ('4 May', '2026-05-04')             -> (2026-05-04, 2026-05-04)
    """
    end = datetime.strptime(end_iso, "%Y-%m-%d").date()
    if not text:
        return end, end
    # Normalize various dashes
    norm = text.replace("–", "-").replace("—", "-").replace("--", "-")
    norm = re.sub(r"\s*-\s*", "-", norm).strip()

    # Strip trailing year if present (e.g. '4 May 2026')
    norm = re.sub(r"\s+(20[0-9]{2})$", "", norm)

    parts = norm.split("-")
    if len(parts) == 1:
        # Single date or month-only -> single-day poll, start=end.
        return end, end
    left, right = parts[0].strip(), parts[1].strip()
    # right always has a month (it's the last part)
    right_match = re.match(r"^(\d{1,2})\s+([A-Za-z]+)$", right)
    if not right_match:
        return end, end
    end_day, month_str = int(right_match.group(1)), right_match.group(2).lower()
    end_month = MONTH_MAP.get(month_str[:3]) or MONTH_MAP_FULL.get(month_str)
    if not end_month:
        return end, end
    # Left could be: '27' (same month) or '25 Mar' (different month)
    left_match_full = re.match(r"^(\d{1,2})\s+([A-Za-z]+)$", left)
    left_match_day = re.match(r"^(\d{1,2})$", left)
    if left_match_full:
        sd = int(left_match_full.group(1))
        sm_str = left_match_full.group(2).lower()
        sm = MONTH_MAP.get(sm_str[:3]) or MONTH_MAP_FULL.get(sm_str)
        if not sm:
            return end, end
        # Year: same as end's, unless start month > end month -> previous year
        sy = end.year - 1 if sm > end_month else end.year
        try:
            return date(sy, sm, sd), end
        except ValueError:
            return end, end
    if left_match_day:
        sd = int(left_match_day.group(1))
        try:
            return date(end.year, end_month, sd), end
        except ValueError:
            return end, end
    return end, end


def _row_pollster_url(cell: Tag) -> Optional[str]:
    """Extract the source URL from the pollster cell's first <a> link."""
    a = cell.find("a")
    if not a:
        return None
    href = a.get("href", "")
    if href.startswith("http"):
        return href
    # Wiki internal links start with './' — not a useful provenance link;
    # keep them too as fallback (they at least anchor to the row).
    return href or None


def _detect_year(table: Tag) -> Optional[int]:
    """Find the preceding heading and parse a 4-digit year from it."""
    prev = table.find_previous(["h2", "h3", "h4"])
    if not prev:
        return None
    txt = prev.get_text(strip=True)
    m = re.search(r"\b(20[2-3][0-9])\b", txt)
    return int(m.group(1)) if m else None


def _is_polling_table(table: Tag) -> bool:
    """A polling-table has 'Polling firm' header and a year heading."""
    headers = [th.get_text(strip=True) for th in table.find_all("th")[:5]]
    if not headers:
        return False
    if not any("Polling firm" in h for h in headers):
        return False
    return True


def _build_column_map(header_row: Tag) -> dict[int, str]:
    """Map table column index -> party_code (for party columns only)."""
    out: dict[int, str] = {}
    for i, th in enumerate(_expand_cells(header_row.find_all("th"))):
        txt = th.get_text(strip=True)
        # The header text often contains nested links; take the leaf.
        for header_key, code in PARTY_HEADER_MAP.items():
            if txt == header_key:
                out[i] = code
                break
    return out


def _cell_span(cell: Tag) -> int:
    raw = cell.get("colspan")
    if raw in (None, "", "1"):
        return 1
    try:
        return max(1, int(raw))
    except ValueError:
        return 1


def _expand_cells(cells: list[Tag]) -> list[Tag]:
    out: list[Tag] = []
    for cell in cells:
        out.extend([cell] * _cell_span(cell))
    return out


def _iter_cells_with_slots(cells: list[Tag]):
    slot = 0
    for cell in cells:
        span = _cell_span(cell)
        yield slot, span, cell
        slot += span


def _resolve_party_code(covered_codes: list[str]) -> Optional[str]:
    uniq: list[str] = []
    for code in covered_codes:
        if code not in uniq:
            uniq.append(code)
    if not uniq:
        return None
    if len(uniq) == 1:
        return uniq[0]
    return MERGED_PARTY_CODE_MAP.get(tuple(uniq))


def _extract_result_rows(cells: list[Tag], col_map: dict[int, str], poll_id: int) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    emitted_codes: set[str] = set()
    for start_slot, span, cell in _iter_cells_with_slots(cells):
        covered_codes = [col_map[i] for i in range(start_slot, start_slot + span) if i in col_map]
        party_code = _resolve_party_code(covered_codes)
        if not party_code or party_code in emitted_codes:
            continue
        pct = _parse_percent(cell.get_text(strip=True))
        if pct is None:
            continue
        rows.append(
            {
                "poll_id": poll_id,
                "party_code": party_code,
                "percentage": pct,
            }
        )
        emitted_codes.add(party_code)
    return rows


def stage_polls_from_wikipedia(html_path: Path) -> tuple[int, int]:
    """Parse the Wikipedia article snapshot and upsert polls + results.

    Returns (n_inserted, n_updated). `n_updated` is best-effort: counts
    rows whose loaded_at was already set before upsert. Skipped/failed
    row count is logged separately.
    """
    html = html_path.read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "lxml")
    tables = soup.find_all("table", class_="wikitable")

    client = supabase()
    n_inserted = 0
    n_updated = 0
    n_skipped = 0

    for ti, table in enumerate(tables):
        if not _is_polling_table(table):
            continue
        year = _detect_year(table)
        if year is None or year < 2023:
            # Skip non-year tables (Vote share, scenarios, approval polls).
            continue
        rows = table.find_all("tr")
        if len(rows) < 3:
            continue
        col_map = _build_column_map(rows[0])
        if not col_map:
            logger.warning("polls.stage: table #{} has no party cols, skip", ti)
            continue

        for row in rows[1:]:
            cells = row.find_all(["td", "th"])
            expanded = _expand_cells(cells)
            if len(expanded) < 12:
                continue
            fw_cell = expanded[1]
            end_iso = fw_cell.get("data-sort-value", "")
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", end_iso):
                continue
            pollster_raw = expanded[0].get_text(strip=True)
            pollster_code = _normalize_pollster(pollster_raw)
            if not pollster_code:
                logger.debug(
                    "polls.stage: unknown pollster {!r} (year={}), skip",
                    pollster_raw, year,
                )
                n_skipped += 1
                continue
            try:
                start_d, end_d = _parse_fieldwork_dates(
                    fw_cell.get_text(strip=True), end_iso
                )
            except Exception as e:
                logger.warning("polls.stage: date parse fail {!r}: {!r}", pollster_raw, e)
                n_skipped += 1
                continue
            sample = _parse_sample(expanded[2].get_text(strip=True))
            source_url = _row_pollster_url(expanded[0]) or (
                f"https://en.wikipedia.org/wiki/"
                f"Opinion_polling_for_the_next_Polish_parliamentary_election"
            )

            # Build poll header row.
            now_ts = datetime.now(timezone.utc).isoformat()
            poll_row = {
                "pollster": pollster_code,
                "conducted_at_start": start_d.isoformat(),
                "conducted_at_end": end_d.isoformat(),
                "sample_size": sample,
                "source": "wikipedia_en",
                "source_url": source_url,
                "source_path": str(html_path.relative_to(html_path.parents[3]))
                if str(html_path).startswith(str(html_path.parents[3]))
                else html_path.name,
                "election_target": "sejm",
                "staged_at": now_ts,
                "loaded_at": now_ts,
            }

            # Check if poll already exists (for n_updated counting).
            sample_filter = sample if sample is not None else None
            try:
                q = (
                    client.table("polls")
                    .select("id,loaded_at")
                    .eq("pollster", pollster_code)
                    .eq("conducted_at_end", end_d.isoformat())
                    .eq("election_target", "sejm")
                )
                if sample_filter is None:
                    q = q.is_("sample_size", "null")
                else:
                    q = q.eq("sample_size", sample_filter)
                existing = q.execute().data
            except Exception as e:
                logger.warning("polls.stage: select fail: {!r}", e)
                existing = []

            try:
                if existing:
                    poll_id = existing[0]["id"]
                    client.table("polls").update(
                        {
                            "source_path": poll_row["source_path"],
                            "source_url": poll_row["source_url"],
                            "conducted_at_start": poll_row["conducted_at_start"],
                            "staged_at": now_ts,
                            "loaded_at": now_ts,
                        }
                    ).eq("id", poll_id).execute()
                    n_updated += 1
                else:
                    ins = client.table("polls").insert(poll_row).execute()
                    poll_id = ins.data[0]["id"]
                    n_inserted += 1
            except Exception as e:
                logger.warning(
                    "polls.stage: poll insert fail pollster={} end={}: {!r}",
                    pollster_code, end_d, e,
                )
                n_skipped += 1
                continue

            # Build poll_results rows.
            results_rows = _extract_result_rows(cells, col_map, poll_id)
            try:
                # Upsert first, then prune stale rows. This keeps reingest
                # resilient: a transient write failure won't leave the poll with
                # zero results, while corrected parser output can still delete
                # previously shifted party codes that are no longer emitted.
                if results_rows:
                    client.table("poll_results").upsert(
                        results_rows, on_conflict="poll_id,party_code"
                    ).execute()
                    emitted_codes = sorted(
                        {str(r["party_code"]) for r in results_rows if r.get("party_code")}
                    )
                    existing_rows = (
                        client.table("poll_results")
                        .select("party_code")
                        .eq("poll_id", poll_id)
                        .execute()
                        .data
                    ) or []
                    stale_codes = sorted({
                        str(r["party_code"])
                        for r in existing_rows
                        if r.get("party_code") not in emitted_codes
                    })
                    if stale_codes:
                        client.table("poll_results").delete().eq(
                            "poll_id", poll_id
                        ).in_("party_code", stale_codes).execute()
            except Exception as e:
                logger.warning(
                    "polls.stage: results replace fail poll_id={}: {!r}",
                    poll_id, e,
                )

    logger.info(
        "polls.stage: inserted={} updated={} skipped={}",
        n_inserted, n_updated, n_skipped,
    )
    return n_inserted, n_updated
