"""Sejm /sejm/term{N}/* capture functions.

Each public function here captures one resource group to disk and returns
a list of captured IDs (string form). Functions are independent.
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Iterable, Optional

from loguru import logger

from ..client import SejmClient
from ..filters import first_date, in_year
from ..storage import exists, update_index, write_binary, write_json, write_text


def _term_root(term: int) -> str:
    return f"/sejm/term{term}"


# Per-resource binary download budget. Configured by capture.py before each run.
# Resources not in the dict are unbounded. Zero blocks all binaries for that key.
_BINARY_BUDGET: dict[str, int] = {}


def set_binary_budget(budget: dict[str, int]) -> None:
    """Replace the global binary budget. Caller-set, mutated by _take()."""
    _BINARY_BUDGET.clear()
    _BINARY_BUDGET.update(budget)


def _take(key: str) -> bool:
    """True if a binary slot for `key` is available; consumes one if so.

    Keys not registered in the budget are unbounded.
    """
    if key not in _BINARY_BUDGET:
        return True
    if _BINARY_BUDGET[key] <= 0:
        return False
    _BINARY_BUDGET[key] -= 1
    return True


# ---------- helpers ----------

async def _maybe_save_json(
    client: SejmClient, path: str, dest: Path, refresh: bool
) -> Optional[Any]:
    if exists(dest) and not refresh:
        from ..storage import load_json

        return load_json(dest)
    data = await client.get_json(path)
    if data is None:
        return None
    write_json(dest, data)
    return data


async def _maybe_save_binary(
    client: SejmClient, path: str, dest: Path, refresh: bool
) -> bool:
    if exists(dest) and not refresh:
        return True
    data = await client.get_bytes(path)
    if data is None:
        return False
    write_binary(dest, data)
    return True


async def _maybe_save_text(
    client: SejmClient, path: str, dest: Path, refresh: bool
) -> bool:
    if exists(dest) and not refresh:
        return True
    text = await client.get_text(path)
    if text is None:
        return False
    write_text(dest, text)
    return True


async def _paginate_list(
    client: SejmClient, path: str, page_size: int = 10000
) -> list[dict]:
    """Walk `?limit=N&offset=K` until an empty page comes back.

    Sejm endpoints have an undocumented default limit (often 50). Passing
    a large `limit=` returns up to that many. We still loop with offset to
    cover endpoints capped below our requested page size.
    """
    out: list[dict] = []
    offset = 0
    while True:
        sep = "&" if "?" in path else "?"
        page = await client.get_json(f"{path}{sep}limit={page_size}&offset={offset}")
        if not isinstance(page, list) or not page:
            break
        out.extend(page)
        if len(page) < page_size:
            break
        offset += len(page)
    return out


def _safe_id(value: object) -> str:
    """Make a value safe to use as a filename component."""
    s = str(value)
    return s.replace("/", "_").replace("\\", "_").replace(":", "_")


async def _gather_limited(coros: Iterable, concurrency: int) -> list:
    sem = asyncio.Semaphore(concurrency)

    async def _wrap(c):
        async with sem:
            return await c

    return await asyncio.gather(*[_wrap(c) for c in coros])


# ---------- resources ----------

async def capture_mps(
    client: SejmClient,
    out_root: Path,
    term: int,
    refresh: bool,
    no_binaries: bool,
    limit: Optional[int],
) -> list[str]:
    """Capture all MPs for the term. MPs aren't filtered by year."""
    base = _term_root(term)
    dest_dir = out_root / "sejm" / "mps"

    list_data = await client.get_json(f"{base}/MP")
    if not isinstance(list_data, list):
        logger.error("MP list not a list")
        return []

    if limit is not None:
        list_data = list_data[:limit]
    write_json(dest_dir / "_list.json", list_data)

    captured: list[str] = []
    for mp in list_data:
        mp_id = mp.get("id")
        if mp_id is None:
            continue
        captured.append(str(mp_id))

    async def _one(mp_id: int) -> None:
        await _maybe_save_json(
            client, f"{base}/MP/{mp_id}", dest_dir / f"{mp_id}.json", refresh
        )
        await _maybe_save_json(
            client,
            f"{base}/MP/{mp_id}/votings/stats",
            dest_dir / f"{mp_id}__voting_stats.json",
            refresh,
        )
        if not no_binaries:
            await _maybe_save_binary(
                client,
                f"{base}/MP/{mp_id}/photo",
                dest_dir / f"{mp_id}__photo.jpg",
                refresh,
            )
            await _maybe_save_binary(
                client,
                f"{base}/MP/{mp_id}/photo-mini",
                dest_dir / f"{mp_id}__photo-mini.jpg",
                refresh,
            )

    await _gather_limited((_one(int(i)) for i in captured), 8)
    update_index(dest_dir / "_index.json", captured)
    return captured


