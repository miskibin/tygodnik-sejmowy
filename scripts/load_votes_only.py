"""Run only load_votes_for_sitting for every sitting in _stage_votings.

Used when the full `supagraf load` command can't complete because PostgREST
RPC timeouts catch heavy PRE_STEPS (e.g. load_proceedings on a large 4-year
historical backfill). PRE_STEPS already applied via direct SQL — this picks
up just the votes-per-sitting loop with the same tenacity retry policy.
"""
from __future__ import annotations
import os, sys
from supagraf.db import supabase
from postgrest.exceptions import APIError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential


@retry(
    retry=retry_if_exception_type(APIError),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
def _rpc(client, fn: str, args: dict) -> int:
    r = client.rpc(fn, args).execute()
    return int(r.data or 0)


def main(term: int = 10) -> int:
    c = supabase()
    # staged_sittings RPC times out via PostgREST anon-role; hardcode the
    # term-10 sitting set from a direct SQL probe against _stage_votings.
    # Retry-mode: SUPAGRAF_RETRY_SITTINGS env (comma-list) overrides full set.
    retry_env = os.environ.get("SUPAGRAF_RETRY_SITTINGS", "").strip()
    if retry_env:
        sittings = [int(s) for s in retry_env.split(",") if s.strip()]
    else:
        sittings = list(range(1, 57))  # 1..56 as confirmed by execute_sql
    total = 0
    for s in sittings:
        try:
            n = _rpc(c, "load_votes_for_sitting", {"p_term": term, "p_sitting": s})
            total += n
            print(f"sitting {s}: {n}")
        except APIError as e:
            print(f"sitting {s} FAILED: {e}", file=sys.stderr)
    print(f"\nTOTAL: {total}")
    return total


if __name__ == "__main__":
    main(int(os.environ.get("SEJM_TERM", 10)))
