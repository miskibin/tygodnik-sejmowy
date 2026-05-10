"""Fetch MP photo availability from api.sejm.gov.pl.

MVP: store the public URL pointer (no bytes download). HEAD-probes
``api.sejm.gov.pl/sejm/term{term}/MP/{mp_id}/photo`` to check whether a
photo exists for each MP. ``photo_fetched_at`` is stamped on every
checked row (200 or 404) so re-runs skip already-checked MPs. Transport
errors are NOT stamped — those rows stay pending and retry on next run.

Idempotent. Rate limited (5 req/s default). 405 responses fall back to GET
since some servers don't implement HEAD.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from loguru import logger

from supagraf.db import supabase

API = "https://api.sejm.gov.pl/sejm/term{term}/MP/{mp_id}/photo"
USER_AGENT = "supagraf/1.0 (etl; +https://github.com/miskibin/sejmograf)"
DEFAULT_THROTTLE_S = 0.2  # 5 req/s
DEFAULT_TIMEOUT_S = 10.0


@dataclass
class FetchPhotoReport:
    checked: int = 0
    has_photo: int = 0
    no_photo: int = 0
    errors: int = 0

    def to_dict(self) -> dict:
        return {
            "checked": self.checked,
            "has_photo": self.has_photo,
            "no_photo": self.no_photo,
            "errors": self.errors,
        }


def _select_pending_mps(term: int, *, force: bool):
    cli = supabase()
    q = cli.table("mps").select("id, mp_id").eq("term", term)
    if not force:
        q = q.is_("photo_fetched_at", "null")
    return q.execute().data or []


def _is_image(content_type: str | None) -> bool:
    if not content_type:
        # The Sejm endpoint usually sets content-type, but be lenient: a 200
        # response with no content-type is still treated as an image.
        return True
    ct = content_type.lower()
    return ct.startswith("image/") or ct.startswith("application/octet-stream")


def fetch_mp_photos(
    term: int = 10,
    *,
    force: bool = False,
    throttle_s: float = DEFAULT_THROTTLE_S,
    timeout_s: float = DEFAULT_TIMEOUT_S,
) -> FetchPhotoReport:
    """For each mps row where photo_fetched_at is null (or all, if force=True):
    HEAD api.sejm.gov.pl/sejm/term{term}/MP/{mp_id}/photo. Stamp
    photo_fetched_at + photo_url accordingly.

    Args:
      term: Sejm term, default 10.
      force: re-check all MPs regardless of existing photo_fetched_at stamp.
      throttle_s: sleep between successful HTTP checks (rate-limit). 0.2 = 5/s.
      timeout_s: per-request timeout.
    """
    cli = supabase()
    rows = _select_pending_mps(term, force=force)
    report = FetchPhotoReport()
    headers = {"User-Agent": USER_AGENT, "Accept": "image/*, */*"}
    with httpx.Client(
        timeout=timeout_s,
        headers=headers,
        follow_redirects=True,
    ) as client:
        for r in rows:
            mp_id = r["mp_id"]
            row_pk = r["id"]
            url = API.format(term=term, mp_id=mp_id)
            try:
                resp = client.head(url)
                # Some servers don't support HEAD — fall back to GET if 405.
                if resp.status_code == 405:
                    resp = client.get(url)
            except Exception as e:  # noqa: BLE001
                # Transport error — DO NOT stamp photo_fetched_at; row stays
                # pending so the next run retries it.
                report.errors += 1
                logger.error("photo HEAD failed mp_id={}: {!r}", mp_id, e)
                # Honor throttle even on transport error so we don't hammer.
                if throttle_s > 0:
                    time.sleep(throttle_s)
                continue

            content_type = (resp.headers or {}).get("content-type")
            ok = resp.status_code == 200 and _is_image(content_type)
            photo_url = url if ok else None
            report.checked += 1
            if ok:
                report.has_photo += 1
            else:
                report.no_photo += 1
            try:
                cli.table("mps").update({
                    "photo_url": photo_url,
                    "photo_fetched_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", row_pk).execute()
            except Exception as e:  # noqa: BLE001
                # DB write failure: count as error, don't double-count
                # has_photo/no_photo (those reflect upstream, which succeeded).
                report.errors += 1
                logger.error("DB update failed mp_id={}: {!r}", mp_id, e)

            if report.checked % 50 == 0:
                logger.info(
                    "progress: checked={} has_photo={} no_photo={} errors={} (of {})",
                    report.checked, report.has_photo, report.no_photo,
                    report.errors, len(rows),
                )

            if throttle_s > 0:
                time.sleep(throttle_s)

    logger.info(
        "fetch_mp_photos done: checked={} has_photo={} no_photo={} errors={}",
        report.checked, report.has_photo, report.no_photo, report.errors,
    )
    return report
