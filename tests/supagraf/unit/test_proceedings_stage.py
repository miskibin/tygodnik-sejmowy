"""Stage proceedings — payload shape + HTML extraction + missing dir handling."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from supagraf.stage import proceedings as stage_mod


def _write_proc(d: Path, num: int, dates: list[str]):
    (d / f"{num}.json").write_text(json.dumps({
        "number": num,
        "title": f"Proceeding {num}",
        "current": False,
        "dates": dates,
        "agenda": "<p>agenda</p>",
    }), encoding="utf-8")


def _write_day(d: Path, num: int, date: str, stmts: list[dict]):
    (d / f"{num}__{date}__transcripts.json").write_text(json.dumps({
        "date": date,
        "proceedingNum": num,
        "statements": stmts,
    }), encoding="utf-8")


def _stmt(num: int, mid: int):
    return {
        "num": num, "memberID": mid, "name": f"Speaker{num}",
        "function": "", "rapporteur": False, "secretary": False, "unspoken": False,
        "startDateTime": "2026-01-08T10:00:00",
        "endDateTime": "2026-01-08T10:05:00",
    }


def _fake_client(captured: list):
    fc = MagicMock()
    def cap(rows, on_conflict=None):  # noqa: ARG001
        captured.append(rows)
        m = MagicMock()
        m.execute.return_value.data = rows
        return m
    fc.table.return_value.upsert.side_effect = cap
    return fc


def test_stage_payload_shape_with_html(tmp_path):
    _write_proc(tmp_path, 49, ["2026-01-08"])
    _write_day(tmp_path, 49, "2026-01-08", [_stmt(0, 0), _stmt(1, 5)])
    sdir = tmp_path / "49__2026-01-08__statements"
    sdir.mkdir()
    (sdir / "0.html").write_text(
        "<html><body><p>Hello <b>world</b></p></body></html>", encoding="utf-8"
    )

    captured: list = []
    with patch("supagraf.stage.proceedings.supabase", return_value=_fake_client(captured)):
        report = stage_mod.stage_proceedings(term=10, fixtures_dir=tmp_path)
    assert report.records_seen == 1
    rows = [r for batch in captured for r in batch]
    assert len(rows) == 1
    payload = rows[0]["payload"]
    assert payload["number"] == 49
    assert payload["agenda_html"] == "<p>agenda</p>"
    assert payload["dates"] == ["2026-01-08"]
    days = payload["days"]
    assert len(days) == 1
    s0 = days[0]["statements"][0]
    assert s0["num"] == 0
    assert s0["mp_id"] == 0
    assert s0["speaker_name"] == "Speaker0"
    assert s0["start_datetime"] == "2026-01-08T10:00:00"
    assert "Hello world" in s0["body_text"]
    assert "<b>" in s0["body_html"]
    s1 = days[0]["statements"][1]
    assert "body_text" not in s1
    assert "body_html" not in s1


def test_stage_no_statements_dir(tmp_path):
    _write_proc(tmp_path, 51, ["2026-02-10"])
    _write_day(tmp_path, 51, "2026-02-10", [_stmt(0, 1)])

    captured: list = []
    with patch("supagraf.stage.proceedings.supabase", return_value=_fake_client(captured)):
        report = stage_mod.stage_proceedings(term=10, fixtures_dir=tmp_path)
    assert report.records_seen == 1
    rows = [r for batch in captured for r in batch]
    s = rows[0]["payload"]["days"][0]["statements"][0]
    assert "body_text" not in s
    assert "body_html" not in s


def test_stage_payload_includes_agenda_items(tmp_path):
    (tmp_path / "49.json").write_text(json.dumps({
        "number": 49,
        "title": "P49",
        "current": False,
        "dates": ["2026-01-08"],
        "agenda": (
            '<ol><li><p>Foo (nr <a class="proc" '
            'href="http://www.sejm.gov.pl/sejm10.nsf/PrzebiegProc.xsp?nr=42">'
            '42 i 100</a>).</p></li></ol>'
        ),
    }), encoding="utf-8")
    _write_day(tmp_path, 49, "2026-01-08", [])

    captured: list = []
    with patch("supagraf.stage.proceedings.supabase", return_value=_fake_client(captured)):
        report = stage_mod.stage_proceedings(term=10, fixtures_dir=tmp_path)
    assert report.records_seen == 1
    rows = [r for batch in captured for r in batch]
    payload = rows[0]["payload"]
    assert "agenda_items" in payload
    items = payload["agenda_items"]
    assert len(items) == 1
    it = items[0]
    assert it["ord"] == 1
    assert it["process_refs"] == ["42"]
    assert it["print_refs"] == ["42", "100"]
    assert "Foo" in it["title"]


def test_stage_skips_underscore_files(tmp_path):
    (tmp_path / "_list.json").write_text("{}", encoding="utf-8")
    (tmp_path / "_index.json").write_text("{}", encoding="utf-8")
    _write_proc(tmp_path, 49, ["2026-01-08"])
    _write_day(tmp_path, 49, "2026-01-08", [])

    captured: list = []
    with patch("supagraf.stage.proceedings.supabase", return_value=_fake_client(captured)):
        report = stage_mod.stage_proceedings(term=10, fixtures_dir=tmp_path)
    assert report.records_seen == 1
