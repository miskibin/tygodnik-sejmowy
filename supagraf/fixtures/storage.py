"""On-disk fixture storage. Atomic writes, _index.json maintenance."""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def write_json(path: Path, payload: Any) -> None:
    body = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8")
    _atomic_write(path, body)


def write_binary(path: Path, data: bytes) -> None:
    _atomic_write(path, data)


def write_text(path: Path, text: str) -> None:
    _atomic_write(path, text.encode("utf-8"))


def exists(path: Path) -> bool:
    return path.exists() and path.stat().st_size > 0


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def update_index(index_path: Path, ids: Iterable[str | int]) -> None:
    """Write `_index.json` with sorted unique IDs and timestamp."""
    existing: dict[str, Any] = {"ids": [], "captured_at": None}
    if index_path.exists():
        try:
            existing = load_json(index_path)
        except (json.JSONDecodeError, OSError):
            pass
    merged = sorted({str(i) for i in (*existing.get("ids", []), *ids)})
    payload = {
        "ids": merged,
        "count": len(merged),
        "captured_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    write_json(index_path, payload)


def fixtures_root(repo_root: Path | str | None = None) -> Path:
    if repo_root is None:
        repo_root = Path(__file__).resolve().parents[2]
    return Path(repo_root) / "fixtures"