async def capture_clubs(
    client: SejmClient,
    out_root: Path,
    term: int,
    refresh: bool,
    no_binaries: bool,
    limit: Optional[int],
) -> list[str]:
    base = _term_root(term)
    dest_dir = out_root / "sejm" / "clubs"

    list_data = await client.get_json(f"{base}/clubs")
    if not isinstance(list_data, list):
        return []
    if limit is not None:
        list_data = list_data[:limit]
    write_json(dest_dir / "_list.json", list_data)

    captured: list[str] = []
    for club in list_data:
        cid = club.get("id")
        if cid is None:
            continue
        captured.append(str(cid))
        await _maybe_save_json(
            client, f"{base}/clubs/{cid}", dest_dir / f"{cid}.json", refresh
        )
        if not no_binaries:
            await _maybe_save_binary(
                client,
                f"{base}/clubs/{cid}/logo",
                dest_dir / f"{cid}__logo.bin",
                refresh,
            )
    update_index(dest_dir / "_index.json", captured)
    return captured


async def capture_committees(
    client: SejmClient,
    out_root: Path,
    term: int,
    year: int,
    refresh: bool,
    no_binaries: bool,
    limit: Optional[int],
) -> list[str]:
    base = _term_root(term)
    dest_dir = out_root / "sejm" / "committees"

    list_data = await client.get_json(f"{base}/committees")
    if not isinstance(list_data, list):
        return []
    if limit is not None:
        list_data = list_data[:limit]
    write_json(dest_dir / "_list.json", list_data)

    captured: list[str] = []
    for c in list_data:
        code = c.get("code")
        if not code:
            continue
        captured.append(code)
        await _maybe_save_json(
            client, f"{base}/committees/{code}", dest_dir / f"{code}.json", refresh
        )
        sittings = await client.get_json(f"{base}/committees/{code}/sittings")
        if not isinstance(sittings, list):
            continue
        sit_dir = dest_dir / f"{code}__sittings"
        write_json(sit_dir / "_list.json", sittings)
        sit_ids = []
        for s in sittings:
            num = s.get("num")
            d = first_date(s)
            if num is None:
                continue
            if d is None or d.year != year:
                continue
            sit_ids.append(str(num))
            await _maybe_save_json(
                client,
                f"{base}/committees/{code}/sittings/{num}",
                sit_dir / f"{num}.json",
                refresh,
            )
            if not no_binaries and _take("committees_transcripts"):
                await _maybe_save_text(
                    client,
                    f"{base}/committees/{code}/sittings/{num}/html",
                    sit_dir / f"{num}.html",
                    refresh,
                )
                await _maybe_save_binary(
                    client,
                    f"{base}/committees/{code}/sittings/{num}/pdf",
                    sit_dir / f"{num}.pdf",
                    refresh,
                )
        if sit_ids:
            update_index(sit_dir / "_index.json", sit_ids)
    update_index(dest_dir / "_index.json", captured)
    return captured


async def capture_proceedings(
    client: SejmClient,
    out_root: Path,
    term: int,
    year: int,
    refresh: bool,
    no_binaries: bool,
    limit: Optional[int],
) -> list[str]:
    base = _term_root(term)
    dest_dir = out_root / "sejm" / "proceedings"

    list_data = await client.get_json(f"{base}/proceedings")
    if not isinstance(list_data, list):
        return []
    write_json(dest_dir / "_list.json", list_data)

    # Filter to year by any "dates" entries inside the proceeding
    keep: list[dict] = []
    for p in list_data:
        dates = p.get("dates") or []
        years = {d[:4] for d in dates if isinstance(d, str) and len(d) >= 4}
        if str(year) in years:
            keep.append(p)
    if limit is not None:
        keep = keep[:limit]

    captured: list[str] = []
    for p in keep:
        pid = p.get("number") or p.get("id")
        if pid is None:
            continue
        captured.append(str(pid))
        await _maybe_save_json(
            client, f"{base}/proceedings/{pid}", dest_dir / f"{pid}.json", refresh
        )
        for d in p.get("dates") or []:
            if not isinstance(d, str) or not d.startswith(str(year)):
                continue
            t_path = f"{base}/proceedings/{pid}/{d}/transcripts"
            t_data = await _maybe_save_json(
                client, t_path, dest_dir / f"{pid}__{d}__transcripts.json", refresh
            )
            if not no_binaries and _take("proceedings_transcripts"):
                await _maybe_save_binary(
                    client,
                    f"{t_path}/pdf",
                    dest_dir / f"{pid}__{d}__transcripts.pdf",
                    refresh,
                )
                # Per-statement HTML — only if json gave us count
                statements = []
                if isinstance(t_data, dict):
                    statements = t_data.get("statements") or []
                stmt_dir = dest_dir / f"{pid}__{d}__statements"
                stmt_ids = []
                for st in statements:
                    n = st.get("num")
                    if n is None:
                        continue
                    stmt_ids.append(str(n))
                    await _maybe_save_text(
                        client,
                        f"{t_path}/{n}",
                        stmt_dir / f"{n}.html",
                        refresh,
                    )
                if stmt_ids:
                    update_index(stmt_dir / "_index.json", stmt_ids)
    update_index(dest_dir / "_index.json", captured)
    return captured


