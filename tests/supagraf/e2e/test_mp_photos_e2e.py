"""E2E test: fetch MP photos from api.sejm.gov.pl. Gated RUN_E2E=1.

Resets photo_fetched_at to NULL for ONE specific test MP, then runs the
fetcher (which re-checks just that one row since others are stamped from
the real run). Verifies a stamp lands and photo_url is either the API URL
or NULL.
"""
from __future__ import annotations

import os

import pytest

from supagraf.db import supabase
from supagraf.fetch.mp_photos import fetch_mp_photos, API

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e hits real api.sejm.gov.pl; set RUN_E2E=1 to enable",
)


def test_fetch_one_mp_photo():
    cli = supabase()
    rows = (
        cli.table("mps")
        .select("id, mp_id")
        .eq("term", 10)
        .order("mp_id")
        .limit(1)
        .execute()
        .data
    ) or []
    if not rows:
        pytest.skip("no MPs in DB term=10")

    target = rows[0]
    pk = target["id"]
    mp_id = target["mp_id"]

    # Reset stamp for this one MP so fetch_mp_photos picks it up
    cli.table("mps").update(
        {"photo_url": None, "photo_fetched_at": None}
    ).eq("id", pk).execute()

    rep = fetch_mp_photos(term=10, force=False, throttle_s=0)
    assert rep.errors == 0
    assert rep.checked >= 1

    # Re-read the row
    fresh = (
        cli.table("mps")
        .select("photo_url, photo_fetched_at")
        .eq("id", pk)
        .execute()
        .data
    )[0]
    assert fresh["photo_fetched_at"] is not None
    if fresh["photo_url"] is not None:
        assert fresh["photo_url"] == API.format(term=10, mp_id=mp_id)
