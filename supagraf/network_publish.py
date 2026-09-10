"""Atomic publication of a fully built network; failed builds keep the last result."""

from __future__ import annotations

from typing import Any

from supagraf.db import supabase


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
