import json
from pathlib import Path

import pytest

from supagraf.fixtures.storage import (
    exists,
    load_json,
    update_index,
    write_binary,
    write_json,
    write_text,
)


def test_write_json_creates_dirs(tmp_path: Path):
    target = tmp_path / "a" / "b" / "c.json"
    write_json(target, {"hello": "świat"})
    assert target.exists()
    assert load_json(target) == {"hello": "świat"}


def test_write_json_is_pretty_and_sorted(tmp_path: Path):
    target = tmp_path / "x.json"
    write_json(target, {"b": 1, "a": 2})
    raw = target.read_text(encoding="utf-8")
    assert raw.startswith("{\n")
    # sorted: 'a' before 'b'
    assert raw.index('"a"') < raw.index('"b"')


def test_write_json_unicode_not_escaped(tmp_path: Path):
    target = tmp_path / "u.json"
    write_json(target, {"name": "Hołownia"})
    raw = target.read_text(encoding="utf-8")
    assert "Hołownia" in raw


def test_write_binary_and_text(tmp_path: Path):
    b = tmp_path / "bin"
    write_binary(b, b"\x00\x01\x02")
    assert b.read_bytes() == b"\x00\x01\x02"
    t = tmp_path / "txt"
    write_text(t, "abc")
    assert t.read_text(encoding="utf-8") == "abc"


def test_exists_false_for_empty_file(tmp_path: Path):
    p = tmp_path / "empty"
    p.write_bytes(b"")
    assert exists(p) is False


def test_update_index_dedup_and_sort(tmp_path: Path):
    idx = tmp_path / "_index.json"
    update_index(idx, [3, 1, 2])
    update_index(idx, [2, 4])
    payload = json.loads(idx.read_text(encoding="utf-8"))
    assert payload["ids"] == ["1", "2", "3", "4"]
    assert payload["count"] == 4
    assert "captured_at" in payload


def test_update_index_resilient_to_corruption(tmp_path: Path):
    idx = tmp_path / "_index.json"
    idx.write_text("garbage")
    update_index(idx, [1])
    payload = json.loads(idx.read_text(encoding="utf-8"))
    assert payload["ids"] == ["1"]


def test_atomic_write_no_tmp_left_behind(tmp_path: Path):
    target = tmp_path / "atomic.json"
    write_json(target, {"x": 1})
    write_json(target, {"x": 2})
    siblings = list(tmp_path.iterdir())
    assert all(not s.name.startswith(".tmp-") for s in siblings)
