"""Atomic publication of a fully built network; failed builds keep the last result."""

from __future__ import annotations

from typing import Any

import httpx
from postgrest.exceptions import APIError
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from supagraf.db import supabase


def _transient_failure(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError):
        return True
    return isinstance(exc, APIError) and str(exc.code) in {"429", "500", "502", "503", "504", "524"}


# Reads can be repeated, and publication is an idempotent upsert by term.
# Retry transient gateway failures while preserving the previous snapshot.
@retry(retry=retry_if_exception(_transient_failure), stop=stop_after_attempt(4),
       wait=wait_exponential(multiplier=1, min=1, max=8), reraise=True)
def refresh_network(*, term: int = 10, days: int = 180) -> dict[str, Any]:
    from supagraf.network import build_network

    payload = build_network(term=term, days=days)
    return publish_network(payload)


def publish_network(payload: dict[str, Any]) -> dict[str, Any]:
    term = payload.get("term")
    if payload.get("schema_version") != "1" or not isinstance(term, int) or term <= 0:
        raise ValueError("Network builder returned an incompatible snapshot")
    # A single upsert is transactional. Do not delete/clear the prior graph first.
    supabase().table("politician_network_snapshots").upsert(
        {
            "term": term,
            "generated_at": payload["generated_at"],
            "payload": payload,
        },
        on_conflict="term",
    ).execute()
    return {
        "nodes": len(payload["nodes"]),
        "question_edges": len(payload["layers"]["questions"]["edges"]),
        "vote_edges": len(payload["layers"]["votes"]["edges"]),
        "generated_at": payload["generated_at"],
    }
