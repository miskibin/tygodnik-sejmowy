"""Validator for mp_office_expense fixtures.

Public data must be correct. The OCR + LLM pipeline produces some
garbage (negative funds, items with single-digit "amounts" from OCR noise,
funds_spent that disagrees with sum(items) by tens of thousands). This
script quarantines anything we can't vouch for.

Strategy: trust `sum(items)` as ground truth (always self-consistent — it's
literally the sum of what we'll display). Hard-reject fixtures that fail
sanity bounds or look like parser garbage. The UI separately decides
which of the *PDF-reported* funds_* fields to show — only those that
agree with sum(items).

Hard-reject rules (this script):
- funds_spent < 0 OR > 1.5 M zł.
- funds_allocated present and < 100 k zł (parser noise; real allocation
  is ~280 k for full-year MP).
- Any single item amount < 0 OR > 500 k zł.
- sum(items) < 30 k OR > 1.5 M zł (any office that ran the year spent
  at least ~30 k; cap at 1.5 M for sanity).
- Item codes not exactly 1..23.

Run:
    uv run python scripts/validate_mp_office_expense_fixtures.py
    uv run python scripts/validate_mp_office_expense_fixtures.py --quarantine
"""
from __future__ import annotations

import json
import shutil
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "sejm" / "mp_office_expenses"
QUARANTINE_DIR = FIXTURES_DIR.parent / "mp_office_expenses_quarantine"

# Bounds grounded in regulations + ryczałt arithmetic for term 10, year 2025:
#
# - Annual ryczałt biurowy 2025: 23 310 zł/mc × 12 = 279 720 zł/rok
#   (Art. 23 ust. 3 ustawy z 9 V 1996 r. o wykonywaniu mandatu posła i
#   senatora — Dz.U. 2024 poz. 907 t.j.; Zarządzenie Marszałka Sejmu
#   nr 8 z 25 IX 2001 r. w sprawie warunków organizacyjno-technicznych...).
# - Posłowie z orzeczeniem o znacznym stopniu niepełnosprawności mogą
#   otrzymać do +50 % (≈ 11 655 zł/mc; podstawa: §6a ZMS nr 8).
# - Środki niewykorzystane z poprzedniego okresu (carryover) → praktyczna
#   górna granica całorocznych wydatków ≈ 1,5× ryczałtu = ~420 k.
MAX_REASONABLE = Decimal(1_500_000)     # absolute sanity ceiling
MIN_ITEMS_SUM = Decimal(30_000)         # any office that ran spent at least this
MIN_ALLOCATED = Decimal(100_000)
MAX_SINGLE_ITEM = Decimal(500_000)

# Per-category caps. STATUTORY caps are marked as such (cite the source);
# the rest are empirical (p99 of 391 validated 2025 reports + headroom),
# meant only to catch parser errors — not to enforce legality.
#
# References:
#   ZMS nr 8 — Zarządzenie Marszałka Sejmu nr 8 z 25 IX 2001 r.
#   ZMS nr 2/2017 — Zarządzenie nr 2 z 31 III 2017 r. (formularz sprawozdania).
#   stawka km — Rozporządzenie Ministra Infrastruktury 2002/27/271
#     (stawka 1,15 zł/km dla pojemności >900 cm³; 0,89 zł/km ≤900 cm³;
#     do końca 2025 r. limit pojazdu osobowego: 3 500 km/mc).
# Strategy: tight cap only on STATUTORILY-limited categories (kat 9 kilometrówka,
# kat 21 RTV). Other categories use a generous global cap — any single category
# exceeding 250 k zł would imply ~90 % of the annual ryczałt going to one
# bucket, which never happens with real data. The sum-vs-funds_spent
# consistency check (data_confidence) is what actually catches mis-extractions,
# not per-category empirical p99.
GLOBAL_CAP = Decimal(250_000)
CATEGORY_CAPS: dict[int, Decimal] = {
    9:  Decimal(50_000),    # STATUTORY 2025: 3 500 km/mc × 12 × 1,15 zł = 48 300 zł/rok
                            # (rozp. Min. Infrastruktury, stawka km dla >900 cm³;
                            # reformy Czarzastego od I 2026 → 1 500 km/mc = 20 700/rok)
    21: Decimal(5_000),     # STATUTORY: abonament RTV ~25 zł/mc/odbiornik
                            # (5 k pokrywa nawet kilka odbiorników w premium-biurze)
}


