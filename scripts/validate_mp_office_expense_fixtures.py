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

MAX_REASONABLE = Decimal(1_500_000)
MIN_ITEMS_SUM = Decimal(30_000)
MIN_ALLOCATED = Decimal(100_000)
MAX_SINGLE_ITEM = Decimal(500_000)


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
        v = to_dec(it.get("amount"))
        if v is None:
            return False, f"item code {it.get('category_code')} amount not parseable: {it.get('amount')!r}"
        if v < 0:
            return False, f"item code {it.get('category_code')} negative amount: {v}"
        if v > MAX_SINGLE_ITEM:
            return False, f"item code {it.get('category_code')} amount {v} > {MAX_SINGLE_ITEM} (implausible)"
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