async def capture_votings(
    client: SejmClient,
    out_root: Path,
    term: int,
    year: int,
    refresh: bool,
    no_binaries: bool,
    limit: Optional[int],
) -> list[str]:
    """Walk /votings groups, then per-proceeding list, then detail."""
    base = _term_root(term)
    dest_dir = out_root / "sejm" / "votings"

    groups = await client.get_json(f"{base}/votings")
    if not isinstance(groups, list):
        return []
    write_json(dest_dir / "_groups.json", groups)

    proc_nums = sorted(
        {
            g["proceeding"]
            for g in groups
            if g.get("proceeding") is not None
            and isinstance(g.get("date"), str)
            and g["date"].startswith(str(year))
        }
    )
    if limit is not None:
        proc_nums = proc_nums[:limit]

    captured: list[str] = []
    for proc in proc_nums:
        proc_list = await client.get_json(f"{base}/votings/{proc}")
        if not isinstance(proc_list, list):
            continue
        for v in proc_list:
            d = first_date(v)
            if d is None or d.year != year:
                continue
            num = v.get("votingNumber")
            if num is None:
                continue
            sid = f"{proc}__{num}"
            captured.append(sid)
            detail = await client.get_json(f"{base}/votings/{proc}/{num}")
            payload = detail if isinstance(detail, dict) else v
            write_json(dest_dir / f"{sid}.json", payload)
            if not no_binaries:
                await _maybe_save_binary(
                    client,
                    f"{base}/votings/{proc}/{num}/pdf",
                    dest_dir / f"{sid}.pdf",
                    refresh,
                )
    update_index(dest_dir / "_index.json", captured)
    return captured


async def capture_prints(
    client: SejmClient,
    out_root: Path,
    term: int,
    year: int,
    refresh: bool,
    no_binaries: bool,
    limit: Optional[int],
) -> list[str]:
    base = _term_root(term)
    dest_dir = out_root / "sejm" / "prints"

    list_data = await _paginate_list(client, f"{base}/prints")
    if not list_data:
        return []
    write_json(dest_dir / "_list.json", list_data)

    keep = [p for p in list_data if in_year(p, year)]
    if limit is not None:
        keep = keep[:limit]

    captured: list[str] = []
    for p in keep:
        num = p.get("number")
        if num is None:
            continue
        sid = _safe_id(num)
        captured.append(sid)
        await _maybe_save_json(
            client, f"{base}/prints/{num}", dest_dir / f"{sid}.json", refresh
        )
        if not no_binaries and _take("prints"):
            for att in p.get("attachments") or []:
                if not isinstance(att, str):
                    continue
                safe = _safe_id(att)
                await _maybe_save_binary(
                    client,
                    f"{base}/prints/{num}/{att}",
                    dest_dir / f"{sid}__{safe}",
                    refresh,
                )
    update_index(dest_dir / "_index.json", captured)
    return captured


async def capture_processes(
    client: SejmClient,
    out_root: Path,
    term: int,
    year: int,
    refresh: bool,
    no_binaries: bool,
    limit: Optional[int],
) -> list[str]:
    base = _term_root(term)
    dest_dir = out_root / "sejm" / "processes"

    list_data = await _paginate_list(client, f"{base}/processes")
    if not list_data:
        return []
    write_json(dest_dir / "_list.json", list_data)

    keep = [p for p in list_data if in_year(p, year)]
    if limit is not None:
        keep = keep[:limit]

    captured: list[str] = []
    for p in keep:
        num = p.get("number")
        if num is None:
            continue
        sid = _safe_id(num)
        captured.append(sid)
        detail = await _maybe_save_json(
            client, f"{base}/processes/{num}", dest_dir / f"{sid}.json", refresh
        )
        if not no_binaries and isinstance(detail, dict) and _take("processes"):
            for stage in detail.get("stages") or []:
                for att in stage.get("attachments") or []:
                    fname = att if isinstance(att, str) else att.get("name")
                    if not fname:
                        continue
                    safe = _safe_id(fname)
                    await _maybe_save_binary(
                        client,
                        f"{base}/processes/{num}/attachment/{fname}",
                        dest_dir / f"{sid}__attachments" / safe,
                        refresh,
                    )
    update_index(dest_dir / "_index.json", captured)
    return captured


