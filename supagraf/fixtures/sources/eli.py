"""ELI (acts) capture under api.sejm.gov.pl/eli."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from loguru import logger

from ..client import SejmClient
from ..storage import update_index, write_binary, write_json
from .sejm import _maybe_save_binary, _maybe_save_json, _take


async def capture_eli(
    client: SejmClient,
    out_root: Path,
    year: int,
    publishers: list[str],
    refresh: bool,
    no_binaries: bool,
    limit: Optional[int],
) -> list[str]:
    """For each (publisher, year) walk the acts list, save each act detail + PDF."""
    captured: list[str] = []
    for publisher in publishers:
        dest_dir = out_root / "eli" / publisher / str(year)
        listing = await client.get_json(f"/eli/acts/{publisher}/{year}")
        if listing is None:
            logger.warning("no acts for {} {}", publisher, year)
            continue
        # Listing may be {items: [...]} or a flat list
        items = listing.get("items") if isinstance(listing, dict) else listing
        if not isinstance(items, list):
            logger.warning("unexpected ELI listing shape for {} {}", publisher, year)
            continue
        write_json(dest_dir / "_list.json", listing)
        keep = items if limit is None else items[:limit]
        ids: list[str] = []
        for act in keep:
            pos = act.get("pos") or act.get("position")
            if pos is None:
                continue
            sid = f"{publisher}_{year}_{pos}"
            ids.append(str(pos))
            await _maybe_save_json(
                client,
                f"/eli/acts/{publisher}/{year}/{pos}",
                dest_dir / f"{pos}.json",
                refresh,
            )
            if not no_binaries and _take(f"eli_{publisher}"):
                for tail in ("text.pdf", "T/D.pdf"):
                    ok = await _maybe_save_binary(
                        client,
                        f"/eli/acts/{publisher}/{year}/{pos}/{tail}",
                        dest_dir / f"{pos}.pdf",
                        refresh,
                    )
                    if ok:
                        break
            captured.append(sid)
        update_index(dest_dir / "_index.json", ids)
    return captured
