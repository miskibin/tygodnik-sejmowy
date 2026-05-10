"""Shared helpers for contract tests."""
from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_ROOT = REPO_ROOT / "fixtures"


def fixture_files(resource: str, subdir: str = "sejm") -> list[Path]:
    base = FIXTURES_ROOT / subdir / resource
    return [
        p for p in sorted(base.glob("*.json"))
        if not p.name.startswith("_") and "voting_stats" not in p.name
    ]


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)