async def capture_bills(
    client: SejmClient,
    out_root: Path,
    term: int,
    year: int,
    refresh: bool,
    limit: Optional[int],
) -> list[str]:
    base = _term_root(term)
    dest_dir = out_root / "sejm" / "bills"

    list_data = await _paginate_list(client, f"{base}/bills")
    if not list_data:
        return []
    write_json(dest_dir / "_list.json", list_data)

    keep = [b for b in list_data if in_year(b, year)]
    if limit is not None:
        keep = keep[:limit]

    captured: list[str] = []
    for b in keep:
        bid = b.get("id") or b.get("number")
        if bid is None:
            continue
        sid = _safe_id(bid)
        captured.append(sid)
        write_json(dest_dir / f"{sid}.json", b)
    update_index(dest_dir / "_index.json", captured)
    return captured


async def _capture_qa(
    client: SejmClient,
    out_root: Path,
    term: int,
    year: int,
    refresh: bool,
    no_binaries: bool,
    limit: Optional[int],
    resource: str,
) -> list[str]:
    base = _term_root(term)
    dest_dir = out_root / "sejm" / resource

    list_data = await _paginate_list(client, f"{base}/{resource}")
    if not list_data:
        return []
    write_json(dest_dir / "_list.json", list_data)

    keep = [i for i in list_data if in_year(i, year)]
    if limit is not None:
        keep = keep[:limit]

    captured: list[str] = []
    for item in keep:
        num = item.get("num")
        if num is None:
            continue
        sid = _safe_id(num)
        captured.append(sid)
        write_json(dest_dir / f"{sid}.json", item)
        await _maybe_save_text(
            client,
            f"{base}/{resource}/{num}/body",
            dest_dir / f"{sid}__body.html",
            refresh,
        )
        for reply in item.get("replies") or []:
            key = reply.get("key")
            if not key:
                continue
            safe_key = _safe_id(key)
            await _maybe_save_text(
                client,
                f"{base}/{resource}/{num}/reply/{key}/body",
                dest_dir / f"{sid}__reply_{safe_key}.html",
                refresh,
            )
            if not no_binaries and _take(f"qa_{resource}"):
                for att in reply.get("attachments") or []:
                    name = att.get("name") if isinstance(att, dict) else None
                    if not name:
                        continue
                    safe = _safe_id(name)
                    await _maybe_save_binary(
                        client,
                        f"{base}/{resource}/attachment/{key}/{name}",
                        dest_dir / f"{sid}__reply_{safe_key}__{safe}",
                        refresh,
                    )
    update_index(dest_dir / "_index.json", captured)
    return captured


async def capture_interpellations(
    client, out_root, term, year, refresh, no_binaries, limit
) -> list[str]:
    return await _capture_qa(
        client, out_root, term, year, refresh, no_binaries, limit, "interpellations"
    )


async def capture_written_questions(
    client, out_root, term, year, refresh, no_binaries, limit
) -> list[str]:
    return await _capture_qa(
        client, out_root, term, year, refresh, no_binaries, limit, "writtenQuestions"
    )


async def capture_videos(
    client: SejmClient,
    out_root: Path,
    term: int,
    year: int,
    refresh: bool,
    limit: Optional[int],
) -> list[str]:
    base = _term_root(term)
    dest_dir = out_root / "sejm" / "videos"

    list_data = await _paginate_list(client, f"{base}/videos")
    if not list_data:
        return []
    write_json(dest_dir / "_list.json", list_data)

    keep = [v for v in list_data if in_year(v, year)]
    if limit is not None:
        keep = keep[:limit]

    captured: list[str] = []
    for v in keep:
        unid = v.get("unid")
        if not unid:
            continue
        sid = _safe_id(unid)
        captured.append(sid)
        write_json(dest_dir / f"{sid}.json", v)
    update_index(dest_dir / "_index.json", captured)
    return captured
