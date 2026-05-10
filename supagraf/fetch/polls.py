"""Fetch the Wikipedia EN polling article.

One request per run. Wikipedia REST API requires an identifying UA.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import httpx
from loguru import logger
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "data" / "raw" / "polls"
REST_URL = "https://en.wikipedia.org/api/rest_v1/page/html/{slug}"
USER_AGENT = (
    "tygodnik-sejmowy-etl/0.1 (https://github.com/miskibin/tygodnik-sejmowy)"
)
DEFAULT_SLUG = "Opinion_polling_for_the_next_Polish_parliamentary_election"


class PollsFetchError(RuntimeError):
    """Transient HTTP/network failure."""


@retry(
    retry=retry_if_exception_type((httpx.HTTPError, PollsFetchError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=4),
    reraise=True,
)
def _get(url: str) -> str:
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html"}
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        r = client.get(url, headers=headers)
        if r.status_code >= 500:
            raise PollsFetchError(f"{url} -> {r.status_code}")
        r.raise_for_status()
        return r.text


def fetch_polls(slug: str = DEFAULT_SLUG) -> Path:
    """Fetch the article HTML and snapshot to data/raw/polls/.

    Returns the on-disk path. Idempotent in the sense that re-running on the
    same day overwrites the snapshot for that day.
    """
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    url = REST_URL.format(slug=slug)
    logger.info("polls.fetch.start url={}", url)
    html = _get(url)
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    out = RAW_DIR / f"wikipedia_en_{today}.html"
    out.write_text(html, encoding="utf-8")
    logger.info("polls.fetch.saved path={} size={}KB", out, len(html) // 1024)
    return out
