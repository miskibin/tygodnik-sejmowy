"""Unit tests for `supagraf enrich prints` CLI subcommand.

All side-effects mocked: supabase() chain, runner functions (summarize_print
etc.), fixtures_root + Path.exists. Verifies query filtering, attachment
resolution, failure isolation (per-print exception → continue), --limit
plumbing, and exit codes — without touching network or disk.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from typer.testing import CliRunner

from supagraf.cli import app


runner = CliRunner()


def _row(number: str, attachments: list[dict] | None = None) -> dict:
    return {"id": hash(number) & 0xFFFF, "number": number, "attachments": attachments or []}


def _pdf_att(name: str, ordinal: int = 0) -> dict:
    return {"filename": name, "ordinal": ordinal}


class _SBChain:
    """Minimal supabase().table().select().eq().is_().limit().execute() mock.

    Each method returns self so the chain resolves. .execute() returns an
    object with `.data` set by the test. Tracks .limit() calls for assertion.
    """

    def __init__(self, data: list[dict]):
        self._data = data
        self.limit_called_with: int | None = None
        self.eq_calls: list[tuple] = []
        self.is_calls: list[tuple] = []

    def table(self, *_a, **_k): return self
    def select(self, *_a, **_k): return self

    def eq(self, col, val):
        self.eq_calls.append((col, val))
        return self

    def is_(self, col, val):
        self.is_calls.append((col, val))
        return self

    def limit(self, n):
        self.limit_called_with = n
        return self

    def execute(self):
        out = MagicMock()
        out.data = self._data
        return out


@pytest.fixture
def fake_runners():
    """Patch the four runner imports inside _runner_for. Returns dict of mocks."""
    with patch("supagraf.enrich.print_summary.summarize_print") as summary, \
         patch("supagraf.enrich.print_stance.classify_stance") as stance, \
         patch("supagraf.enrich.print_mentions.extract_mentions") as mentions, \
         patch("supagraf.enrich.embed_print.embed_print") as embed:
        yield {"summary": summary, "stance": stance, "mentions": mentions, "embed": embed}


@pytest.fixture
def fake_path_exists():
    """Default: every fixtures path exists. Tests can override via .return_value."""
    with patch("supagraf.cli.fixtures_root") as fr:
        fr.return_value = Path("/tmp/fixtures")
        with patch.object(Path, "exists", return_value=True) as ex:
            yield ex


# ---- enum validation ------------------------------------------------------

def test_unknown_kind_rejected_by_typer_enum():
    """Typer rejects invalid --kind value with exit code 2 (usage error)."""
    result = runner.invoke(app, ["enrich", "prints", "--kind", "bogus"])
    assert result.exit_code == 2


# ---- pending query --------------------------------------------------------

def test_no_pending_prints_exits_zero(fake_runners, fake_path_exists):
    chain = _SBChain([])
    with patch("supagraf.cli.supabase", return_value=chain):
        result = runner.invoke(app, ["enrich", "prints", "--kind", "summary"])
    assert result.exit_code == 0
    assert ("summary", "null") in chain.is_calls
    assert ("term", 10) in chain.eq_calls
    fake_runners["summary"].assert_not_called()


def test_term_filter_propagated(fake_runners, fake_path_exists):
    chain = _SBChain([])
    with patch("supagraf.cli.supabase", return_value=chain):
        result = runner.invoke(app, ["enrich", "prints", "--kind", "summary", "--term", "9"])
    assert result.exit_code == 0
    assert ("term", 9) in chain.eq_calls


# ---- happy path -----------------------------------------------------------

def test_single_print_happy_path(fake_runners, fake_path_exists):
    rows = [_row("2055-A", [_pdf_att("2055-A.pdf", 0)])]
    chain = _SBChain(rows)
    with patch("supagraf.cli.supabase", return_value=chain):
        result = runner.invoke(app, ["enrich", "prints", "--kind", "summary"])
    assert result.exit_code == 0
    fake_runners["summary"].assert_called_once_with(
        entity_type="print",
        entity_id="2055-A",
        pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
    )
    assert "ok=1" in result.output


# ---- attachment resolution ------------------------------------------------

def test_no_pdf_attachment_skipped(fake_runners, fake_path_exists):
    rows = [_row("9999", [{"filename": "doc.docx", "ordinal": 0}])]
    chain = _SBChain(rows)
    with patch("supagraf.cli.supabase", return_value=chain):
        result = runner.invoke(app, ["enrich", "prints", "--kind", "summary"])
    assert result.exit_code == 0
    fake_runners["summary"].assert_not_called()
    assert "skipped=1" in result.output


def test_pdf_missing_on_disk_still_invokes_runner():
    """Old behaviour skipped runners when PDF was absent. New behaviour
    delegates fetching to the runner (via supagraf.enrich.pdf_fetch), so the
    CLI no longer pre-checks disk presence — it lets the runner attempt the
    fetch and surface failures via the @with_model_run path."""
    fr = {
        "summary": MagicMock(return_value=None),
    }
    rows = [_row("2055-A", [_pdf_att("2055-A.pdf", 0)])]
    chain = _SBChain(rows)
    with patch("supagraf.cli._runner_for", side_effect=lambda k: fr[k.value]), \
         patch("supagraf.cli.supabase", return_value=chain):
        result = runner.invoke(app, ["enrich", "prints", "--kind", "summary"])
    assert result.exit_code == 0
    fr["summary"].assert_called_once_with(
        entity_type="print",
        entity_id="2055-A",
        pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
    )
    assert "ok=1" in result.output


def test_attachment_ordinal_picks_first_pdf(fake_runners, fake_path_exists):
    # Ordinal 0 = docx (skipped), ordinal 1 = pdf (used). Confirms we don't
    # bail at the first non-pdf — we keep scanning by ordinal.
    rows = [_row("123", [
        {"filename": "extra.docx", "ordinal": 0},
        {"filename": "main.pdf", "ordinal": 1},
    ])]
    chain = _SBChain(rows)
    with patch("supagraf.cli.supabase", return_value=chain):
        result = runner.invoke(app, ["enrich", "prints", "--kind", "summary"])
    assert result.exit_code == 0
    args = fake_runners["summary"].call_args.kwargs
    assert args["pdf_relpath"] == "sejm/prints/123__main.pdf"


# ---- failure isolation ----------------------------------------------------

def test_runner_raises_one_continues_others(fake_runners, fake_path_exists):
    rows = [
        _row("a", [_pdf_att("a.pdf")]),
        _row("b", [_pdf_att("b.pdf")]),
        _row("c", [_pdf_att("c.pdf")]),
    ]
    # Second call raises — first and third should still run.
    fake_runners["summary"].side_effect = [None, RuntimeError("boom"), None]
    chain = _SBChain(rows)
    with patch("supagraf.cli.supabase", return_value=chain):
        result = runner.invoke(app, ["enrich", "prints", "--kind", "summary"])
    assert result.exit_code == 3   # any failure → exit 3
    assert fake_runners["summary"].call_count == 3
    assert "ok=2" in result.output
    assert "failed=1" in result.output


# ---- --limit cap ----------------------------------------------------------

def test_limit_passed_to_query(fake_runners, fake_path_exists):
    chain = _SBChain([_row(str(i), [_pdf_att(f"{i}.pdf")]) for i in range(5)])
    with patch("supagraf.cli.supabase", return_value=chain):
        result = runner.invoke(app, ["enrich", "prints", "--kind", "summary", "--limit", "5"])
    assert result.exit_code == 0
    assert chain.limit_called_with == 5
    assert fake_runners["summary"].call_count == 5


# ---- --kind all -----------------------------------------------------------

def test_kind_all_runs_all_four_runners(fake_runners, fake_path_exists):
    # Each kind's query returns 1 row; all four runners should fire once.
    rows = [_row("2055-A", [_pdf_att("2055-A.pdf")])]
    chain = _SBChain(rows)
    with patch("supagraf.cli.supabase", return_value=chain):
        result = runner.invoke(app, ["enrich", "prints", "--kind", "all"])
    assert result.exit_code == 0
    fake_runners["summary"].assert_called_once()
    fake_runners["stance"].assert_called_once()
    fake_runners["mentions"].assert_called_once()
    fake_runners["embed"].assert_called_once()


def test_kind_all_uses_correct_pending_columns(fake_runners, fake_path_exists):
    chain = _SBChain([])
    with patch("supagraf.cli.supabase", return_value=chain):
        result = runner.invoke(app, ["enrich", "prints", "--kind", "all"])
    assert result.exit_code == 0
    # Each kind hits one is_(...) call.
    cols = [c[0] for c in chain.is_calls]
    assert "summary" in cols
    assert "stance" in cols
    assert "mentions_extracted_at" in cols
    assert "embedded_at" in cols


# ---- empty term -----------------------------------------------------------

def test_empty_term_no_prints(fake_runners, fake_path_exists):
    chain = _SBChain([])
    with patch("supagraf.cli.supabase", return_value=chain):
        result = runner.invoke(app, ["enrich", "prints", "--kind", "summary", "--term", "99"])
    assert result.exit_code == 0
    assert "ok=0" in result.output
    assert "failed=0" in result.output
