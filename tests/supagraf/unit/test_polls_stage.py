from __future__ import annotations

import sys
import importlib.util
import types
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

pkg = types.ModuleType("supagraf")
pkg.__path__ = [str(ROOT / "supagraf")]
sys.modules["supagraf"] = pkg

_SPEC = importlib.util.spec_from_file_location("supagraf_stage_polls", ROOT / "supagraf" / "stage" / "polls.py")
assert _SPEC and _SPEC.loader
stage_mod = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(stage_mod)


def _row(html: str):
    soup = BeautifulSoup(html, "lxml")
    return soup.find("tr")


def test_extract_result_rows_maps_td_colspan_without_shifting_following_parties():
    header = _row(
        """
        <tr>
          <th>Polling firm/Link</th><th>Fieldwork date</th><th>Sample size</th>
          <th>PiS</th><th>KO</th><th>Polska 2050</th><th>PSL</th>
          <th>Lewica</th><th>Razem</th><th>Konfederacja</th><th>KKP</th>
          <th>Others</th><th>Don't know</th><th>Lead</th>
        </tr>
        """
    )
    row = _row(
        """
        <tr>
          <td>IBRiS / Polsat News</td><td data-sort-value="2025-06-14">12–14 Jun</td><td>1,000</td>
          <td>27.9</td><td>28.8</td><td colspan="2">6.9</td><td>5.6</td><td>3.1</td>
          <td>14.7</td><td>6.0</td><td></td><td>7.0</td><td>0.9</td>
        </tr>
        """
    )
    col_map = stage_mod._build_column_map(header)
    rows = stage_mod._extract_result_rows(row.find_all(["td", "th"]), col_map, poll_id=1)

    assert [(r["party_code"], r["percentage"]) for r in rows] == [
        ("PiS", 27.9),
        ("KO", 28.8),
        ("TD", 6.9),
        ("Lewica", 5.6),
        ("Razem", 3.1),
        ("Konfederacja", 14.7),
        ("KKP", 6.0),
        ("Niezdecydowani", 7.0),
    ]


def test_extract_result_rows_keeps_merged_left_value_under_lewica_not_razem():
    header = _row(
        """
        <tr>
          <th>Polling firm/Link</th><th>Fieldwork date</th><th>Sample size</th>
          <th>PiS</th><th>KO</th><th>TD</th><th>Lewica</th><th>Razem</th>
          <th>Konfederacja</th><th>PJJ</th><th>BS</th><th>Others</th>
          <th>Don't know</th><th>Lead</th>
        </tr>
        """
    )
    row = _row(
        """
        <tr>
          <td>United Surveys / WP.pl</td><td data-sort-value="2024-10-27">25–27 Oct</td><td>1,000</td>
          <td>28.0</td><td>30.0</td><td>8.5</td><td colspan="2">8.8</td>
          <td>12.5</td><td>1.0</td><td>0.5</td><td>3.0</td><td>8.0</td><td>2.0</td>
        </tr>
        """
    )
    col_map = stage_mod._build_column_map(header)
    rows = stage_mod._extract_result_rows(row.find_all(["td", "th"]), col_map, poll_id=1)
    by_code = {r["party_code"]: r["percentage"] for r in rows}

    assert by_code["Lewica"] == 8.8
    assert "Razem" not in by_code
