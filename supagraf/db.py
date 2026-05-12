"""Single source of truth for the Supabase client.

Reads SUPABASE_URL + SUPABASE_KEY from env (.env). Lazy-initialized so
import-time failures (missing env) don't poison test collection.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from supabase import Client, create_client


def load_dotenv() -> None:
    """Minimal .env loader — idempotent, sets only missing keys.

    Public so callers (e.g. supagraf.enrich.llm) can ensure GOOGLE_API_KEY etc.
    are populated before they need them, without going through supabase().
    """
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


# Back-compat alias for any internal call sites.
_load_dotenv = load_dotenv


@lru_cache(maxsize=1)
def supabase() -> Client:
    if "SUPABASE_URL" not in os.environ:
        load_dotenv()
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_KEY"]
    return create_client(url, key)


PROJECT_ID = "wtvjmhthpheoimuuljin"
DEFAULT_TERM = 10
