"""One-shot bootstrap scraper: jakglosuja.pl → mp_office_expenses fixtures.

The Sejm has no API for office expense reports. The PDFs on orka.sejm.gov.pl
are scanned (not digital), requiring OCR + LLM to extract 23 amounts per MP —
slow (~150s/PDF) and error-prone (LLM occasionally mis-assigns categories
when OCR scrambles the table layout).

jakglosuja.pl independently parsed all 460 reports and exposes them at
`/sprawozdania/{internal_id}`. Each page contains:
- the orka.sejm.gov.pl PDF URL (which encodes the MP id)
- 23 standardised amounts (rounded to złotówki)

This script enumerates sprawozdanie IDs in a known range, harvests pairs, and
writes one fixture per MP matching the supagraf schema.

NOT a long-term replacement for OCR — the bootstrap path that gets us
real data in the app today. The OCR + LLM path stays in `fetch/mp_office_expenses.py`
and can be re-run later for precision-decimal values, or for the next year's
reports when jakglosuja lags us.

Run:
    uv run python scripts/bootstrap_jakglosuja_expenses.py
"""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURES_DIR = REPO_ROOT / "fixtures" / "sejm" / "mp_office_expenses"
INDEX_PATH = FIXTURES_DIR / "_index.json"

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/120.0 Safari/537.36")

# Range derived from observed IDs on the public listing page (932..1367 on
# first page; widen to 900..1500 for headroom across the full 460).
SID_MIN = int(os.environ.get("BOOTSTRAP_SID_MIN", "900"))
SID_MAX = int(os.environ.get("BOOTSTRAP_SID_MAX", "1500"))
WORKERS = int(os.environ.get("BOOTSTRAP_WORKERS", "8"))
THROTTLE_S = float(os.environ.get("BOOTSTRAP_THROTTLE_S", "0.1"))

PDF_URL_RE = re.compile(
    r"https://orka\.sejm\.gov\.pl/rozlicz10\.nsf/lista/2025(?P<mp>\d{1,3})/\$File/2025ryczalt_(?P=mp)\.pdf"
)

# Each row in the table is a `<tr>` with 6 `<td>`s:
#   1: Lp.       — "01".."23" bolded
#   2: category name
#   3: amount    — current year (e.g. "120 125 zł")
#   4: prev year amount
#   5: YoY diff
#   6: YoY pct or em-dash
TR_RE = re.compile(r"<tr[^>]*>(?P<body>.*?)</tr>", re.DOTALL)
TD_RE = re.compile(r"<td[^>]*>(?P<inner>.*?)</td>", re.DOTALL)
LP_RE = re.compile(r"^\s*(\d{1,2})\s*$")
AMT_RE = re.compile(r"(-?\d[\d\s\xa0]*)\s*zł")


def parse_amount(s: str) -> int:
    """jakglosuja shows integers only — strip whitespace, return int."""
    s = re.sub(r"\s+", "", s)
    s = s.replace("\xa0", "")
    return int(s) if s.lstrip("-").isdigit() else 0


def _strip_html(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s)
    s = s.replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()


def extract_one(html: str) -> dict | None:
    """Parse one sprawozdanie page. Returns dict or None if not a 2025 BOP report."""
    m = PDF_URL_RE.search(html)
    if not m:
        return None
    mp_id = int(m.group("mp"))
    pdf_url = m.group(0) + "?OpenElement"

    items_by_code: dict[int, int] = {}
    razem_total: int | None = None  # the table's "Razem" row sums all 23

    for tr in TR_RE.finditer(html):
        tds = TD_RE.findall(tr.group("body"))
        if len(tds) < 3:
            continue
        first = _strip_html(tds[0])
        lp_m = LP_RE.match(first)
        if lp_m:
            code = int(lp_m.group(1))
            if not (1 <= code <= 23):
                continue
            # Current year amount is the 3rd <td> (index 2)
            amt_text = _strip_html(tds[2])
            am = AMT_RE.search(amt_text)
            if am:
                items_by_code[code] = parse_amount(am.group(1))
            else:
                items_by_code[code] = 0
        elif first.lower().startswith("razem"):
            # The Razem row uses colSpan=2 on the first td, so the amount
            # column index shifts left by 1 (tds[1] not tds[2]).
            amt_text = _strip_html(tds[1]) if len(tds) > 1 else ""
            am = AMT_RE.search(amt_text)
            if am:
                razem_total = parse_amount(am.group(1))

    if not items_by_code:
        return None

    # Pad missing codes with 0 so every fixture has 23 items
    items = []
    for code in range(1, 24):
        items.append({
            "category_code": code,
            "amount": str(items_by_code.get(code, 0)),
        })

    payload: dict = {
        "term": 10,
        "mp_id": mp_id,
        "year": 2025,
        "source_url": pdf_url,
        "items": items,
    }
    spent = razem_total if razem_total is not None else sum(items_by_code.values())
    payload["funds_spent"] = str(spent)
    return payload


def fetch_sid(client: httpx.Client, sid: int) -> tuple[int, dict | None]:
    url = f"https://jakglosuja.pl/sprawozdania/{sid}"
    try:
        r = client.get(url, timeout=15)
    except httpx.HTTPError:
        return sid, None
    if r.status_code != 200:
        return sid, None
    return sid, extract_one(r.text)


def main() -> int:
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": UA, "Accept": "text/html,*/*"}

    print(f"Scraping jakglosuja.pl sids {SID_MIN}..{SID_MAX} with {WORKERS} workers")
    by_mp: dict[int, dict] = {}

    sids = list(range(SID_MIN, SID_MAX + 1))
    with httpx.Client(headers=headers, follow_redirects=True) as client:
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futures = []
            for sid in sids:
                f = ex.submit(fetch_sid, client, sid)
                futures.append(f)
                if THROTTLE_S > 0:
                    time.sleep(THROTTLE_S / WORKERS)
            done = 0
            for f in as_completed(futures):
                sid, payload = f.result()
                done += 1
                if payload:
                    mp_id = payload["mp_id"]
                    by_mp[mp_id] = payload  # last-write-wins (shouldn't collide)
                if done % 50 == 0:
                    print(f"  progress: {done}/{len(sids)}  unique MPs so far: {len(by_mp)}")

    print(f"Collected {len(by_mp)} unique MP reports")
    if not by_mp:
        print("ERROR: nothing scraped — check SID range / network")
        return 1

    # Write per-MP fixtures matching the supagraf schema (Pydantic-validated by stage).
    written = 0
    for mp_id, payload in sorted(by_mp.items()):
        path = FIXTURES_DIR / f"t10_{mp_id}_2025.json"
        body = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8")
        fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=str(FIXTURES_DIR))
        try:
            with os.fdopen(fd, "wb") as fh:
                fh.write(body)
            os.replace(tmp, path)
            written += 1
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
    print(f"Wrote {written} fixtures to {FIXTURES_DIR}")

    # Refresh _index.json with the actually-available reports (so re-fetch via
    # the OCR pipeline later only targets these MPs).
    index = [
        {
            "term": 10,
            "mp_id": p["mp_id"],
            "year": 2025,
            "pdf_url": p["source_url"],
        }
        for p in sorted(by_mp.values(), key=lambda p: p["mp_id"])
    ]
    INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Refreshed {INDEX_PATH} with {len(index)} entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
