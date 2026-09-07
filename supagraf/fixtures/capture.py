"""Typer CLI: `python -m supagraf fixtures <districts|promises|postcodes>` — the
external (non-API) sources still curated as JSON files. Sejm/ELI data goes
through `sync`."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Optional

import typer
from loguru import logger

from .sources import external as external_src
from .storage import fixtures_root


app = typer.Typer(
    no_args_is_help=True,
    add_completion=False,
    help="Write external-source fixtures (districts, promises, postcodes) to ./fixtures/.",
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
