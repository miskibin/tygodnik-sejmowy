"""Bootstrap MP office expense data from jakglosuja.pl — JSON payload version.

Earlier version scraped jakglosuja's rendered HTML table, which (a) rounded
amounts to integer złotówki and (b) missed the "Inne wydatki" (kat 23)
sub-list, leaving sum(items) != PDF Razem for ~107 MPs.

This version extracts jakglosuja's embedded Next.js RSC JSON payload
instead. The payload carries:
- decimal-precision amounts (e.g. 37165.93 zł, not 37166)
- the kat 23 sub-list with each item's label + amount
- funds_total_received (= funds_allocated + funds_carryover for jakglosuja)
- the report period string

Run:
    uv run python scripts/bootstrap_jakglosuja_expenses_json.py
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

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/120.0 Safari/537.36")
SID_MIN = int(os.environ.get("BOOTSTRAP_SID_MIN", "900"))
SID_MAX = int(os.environ.get("BOOTSTRAP_SID_MAX", "1500"))
WORKERS = int(os.environ.get("BOOTSTRAP_WORKERS", "8"))
THROTTLE_S = float(os.environ.get("BOOTSTRAP_THROTTLE_S", "0.05"))

PDF_URL_RE = re.compile(
    r"https://orka\.sejm\.gov\.pl/rozlicz10\.nsf/lista/2025(?P<mp>\d{1,3})/\$File/2025ryczalt_(?P=mp)\.pdf"
)


def _unescape(s: str) -> str:
    """Next.js RSC payloads come HTML-escaped + JSON-escaped. Reverse both."""
    # Strip leading backslash-escape sequences common in RSC strings
    return s.replace('\\"', '"').replace("\\\\", "\\").replace("\\u003c", "<").replace("\\u003e", ">").replace("\\n", "\n")


# We look for `{"id":..., "report_year":2025, "total_pln":..., "total_received_pln":..., "items":[...]}`
# inside the escaped RSC payload. The string is single-quoted in JS but encoded;
# parsing it requires careful brace-matching since regex can't handle nested JSON.
REPORT_START_RE = re.compile(
    r'\\?"id\\?":\s*(?P<id>\d+),\\?"report_year\\?":\s*2025,\\?"total_pln\\?":\\?"(?P<total>[^"\\]+)\\?",\\?"total_received_pln\\?":\\?"(?P<received>[^"\\]+)\\?"'
)


def _extract_balanced(text: str, start_idx: int) -> str | None:
    """From `start_idx` (must point at '{'), return the balanced-braces substring
    accounting for escaped vs unescaped strings."""
    if start_idx >= len(text) or text[start_idx] != "{":
        return None
    depth = 0
    in_str = False
    i = start_idx
    while i < len(text):
        c = text[i]
        if c == "\\":
            i += 2
            continue
        if c == '"':
            in_str = not in_str
        elif not in_str:
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return text[start_idx:i + 1]
        i += 1
    return None


def _parse_items_for_2025(text: str) -> tuple[dict | None, list[dict]]:
    """Locate the 2025 report block in the RSC payload, return (header_info, items)."""
    m = REPORT_START_RE.search(text)
    if not m:
        return None, []

    # Walk back to find the enclosing '{'
    start = text.rfind("{", 0, m.start())
    if start == -1:
        return None, []

    raw = _extract_balanced(text, start)
    if raw is None:
        return None, []

    # Unescape and parse
    try:
        obj = json.loads(_unescape(raw))
    except Exception:
        return None, []

    if obj.get("report_year") != 2025:
        return None, []

    return obj, obj.get("items") or []


def extract_one(html: str) -> dict | None:
    """Parse one sprawozdanie page from jakglosuja's RSC JSON payload."""
    pdf_m = PDF_URL_RE.search(html)
    if not pdf_m:
        return None
    mp_id = int(pdf_m.group("mp"))
    pdf_url = pdf_m.group(0) + "?OpenElement"

    header, items_raw = _parse_items_for_2025(html)
    if not header or not items_raw:
        return None

    # Build canonical items list (23 entries, padded with 0 for missing)
    items_by_code: dict[int, dict] = {}
    for it in items_raw:
        code = it.get("number")
        if not isinstance(code, int) or not (1 <= code <= 23):
            continue
        amount = it.get("amount_pln")
        if amount is None:
            amount = 0
        subs = it.get("subcategories") or []
        notes = None
        # For category 23 (Inne wydatki — sub-itemized), prefer the sum of
        # subcategories over the rolled-up amount. Jakglosuja's aggregate
        # is sometimes 0, sometimes wrong sign (observed -57964.88 on MP 125
        # while the subs sum cleanly to +57965 on the PDF), so always trust
        # the itemized breakdown when present and positive.
        if code == 23 and subs:
            sub_sum = sum(float(s.get("amount_pln") or 0) for s in subs)
            if sub_sum > 0:
                amount = sub_sum
        if subs:
            parts = []
            for s in subs:
                lbl = (s.get("label") or "").strip()
                amt = s.get("amount_pln") or 0
                lbl_short = re.sub(r"^inne\s*-\s*", "", lbl).strip()
                parts.append(f"{lbl_short}: {amt:.2f} zł" if amt else lbl_short)
            notes = "; ".join(parts)[:1200]
        items_by_code[code] = {
            "category_code": code,
            "amount": f"{float(amount):.2f}",
            "notes": notes,
        }

    items = []
    for code in range(1, 24):
        if code in items_by_code:
            items.append(items_by_code[code])
        else:
            items.append({"category_code": code, "amount": "0.00", "notes": None})

    # Reconcile sum(items) vs reported total_pln. If they disagree by more
    # than rounding (>1 zł) AND cat 23 is currently 0, the missing money is
    # almost always in the "Inne wydatki" sub-list that jakglosuja didn't
    # itemise. We infer cat 23 = (total_pln - sum_22cat) so sum(items) ==
    # funds_spent by construction. This is the same rule we manually
    # verified on MP 300 (PDF OCR confirmed kat 23 ≈ diff).
    total_pln_raw = header.get("total_pln")
    total_pln: float | None = None
    if total_pln_raw is not None:
        try:
            total_pln = float(total_pln_raw)
        except (TypeError, ValueError):
            total_pln = None
    if total_pln is not None:
        sum_other = sum(float(it["amount"]) for it in items if it["category_code"] != 23)
        diff = total_pln - sum_other
        cat23 = next(it for it in items if it["category_code"] == 23)
        cat23_amt = float(cat23["amount"])
        if abs(sum_other + cat23_amt - total_pln) > 1.0 and cat23_amt == 0 and 0 < diff < 250_000:
            cat23["amount"] = f"{diff:.2f}"
            note_extra = 'suma pozycji "Inne wydatki" wyliczona jako roznica wobec Razem z PDF (szczegoly w oryginale)'
            cat23["notes"] = (cat23.get("notes") + "; " + note_extra) if cat23.get("notes") else note_extra

    payload: dict = {
        "term": 10,
        "mp_id": mp_id,
        "year": 2025,
        "source_url": pdf_url,
        "items": items,
    }
    if total_pln is not None:
        payload["funds_spent"] = f"{total_pln:.2f}"
    received = header.get("total_received_pln")
    if received is not None:
        try:
            payload["funds_total"] = f"{float(received):.2f}"
        except (TypeError, ValueError):
            pass

    return payload