def _cap_for(code: int) -> Decimal:
    return CATEGORY_CAPS.get(code, GLOBAL_CAP)


def to_dec(s) -> Decimal | None:
    if s is None:
        return None
    try:
        return Decimal(str(s))
    except (InvalidOperation, ValueError):
        return None


def validate(payload: dict) -> tuple[bool, str]:
    items = payload.get("items") or []
    if len(items) != 23:
        return False, f"expected 23 items, got {len(items)}"

    codes = sorted(it.get("category_code") for it in items)
    if codes != list(range(1, 24)):
        return False, f"category codes not 1..23: {codes}"

    item_sum = Decimal(0)
    for it in items:
        code = it.get("category_code")
        v = to_dec(it.get("amount"))
        if v is None:
            return False, f"item code {code} amount not parseable: {it.get('amount')!r}"
        if v < 0:
            return False, f"item code {code} negative amount: {v}"
        if v > MAX_SINGLE_ITEM:
            return False, f"item code {code} amount {v} > {MAX_SINGLE_ITEM} (implausible)"
        cap = _cap_for(code)
        if v > cap:
            return False, f"item code {code} amount {v} > category cap {cap} (likely parser error)"
        item_sum += v

    if item_sum < MIN_ITEMS_SUM:
        return False, f"sum(items)={item_sum} < {MIN_ITEMS_SUM} (likely OCR failure)"
    if item_sum > MAX_REASONABLE:
        return False, f"sum(items)={item_sum} > {MAX_REASONABLE} (implausible)"

    funds_spent = to_dec(payload.get("funds_spent"))
    funds_allocated = to_dec(payload.get("funds_allocated"))
    funds_total = to_dec(payload.get("funds_total"))

    if funds_spent is not None:
        if funds_spent < 0:
            return False, f"funds_spent negative: {funds_spent}"
        if funds_spent > MAX_REASONABLE:
            return False, f"funds_spent {funds_spent} > {MAX_REASONABLE}"

    if funds_allocated is not None and funds_allocated > 0:
        if funds_allocated < MIN_ALLOCATED:
            return False, f"funds_allocated {funds_allocated} < {MIN_ALLOCATED} (parser noise)"
        if funds_allocated > MAX_REASONABLE:
            return False, f"funds_allocated {funds_allocated} > {MAX_REASONABLE}"

    if funds_total is not None and funds_total > 0:
        if funds_total < MIN_ALLOCATED:
            return False, f"funds_total {funds_total} < {MIN_ALLOCATED}"
        if funds_total > MAX_REASONABLE:
            return False, f"funds_total {funds_total} > {MAX_REASONABLE}"

    return True, ""


def main() -> int:
    quarantine = "--quarantine" in sys.argv
    files = sorted(FIXTURES_DIR.glob("t10_*_2025.json"))
    ok = 0
    bad = []
    for path in files:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            bad.append((path, f"json parse: {e}"))
            continue
        passed, reason = validate(payload)
        if passed:
            ok += 1
        else:
            bad.append((path, reason))

    print(f"Total fixtures: {len(files)}")
    print(f"  Valid:  {ok}")
    print(f"  Failed: {len(bad)}")
    if bad:
        print("\nFailures (first 40):")
        for path, reason in bad[:40]:
            mp_id = path.stem.split("_")[1]
            print(f"  mp_id={mp_id:>3}: {reason}")
        if len(bad) > 40:
            print(f"  ... and {len(bad)-40} more")

    if quarantine and bad:
        QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)
        for path, _ in bad:
            shutil.move(str(path), str(QUARANTINE_DIR / path.name))
        print(f"\nMoved {len(bad)} bad fixtures to {QUARANTINE_DIR}/")

    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
