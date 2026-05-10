"""Build a real postcode->Sejm-district CSV from public sources.

Polish Sejm electoral districts (41 for term 10) don't ship as a
postcode-keyed CSV anywhere public. We compose two CC0/MIT/Apache-2.0
public datasets:

  1. mberezinski/kody-pocztowe-geo (MIT) -- Polish postcodes with
     lat/long, derived from Poczta Polska's public list.
     ~22k unique postcodes.

  2. Konstantysz/voting-optimizer (derived from GeoElections Poland 1.0
     on figshare; Apache-2.0) -- 41 Sejm district polygons as GeoJSON
     with id == district_num.

A point-in-polygon spatial join produces postcode -> district_num. Cost:
~1 MB GeoJSON + 3.4 MB CSV downloaded once, run takes seconds. Result
goes through the existing capture entry point (`fixtures.capture
postcodes <csv>`).

Run:
    PYTHONIOENCODING=utf-8 uv run --with shapely \\
        python -m supagraf.fixtures.sources.postcodes <out_csv>

The shapely dep is a one-shot via `uv run --with`; not added to
project deps.
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from typing import Optional

import httpx
import typer
from loguru import logger

KODY_URL = "https://raw.githubusercontent.com/mberezinski/kody-pocztowe-geo/master/kod-pocztowe-geo.csv"
GEOJSON_URL = "https://raw.githubusercontent.com/Konstantysz/voting-optimizer/master/data-raw/geoelections/sejm-complete-41.json"


def _download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        logger.info("cached: {}", dest)
        return
    logger.info("downloading {}", url)
    with httpx.Client(timeout=60.0, follow_redirects=True) as c:
        r = c.get(url)
        r.raise_for_status()
        dest.write_bytes(r.content)
    logger.info("wrote {} bytes -> {}", dest.stat().st_size, dest)


def build_postcodes_csv(out_csv: Path, cache_dir: Optional[Path] = None) -> int:
    """Download both sources, spatial-join, write postcode CSV."""
    try:
        from shapely.geometry import Point, shape  # type: ignore[import-not-found]
        from shapely.strtree import STRtree  # type: ignore[import-not-found]
    except ImportError as e:
        raise SystemExit(
            "shapely required: re-run via `uv run --with shapely python -m "
            "supagraf.fixtures.sources.postcodes <out>`"
        ) from e

    cache = cache_dir or out_csv.parent
    cache.mkdir(parents=True, exist_ok=True)
    kody_path = cache / "_kody-pocztowe-geo.csv"
    geo_path = cache / "_sejm-complete-41.json"
    _download(KODY_URL, kody_path)
    _download(GEOJSON_URL, geo_path)

    geo = json.loads(geo_path.read_text(encoding="utf-8"))
    polygons: list[tuple] = []
    geoms = []
    for f in geo["features"]:
        g = shape(f["geometry"])
        d = int(f["properties"]["id"])
        polygons.append((g, d))
        geoms.append(g)
    tree = STRtree(geoms)

    matched = 0
    unmatched = 0
    seen: set[str] = set()
    rows_out: list[tuple[str, int]] = []

    with kody_path.open("r", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            pc = (row.get("PostCode") or "").strip()
            if not pc or pc in seen:
                continue
            try:
                lon = float(row["Longitude"])
                lat = float(row["Latitude"])
            except (TypeError, ValueError):
                continue
            pt = Point(lon, lat)
            district_num: Optional[int] = None
            for i in tree.query(pt):
                geom, d = polygons[i]
                if geom.contains(pt) or geom.intersects(pt):
                    district_num = d
                    break
            if district_num is None:
                unmatched += 1
                continue
            seen.add(pc)
            rows_out.append((pc, district_num))
            matched += 1

    rows_out.sort()
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["postcode", "district_num", "commune_teryt"])
        for pc, d in rows_out:
            w.writerow([pc, d, ""])

    logger.info("matched={} unmatched={} -> {}", matched, unmatched, out_csv)
    return matched


app = typer.Typer(no_args_is_help=True, add_completion=False)


@app.command()
def main(
    out: Path = typer.Argument(..., help="Output CSV path"),
    cache: Optional[Path] = typer.Option(None, help="Cache dir for downloaded sources"),
):
    """Build postcode->district CSV from public sources."""
    n = build_postcodes_csv(out, cache_dir=cache)
    print(f"\nwrote {n} postcodes -> {out}", file=sys.stderr)


if __name__ == "__main__":
    app()