def fetch_sid(client: httpx.Client, sid: int) -> tuple[int, dict | None]:
    url = f"https://jakglosuja.pl/sprawozdania/{sid}"
    try:
        r = client.get(url, timeout=20)
    except httpx.HTTPError:
        return sid, None
    if r.status_code != 200:
        return sid, None
    return sid, extract_one(r.text)


def main() -> int:
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": UA, "Accept": "text/html,*/*"}

    print(f"Scraping jakglosuja sids {SID_MIN}..{SID_MAX} with {WORKERS} workers")
    by_mp: dict[int, dict] = {}
    sids = list(range(SID_MIN, SID_MAX + 1))
    with httpx.Client(headers=headers, follow_redirects=True) as client:
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futures = [ex.submit(fetch_sid, client, sid) for sid in sids]
            done = 0
            for f in as_completed(futures):
                sid, payload = f.result()
                done += 1
                if payload:
                    by_mp[payload["mp_id"]] = payload
                if done % 50 == 0:
                    print(f"  progress: {done}/{len(sids)}  unique MPs: {len(by_mp)}")

    print(f"Collected {len(by_mp)} unique MP reports from JSON payload")
    if not by_mp:
        print("ERROR: nothing scraped")
        return 1

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
    return 0


if __name__ == "__main__":
    sys.exit(main())
