"""Single source of truth for the Supabase client.

Reads SUPABASE_URL + SUPABASE_KEY from env (.env). Lazy-initialized so
import-time failures (missing env) don't poison test collection.
"""
from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

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


PROJECT_ID = "mixvm-selfhost"
DEFAULT_TERM = 10


# ---------------------------------------------------------------------------
# RPC helpers — bypass Kong via direct psycopg when SUPAGRAF_LOAD_DIRECT_DSN
# is set.
#
# Why: Kong's nginx_upstream_read_timeout (~60s) is shorter than several of
# our heavy load / refresh-matview functions (load_proceedings, load_votes_*,
# refresh_atlas_matviews). PostgREST proxies through Kong, so a long RPC
# returns "504 upstream timing out" even though the SQL succeeds server-side.
# CLAUDE.md notes the same: "heavy refreshes need service role / direct
# connection". Direct psycopg as `postgres` runs with no statement_timeout
# and no proxy in the path.
#
# Set SUPAGRAF_LOAD_DIRECT_DSN to e.g.
#   postgresql://postgres:<pwd>@supabase-db:5432/postgres
# (in-container, joined to the `supabase_default` network). When unset the
# helpers transparently fall back to the Supabase HTTP client.
# ---------------------------------------------------------------------------


_IDENT_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _direct_dsn() -> str | None:
    return os.environ.get("SUPAGRAF_LOAD_DIRECT_DSN") or None


def _build_rpc_sql(fn: str, args: dict[str, Any] | None) -> tuple[str, tuple]:
    if not _IDENT_RE.match(fn):
        raise ValueError(f"unsafe function name: {fn!r}")
    if not args:
        return f"SELECT * FROM {fn}()", ()
    for k in args:
        if not _IDENT_RE.match(k):
            raise ValueError(f"unsafe arg name: {k!r}")
    named = ", ".join([f"{k} => %s" for k in args])
    return f"SELECT * FROM {fn}({named})", tuple(args.values())


def call_rpc_scalar(fn: str, args: dict[str, Any] | None = None) -> Any:
    """Call a Postgres function returning a scalar. Returns its value (or None)."""
    dsn = _direct_dsn()
    if dsn:
        import psycopg  # lazy import — only needed on direct path
        sql_str, vals = _build_rpc_sql(fn, args)
        with psycopg.connect(dsn, connect_timeout=10, autocommit=True) as conn, conn.cursor() as cur:
            cur.execute(sql_str, vals)
            row = cur.fetchone()
            return row[0] if row else None
    return supabase().rpc(fn, args or {}).execute().data


def call_rpc_table(fn: str, args: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Call a Postgres function returning TABLE/SETOF rows. Returns list of dicts."""
    dsn = _direct_dsn()
    if dsn:
        import psycopg
        from psycopg.rows import dict_row
        sql_str, vals = _build_rpc_sql(fn, args)
        with psycopg.connect(
            dsn, connect_timeout=10, autocommit=True, row_factory=dict_row,
        ) as conn, conn.cursor() as cur:
            cur.execute(sql_str, vals)
            return list(cur.fetchall())
    return supabase().rpc(fn, args or {}).execute().data or []
