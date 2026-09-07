"""Unit tests for the agenda HTML parser."""
from __future__ import annotations

from pathlib import Path

from supagraf.stage.agenda_parser import parse_agenda

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES = REPO_ROOT / "fixtures" / "sejm" / "proceedings"


def test_empty_returns_empty():
    assert parse_agenda("") == []
    assert parse_agenda("<p>nothing</p>") == []


def test_simple_single_item():
    html = (
        '<ol><li><p>X (nr <a class="proc" '
        'href="http://www.sejm.gov.pl/sejm10.nsf/PrzebiegProc.xsp?nr=99">99</a>'
        ').</p></li></ol>'
    )
    items = parse_agenda(html)
    assert len(items) == 1
    it = items[0]
    assert it.ord == 1
    assert "X (nr 99)." in it.title
    assert it.process_refs == ["99"]
    assert it.print_refs == ["99"]
    assert "<li>" in it.raw_html and "</li>" in it.raw_html


def test_anchor_text_with_polish_i_separator():
    html = (
        '<ol><li><p>foo <a class="proc" '
        'href="http://x?nr=1529">1529 i 2044</a></p></li></ol>'
    )
    items = parse_agenda(html)
    assert items[0].process_refs == ["1529"]
    assert items[0].print_refs == ["1529", "2044"]


def test_anchor_text_with_commas_and_alphanumeric():
    html = (
        '<ol><li><p><a class="proc" '
        'href="http://x?nr=2027">2027, 2087 i 2087-A</a></p></li></ol>'
    )
    items = parse_agenda(html)
    assert items[0].process_refs == ["2027"]
    assert items[0].print_refs == ["2027", "2087", "2087-A"]


def test_value_attr_present_but_position_used():
    html = '<ol><li value="3"><div>X <a class="proc" href="?nr=1">1</a></div></li></ol>'
    items = parse_agenda(html)
    assert items[0].ord == 1


def test_two_anchors_same_li_dedup_processes():
    html = (
        '<ol><li value="1"><div>'
        '<a class="proc" href="?nr=2294">2294</a> i '
        '<a class="proc" href="?nr=2294">2399</a>'
        '</div></li></ol>'
    )
    items = parse_agenda(html)
    assert items[0].process_refs == ["2294"]
    assert items[0].print_refs == ["2294", "2399"]


def test_alphanumeric_print_kept():
    html = '<ol><li><p><a class="proc" href="?nr=1">2087-A</a></p></li></ol>'
    items = parse_agenda(html)
    assert items[0].print_refs == ["2087-A"]


def test_alphanumeric_process_id_kept():
    html = '<ol><li><p><a class="proc" href="?nr=17719-z">99</a></p></li></ol>'
    items = parse_agenda(html)
    assert items[0].process_refs == ["17719-z"]
    assert items[0].print_refs == ["99"]


def test_html_entities_unescaped_in_title():
    html = '<ol><li><p>spo&oacute;r &amp; t</p></li></ol>'
    items = parse_agenda(html)
    assert "spoór & t" in items[0].title


def test_div_wrapper_56_pattern_captured():
    html = (
        '<ol><li value="2"><div>'
        '<strong>Spr</strong> nr <a class="proc" href="?nr=2352">2352</a>.'
        '</div></li></ol>'
    )
    items = parse_agenda(html)
    assert items[0].process_refs == ["2352"]
    assert "Spr nr 2352." in items[0].title
