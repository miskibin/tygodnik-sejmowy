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

    @property
    def not_(self):
        # production code uses `.is_(...).not_.is_(...)` for embed pending
        return self

    def gte(self, *_a, **_k):
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
    """Patch every runner imported by _runner_for. Returns dict of mocks."""
    with patch("supagraf.enrich.print_summary.summarize_print") as summary, \
         patch("supagraf.enrich.print_stance.classify_stance") as stance, \
         patch("supagraf.enrich.print_mentions.extract_mentions") as mentions, \
         patch("supagraf.enrich.print_personas.tag_personas") as personas, \
         patch("supagraf.enrich.print_action.suggest_print_action") as action, \
         patch("supagraf.enrich.print_plain_polish.summarize_plain_polish") as plain_polish, \
         patch("supagraf.enrich.print_impact.assess_impact") as impact, \
         patch("supagraf.enrich.embed_print.embed_print") as embed:
        yield {
            "summary": summary, "stance": stance, "mentions": mentions,
            "personas": personas, "action": action,
            "plain_polish": plain_polish, "impact": impact, "embed": embed,
        }


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
        term=10,
    )
    assert "ok=1" in result.output


# ---- attachment resolution ------------------------------------------------

def test_no_pdf_attachment_skipped(fake_runners, fake_path_exists):
    # .html attachment is neither .pdf nor .docx → not picked → runner skipped.
    rows = [_row("9999", [{"filename": "doc.html", "ordinal": 0}])]
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
        term=10,
    )
    assert "ok=1" in result.output


def test_attachment_prefers_docx_over_pdf(fake_runners, fake_path_exists):
    # CLI prefers .docx (clean editable source) over .pdf (signed scan).
    rows = [_row("123", [
        {"filename": "extra.docx", "ordinal": 0},
        {"filename": "main.pdf", "ordinal": 1},
    ])]
    chain = _SBChain(rows)
    with patch("supagraf.cli.supabase", return_value=chain):
        result = runner.invoke(app, ["enrich", "prints", "--kind", "summary"])
    assert result.exit_code == 0
    args = fake_runners["summary"].call_args.kwargs
    assert args["pdf_relpath"] == "sejm/prints/123__extra.docx"


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

def test_kind_all_runs_all_runners(fake_runners, fake_path_exists):
    # Each kind's query returns 1 row; every runner in EnrichKind.all should fire once.
    rows = [_row("2055-A", [_pdf_att("2055-A.pdf")])]
    chain = _SBChain(rows)
    with patch("supagraf.cli.supabase", return_value=chain):
        result = runner.invoke(app, ["enrich", "prints", "--kind", "all"])
    assert result.exit_code == 0
    for k in ("summary", "stance", "mentions", "personas",
              "action", "plain_polish", "impact", "embed"):
        fake_runners[k].assert_called_once()


def test_kind_all_uses_correct_pending_columns(fake_runners, fake_path_exists):
    chain = _SBChain([])
    with patch("supagraf.cli.supabase", return_value=chain):
        result = runner.invoke(app, ["enrich", "prints", "--kind", "all"])
    assert result.exit_code == 0
    # Each kind hits is_(...) on its pending column.
    cols = [c[0] for c in chain.is_calls]
    for col in ("summary", "stance", "mentions_extracted_at",
                "persona_tags", "citizen_action_model", "summary_plain",
                "impact_punch", "embedded_at"):
        assert col in cols, f"missing pending column {col!r} in {cols}"


# ---- empty term -----------------------------------------------------------

def test_empty_term_no_prints(fake_runners, fake_path_exists):
    chain = _SBChain([])
    with patch("supagraf.cli.supabase", return_value=chain):
        result = runner.invoke(app, ["enrich", "prints", "--kind", "summary", "--term", "99"])
    assert result.exit_code == 0
    assert "ok=0" in result.output
    assert "failed=0" in result.output


def test_resolve_relpath_strips_whitespace_in_number():
    """Upstream ships a few numbers with a trailing newline; unstripped they
    reach the fetch layer and httpx rejects the URL."""
    from supagraf.cli import _resolve_pdf_relpath

    rp = _resolve_pdf_relpath(_row("1041-004\n", [_pdf_att("1041-004.pdf")]))
    assert rp == "sejm/prints/1041-004__1041-004.pdf"


def test_resolve_relpath_skips_guid_numbered_prints():
    """4 term-10 prints are keyed by a Domino GUID; api.sejm.gov.pl has no
    /prints/<guid>/ path, so there is nothing to enrich."""
    from supagraf.cli import _resolve_pdf_relpath

    row = _row("3D10FECA9709FEFEC1258CD8004D1770", [_pdf_att("997-s.pdf")])
    assert _resolve_pdf_relpath(row) is None


def test_fetch_outage_aborts_the_phase(monkeypatch):
    """When api.sejm.gov.pl's document backend is down every attachment 502s
    after a 60s hang. Grinding through hundreds of prints that way wastes
    hours and enriches nothing — bail out and leave them pending."""
    from supagraf import cli
    from supagraf.enrich.pdf_fetch import PdfFetchError

    monkeypatch.setattr(cli, "_FETCH_OUTAGE_THRESHOLD", 3)

    attempts = []

    def boom(**kwargs):
        attempts.append(kwargs["entity_id"])
        raise PdfFetchError("failed to fetch ...: ReadTimeout")

    monkeypatch.setattr(cli, "_runner_for", lambda kind: boom)

    rows = [_row(str(n), [_pdf_att(f"{n}.pdf")]) for n in range(20)]
    ok, failed, skipped = cli._run_kind_for_prints(cli.EnrichKind.unified, rows)

    assert len(attempts) == 3, "should stop at the threshold, not walk all 20"
    assert ok == 0


def test_isolated_fetch_failures_do_not_abort(monkeypatch):
    """A run where fetches fail intermittently must still process everything."""
    from supagraf import cli
    from supagraf.enrich.pdf_fetch import PdfFetchError

    monkeypatch.setattr(cli, "_FETCH_OUTAGE_THRESHOLD", 3)

    seen = []

    def flaky(**kwargs):
        seen.append(kwargs["entity_id"])
        if int(kwargs["entity_id"]) % 2:
            raise PdfFetchError("failed to fetch ...: ReadTimeout")

    monkeypatch.setattr(cli, "_runner_for", lambda kind: flaky)

    rows = [_row(str(n), [_pdf_att(f"{n}.pdf")]) for n in range(10)]
    ok, failed, skipped = cli._run_kind_for_prints(cli.EnrichKind.unified, rows)

    assert len(seen) == 10
    assert ok == 5 and failed == 5
