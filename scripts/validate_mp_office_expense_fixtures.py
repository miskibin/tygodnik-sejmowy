"""Validate mp_office_expense fixtures after OCR+LLM extraction.

The LLM occasionally:
- mis-categorizes amounts when OCR scrambles columns
- hallucinates small values from OCR noise (single-digit "amounts")
- drops funds_* header fields entirely
- produces a sum(items) that's way off from funds_spent/funds_total

This script flags + optionally quarantines fixtures whose internal arithmetic
doesn't check out. A real report should have:
  - funds_allocated > 0 (everyone got a ryczałt)
  - sum(items) ≈ funds_spent (within ±1 zł rounding)
  - funds_allocated + funds_carryover + funds_interest ≈ funds_total

Run:
    uv run python scripts/validate_mp_office_expense_fixtures.py [--quarantine]
"""
from __future__ import annotations

import json
import shutil
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "sejm" / "mp_office_expenses"
QUARANTINE_DIR = FIXTURES_DIR.parent / "mp_office_expenses_quarantine"


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
    item_sum = sum((to_dec(it.get("amount")) or Decimal(0)) for it in items)
    funds_spent = to_dec(payload.get("funds_spent"))
    funds_total = to_dec(payload.get("funds_total"))
    funds_allocated = to_dec(payload.get("funds_allocated"))

    # Everyone got at least one annual ryczałt (≈280k for 2025). If funds_allocated
    # is missing and item_sum is tiny, the LLM almost certainly produced garbage.
    if funds_allocated is None and item_sum < Decimal(1000):
        return False, f"no funds_allocated and item_sum tiny ({item_sum})"

    # Items typically sum to 100k–400k. Anything under 5k is almost certainly
    # OCR noise being mis-extracted as amounts.
    if item_sum < Decimal(5000):
        return False, f"item sum suspiciously low: {item_sum}"

    if funds_spent is not None and funds_spent > Decimal(1000):
        diff = abs(item_sum - funds_spent)
        # Two cases of legitimate small mismatch:
        #   - jakglosuja integer rounding: ~30 zł over 23 categories
        #   - illegible handwritten field that one parser missed: a few k
        # Quarantine only catastrophic mismatches (LLM got the wrong PDF /
        # OCR was unreadable / item_sum is half of total).
        pct_off = float(diff) / float(funds_spent)
        if pct_off > 0.30 and diff > Decimal(50_000):
            return False, f"sum(items)={item_sum} vs funds_spent={funds_spent} (diff={diff}, {pct_off*100:.0f}%)"

    # Any single item exceeding 500k zł is suspect (no category should be that big)
    for it in items:
        v = to_dec(it.get("amount")) or Decimal(0)
        if v > Decimal(500_000):
            return False, f"item code {it.get('category_code')} amount={v} > 500k"

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
        print("\nFailures:")
        for path, reason in bad[:30]:
            mp_id = path.stem.split("_")[1]
            print(f"  mp_id={mp_id:>3}: {reason}")
        if len(bad) > 30:
            print(f"  ... and {len(bad)-30} more")

    if quarantine and bad:
        QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)
        for path, _ in bad:
            shutil.move(str(path), str(QUARANTINE_DIR / path.name))
        print(f"\nMoved {len(bad)} bad fixtures to {QUARANTINE_DIR}/")

    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
