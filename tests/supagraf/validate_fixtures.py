"""Sanity-check the on-disk fixtures: every JSON parses, _index aligns with files,
captured items mostly fall in target year. Run after a capture pass."""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2] / "fixtures"


def _load(p: Path):
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def _check_dir(dir_path: Path, year: int, date_keys: tuple[str, ...]) -> tuple[int, list[str]]:
    errs: list[str] = []
    if not dir_path.exists():
        return 0, [f"missing dir {dir_path}"]
    json_files = [
        p
        for p in dir_path.glob("*.json")
        if p.name not in {"_index.json", "_list.json", "_groups.json"}
    ]
    counts: Counter[str] = Counter()
    for p in json_files:
        try:
            data = _load(p)
        except Exception as e:
            errs.append(f"{p}: failed to parse ({e})")
            continue
        if not isinstance(data, dict):
            counts["non-dict"] += 1
            continue
        for k in date_keys:
            if k in data:
                v = data[k]
                if isinstance(v, str) and v[:4]:
                    counts[v[:4]] += 1
                    break
        else:
            counts["no-date"] += 1
    return len(json_files), [
        *errs,
        *[f"   year={y}: {n}" for y, n in counts.most_common()],
    ]


def main() -> int:
    expected = {
        "sejm/mps": ("birthDate",),  # MPs not date-filtered
        "sejm/clubs": (),
        "sejm/committees": (),
        "sejm/proceedings": (),
        "sejm/votings": ("date",),
        "sejm/prints": ("documentDate",),
        "sejm/processes": ("documentDate",),
        "sejm/bills": ("dateOfReceipt",),
        "sejm/interpellations": ("receiptDate",),
        "sejm/writtenQuestions": ("receiptDate",),
        "sejm/videos": ("startDateTime",),
    }
    bad = 0
    for sub, keys in expected.items():
        d = ROOT / sub
        n, lines = _check_dir(d, 2026, keys)
        print(f"{sub}: {n} json files")
        for line in lines:
            print(line)
            if "failed to parse" in line:
                bad += 1

    # ELI walks per-publisher per-year
    eli_root = ROOT / "eli"
    if eli_root.exists():
        for pub in eli_root.iterdir():
            for yr in pub.iterdir():
                n, lines = _check_dir(yr, 2026, ("ELI", "address"))
                print(f"eli/{pub.name}/{yr.name}: {n} json files")
                for line in lines:
                    print(line)
                    if "failed to parse" in line:
                        bad += 1

    # _index counts must agree with file counts (loose)
    print("--- _index sanity ---")
    for idx in ROOT.rglob("_index.json"):
        try:
            data = _load(idx)
        except Exception as e:
            print(f"BAD INDEX {idx}: {e}")
            bad += 1
            continue
        n = data.get("count")
        if not isinstance(n, int) or n < 0:
            print(f"BAD COUNT {idx}: {n}")
            bad += 1
        # files in same dir
        sib = sum(
            1
            for p in idx.parent.glob("*.json")
            if p.name not in {"_index.json", "_list.json", "_groups.json"}
        )
        # may be zero-content for nested dirs (e.g. proceedings/_statements has its own
        # subdirs); accept >=
        if sib < n:
            print(f"WARN {idx}: index says {n} but only {sib} json files (expected for nested)")

    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
