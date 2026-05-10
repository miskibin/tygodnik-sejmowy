"""Typer CLI: `python -m supagraf fixtures capture <resource>`."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Optional

import typer
from loguru import logger

from .client import SejmClient
from .sources import disclosures, eli as eli_src, external as external_src, sejm as sejm_src
from .storage import fixtures_root


app = typer.Typer(
    no_args_is_help=True,
    add_completion=False,
    help="Capture Sejm + ELI fixtures to ./fixtures/.",
)


def _common(
    out: Optional[Path], term: int, year: int, concurrency: int
) -> tuple[Path, int, int, int]:
    out_root = out or fixtures_root()
    out_root.mkdir(parents=True, exist_ok=True)
    return out_root, term, year, concurrency


def _run(coro):
    return asyncio.run(coro)


@app.command()
def mps(
    out: Optional[Path] = typer.Option(None, help="Output root (defaults to ./fixtures)"),
    term: int = 10,
    concurrency: int = 5,
    refresh: bool = False,
    no_binaries: bool = False,
    limit: Optional[int] = None,
):
    out_root, term, _, c = _common(out, term, 2026, concurrency)

    async def go():
        async with SejmClient(concurrency=c) as client:
            ids = await sejm_src.capture_mps(
                client, out_root, term, refresh, no_binaries, limit
            )
            logger.info("captured {} MPs", len(ids))

    _run(go())


@app.command()
def clubs(
    out: Optional[Path] = None,
    term: int = 10,
    concurrency: int = 5,
    refresh: bool = False,
    no_binaries: bool = False,
    limit: Optional[int] = None,
):
    out_root, term, _, c = _common(out, term, 2026, concurrency)

    async def go():
        async with SejmClient(concurrency=c) as client:
            ids = await sejm_src.capture_clubs(
                client, out_root, term, refresh, no_binaries, limit
            )
            logger.info("captured {} clubs", len(ids))

    _run(go())


@app.command()
def committees(
    out: Optional[Path] = None,
    term: int = 10,
    year: int = 2026,
    concurrency: int = 5,
    refresh: bool = False,
    no_binaries: bool = False,
    limit: Optional[int] = None,
):
    out_root, term, year, c = _common(out, term, year, concurrency)

    async def go():
        async with SejmClient(concurrency=c) as client:
            ids = await sejm_src.capture_committees(
                client, out_root, term, year, refresh, no_binaries, limit
            )
            logger.info("captured {} committees", len(ids))

    _run(go())


@app.command()
def proceedings(
    out: Optional[Path] = None,
    term: int = 10,
    year: int = 2026,
    concurrency: int = 5,
    refresh: bool = False,
    no_binaries: bool = False,
    limit: Optional[int] = None,
):
    out_root, term, year, c = _common(out, term, year, concurrency)

    async def go():
        async with SejmClient(concurrency=c) as client:
            ids = await sejm_src.capture_proceedings(
                client, out_root, term, year, refresh, no_binaries, limit
            )
            logger.info("captured {} proceedings", len(ids))

    _run(go())


@app.command()
def votings(
    out: Optional[Path] = None,
    term: int = 10,
    year: int = 2026,
    concurrency: int = 5,
    refresh: bool = False,
    no_binaries: bool = False,
    limit: Optional[int] = None,
):
    out_root, term, year, c = _common(out, term, year, concurrency)

    async def go():
        async with SejmClient(concurrency=c) as client:
            ids = await sejm_src.capture_votings(
                client, out_root, term, year, refresh, no_binaries, limit
            )
            logger.info("captured {} votings", len(ids))

    _run(go())


@app.command()
def prints(
    out: Optional[Path] = None,
    term: int = 10,
    year: int = 2026,
    concurrency: int = 5,
    refresh: bool = False,
    no_binaries: bool = False,
    limit: Optional[int] = None,
):
    out_root, term, year, c = _common(out, term, year, concurrency)

    async def go():
        async with SejmClient(concurrency=c) as client:
            ids = await sejm_src.capture_prints(
                client, out_root, term, year, refresh, no_binaries, limit
            )
            logger.info("captured {} prints", len(ids))

    _run(go())


@app.command()
def processes(
    out: Optional[Path] = None,
    term: int = 10,
    year: int = 2026,
    concurrency: int = 5,
    refresh: bool = False,
    no_binaries: bool = False,
    limit: Optional[int] = None,
):
    out_root, term, year, c = _common(out, term, year, concurrency)

    async def go():
        async with SejmClient(concurrency=c) as client:
            ids = await sejm_src.capture_processes(
                client, out_root, term, year, refresh, no_binaries, limit
            )
            logger.info("captured {} processes", len(ids))

    _run(go())


@app.command()
def bills(
    out: Optional[Path] = None,
    term: int = 10,
    year: int = 2026,
    concurrency: int = 5,
    refresh: bool = False,
    limit: Optional[int] = None,
):
    out_root, term, year, c = _common(out, term, year, concurrency)

    async def go():
        async with SejmClient(concurrency=c) as client:
            ids = await sejm_src.capture_bills(
                client, out_root, term, year, refresh, limit
            )
            logger.info("captured {} bills", len(ids))

    _run(go())


@app.command()
def interpellations(
    out: Optional[Path] = None,
    term: int = 10,
    year: int = 2026,
    concurrency: int = 5,
    refresh: bool = False,
    no_binaries: bool = False,
    limit: Optional[int] = None,
):
    out_root, term, year, c = _common(out, term, year, concurrency)

    async def go():
        async with SejmClient(concurrency=c) as client:
            ids = await sejm_src.capture_interpellations(
                client, out_root, term, year, refresh, no_binaries, limit
            )
            logger.info("captured {} interpellations", len(ids))

    _run(go())


@app.command("written-questions")
def written_questions(
    out: Optional[Path] = None,
    term: int = 10,
    year: int = 2026,
    concurrency: int = 5,
    refresh: bool = False,
    no_binaries: bool = False,
    limit: Optional[int] = None,
):
    out_root, term, year, c = _common(out, term, year, concurrency)

    async def go():
        async with SejmClient(concurrency=c) as client:
            ids = await sejm_src.capture_written_questions(
                client, out_root, term, year, refresh, no_binaries, limit
            )
            logger.info("captured {} writtenQuestions", len(ids))

    _run(go())


@app.command()
def videos(
    out: Optional[Path] = None,
    term: int = 10,
    year: int = 2026,
    concurrency: int = 5,
    refresh: bool = False,
    limit: Optional[int] = None,
):
    out_root, term, year, c = _common(out, term, year, concurrency)

    async def go():
        async with SejmClient(concurrency=c) as client:
            ids = await sejm_src.capture_videos(
                client, out_root, term, year, refresh, limit
            )
            logger.info("captured {} videos", len(ids))

    _run(go())


@app.command()
def eli(
    out: Optional[Path] = None,
    year: int = 2026,
    publishers: str = "DU,MP",
    concurrency: int = 5,
    refresh: bool = False,
    no_binaries: bool = False,
    limit: Optional[int] = None,
    binary_cap: int = 5,
):
    out_root, _, year, c = _common(out, 10, year, concurrency)
    pubs = [p.strip() for p in publishers.split(",") if p.strip()]
    sejm_src.set_binary_budget({f"eli_{p}": binary_cap for p in pubs})

    async def go():
        async with SejmClient(concurrency=c) as client:
            ids = await eli_src.capture_eli(
                client, out_root, year, pubs, refresh, no_binaries, limit
            )
            logger.info("captured {} ELI acts", len(ids))

    _run(go())


@app.command()
def disclosures_stub(out: Optional[Path] = None):
    """Placeholder — see disclosures.py docstring."""
    out_root = out or fixtures_root()
    disclosures.capture_disclosures_stub(out_root)
    logger.info("wrote disclosures placeholder at {}", out_root / "disclosures")


@app.command()
def districts(out: Optional[Path] = None, term: int = 10):
    """Write all 41 PKW electoral district JSONs to fixtures/external/districts/."""
    out_root = out or fixtures_root()
    n = external_src.prepare_districts_fixtures(out_root, term=term)
    logger.info("wrote {} districts (term={})", n, term)


@app.command("promises")
def promises(out: Optional[Path] = None):
    """Write all seeded promise corpora to fixtures/external/promises/.

    Currently seeded:
      KO    -- 100 konkretow (100konkretow.pl)
      P2050 -- 12 gwarancji Trzeciej Drogi (psl.pl/12gwarancji)
      L     -- Lewica programme, first 30 of 155 (lewica.org.pl/program)

    Status defaults to 'in_progress'; reviewers update via the database after
    matcher candidates are confirmed.
    """
    out_root = out or fixtures_root()
    counts = external_src.prepare_all_promises_fixtures(out_root)
    logger.info("wrote promise fixtures: {}", counts)


@app.command()
def postcodes(
    csv_path: Path = typer.Argument(..., help="CSV with columns: postcode,district_num,commune_teryt"),
    out: Optional[Path] = None,
    term: int = 10,
):
    """Convert a postcode->district CSV to per-row JSON fixtures.

    Public source: compose PKW gmina-per-district lists with GUS TERYT
    postcode->gmina mappings. Polish postal system has ~24k postcodes;
    this command will write that many JSON files.
    """
    out_root = out or fixtures_root()
    n = external_src.prepare_postcodes_from_csv(csv_path, out_root, term=term)
    logger.info("wrote {} postcode fixtures (term={})", n, term)


@app.command(name="all")
def capture_all(
    out: Optional[Path] = None,
    term: int = 10,
    year: int = 2026,
    concurrency: int = 5,
    refresh: bool = False,
    no_binaries: bool = False,
    limit: Optional[int] = None,
    binary_cap: int = 5,
):
    """Run every resource sequentially.

    `--binary-cap N` limits how many large binaries (PDFs, transcripts,
    attachments) are downloaded per resource. Small binaries (MP photos,
    club logos, voting result PDFs) are unaffected.
    """
    out_root, term, year, c = _common(out, term, year, concurrency)

    sejm_src.set_binary_budget(
        {
            "committees_transcripts": binary_cap,
            "proceedings_transcripts": binary_cap,
            "prints": binary_cap,
            "processes": binary_cap,
            "qa_interpellations": binary_cap,
            "qa_writtenQuestions": binary_cap,
            "eli_DU": binary_cap,
            "eli_MP": binary_cap,
        }
    )

    async def go():
        async with SejmClient(concurrency=c) as client:
            for name, coro_factory in [
                ("mps", lambda: sejm_src.capture_mps(client, out_root, term, refresh, no_binaries, limit)),
                ("clubs", lambda: sejm_src.capture_clubs(client, out_root, term, refresh, no_binaries, limit)),
                ("committees", lambda: sejm_src.capture_committees(client, out_root, term, year, refresh, no_binaries, limit)),
                ("proceedings", lambda: sejm_src.capture_proceedings(client, out_root, term, year, refresh, no_binaries, limit)),
                ("votings", lambda: sejm_src.capture_votings(client, out_root, term, year, refresh, no_binaries, limit)),
                ("prints", lambda: sejm_src.capture_prints(client, out_root, term, year, refresh, no_binaries, limit)),
                ("processes", lambda: sejm_src.capture_processes(client, out_root, term, year, refresh, no_binaries, limit)),
                ("bills", lambda: sejm_src.capture_bills(client, out_root, term, year, refresh, limit)),
                ("interpellations", lambda: sejm_src.capture_interpellations(client, out_root, term, year, refresh, no_binaries, limit)),
                ("written-questions", lambda: sejm_src.capture_written_questions(client, out_root, term, year, refresh, no_binaries, limit)),
                ("videos", lambda: sejm_src.capture_videos(client, out_root, term, year, refresh, limit)),
                ("eli", lambda: eli_src.capture_eli(client, out_root, year, ["DU", "MP"], refresh, no_binaries, limit)),
            ]:
                logger.info("=== {} ===", name)
                try:
                    ids = await coro_factory()
                    logger.info("{}: {} captured", name, len(ids))
                except Exception as e:
                    logger.exception("{} FAILED: {}", name, e)
        disclosures.capture_disclosures_stub(out_root)

    _run(go())


if __name__ == "__main__":
    app()
