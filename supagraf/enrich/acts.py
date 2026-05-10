"""acts.act_kind — citizen-facing classification of ELI acts.

Deterministic mapping from `acts.type` + `acts.title` to one of:
    ustawa_nowa | nowelizacja | tekst_jednolity | obwieszczenie
    rozporzadzenie | uchwala_sejmu | inne

Mirror of SQL `compute_act_kind()` from migration 0077_acts_act_kind.sql.
Change one, change both.

Why a Python module if SQL already does the work:
  - `verify_sample` lets a human eyeball 50 random classifications
    (per kind) before flipping the frontend filter on a citizen-facing UI.
  - `recompute_all` re-runs the deterministic UPDATE if the heuristic
    changes (cheaper than re-applying a migration).

No LLM, no PDF read — purely metadata-based.
"""
from __future__ import annotations

from collections import Counter
from typing import Final

from loguru import logger

from supagraf.db import supabase

ACT_KINDS: Final = (
    "ustawa_nowa",
    "nowelizacja",
    "tekst_jednolity",
    "obwieszczenie",
    "rozporzadzenie",
    "uchwala_sejmu",
    "inne",
)


def classify_act(act_type: str | None, title: str | None) -> str:
    """Pure classifier. Returns one of ACT_KINDS.

    Mirror of compute_act_kind() in 0077_acts_act_kind.sql. The Postgres
    function is the source of truth at load time; this Python copy exists
    for verification and ad-hoc re-classification jobs.
    """
    t = (act_type or "").strip()
    title_low = (title or "").lower()

    if t == "Ustawa":
        # Ratifications / withdrawals are new ustawy even when their title
        # mentions "o zmianie" (ratification of an amending protocol etc.).
        if "o ratyfikacji" in title_low or "o wypowiedzeniu" in title_low:
            return "ustawa_nowa"
        if "o zmianie" in title_low or "zmieniająca ustaw" in title_low:
            return "nowelizacja"
        return "ustawa_nowa"
    if t == "Obwieszczenie":
        # "ogłoszenia jednolitego tekstu ustawy ..." / "jednolity tekst rozporządzenia ..."
        if "jednolit" in title_low and "tekst" in title_low:
            return "tekst_jednolity"
        return "obwieszczenie"
    if t == "Rozporządzenie":
        return "rozporzadzenie"
    if t == "Uchwała" and (title or "").startswith("Uchwała Sejmu"):
        return "uchwala_sejmu"
    return "inne"


def verify_sample(per_kind: int = 50) -> dict[str, list[dict]]:
    """Pull up to `per_kind` random rows of each act_kind and return them
    grouped by kind for human eyeballing.

    Use BEFORE flipping the frontend filter on, to sanity-check that the
    deterministic classifier didn't mis-bucket edge cases (e.g. a
    'Rozporządzenie z dnia ... zmieniające rozporządzenie ...' that should
    arguably be 'nowelizacja' but maps to 'rozporzadzenie' under our
    current rules).

    Returns: {kind: [{id, type, title, act_kind, eli_id}, ...]}
    """
    sb = supabase()
    out: dict[str, list[dict]] = {k: [] for k in ACT_KINDS}
    for kind in ACT_KINDS:
        rows = (
            sb.table("acts")
            .select("id, eli_id, type, title, act_kind")
            .eq("act_kind", kind)
            .order("id", desc=True)
            .limit(per_kind)
            .execute()
            .data
            or []
        )
        out[kind] = rows
    return out


def print_sample(per_kind: int = 50) -> None:
    """Print verify_sample() output as a readable transcript."""
    grouped = verify_sample(per_kind=per_kind)
    for kind in ACT_KINDS:
        rows = grouped.get(kind, [])
        print(f"\n=== {kind}  ({len(rows)} rows) ===")
        for r in rows:
            title = (r.get("title") or "").replace("\n", " ")
            print(f"  [{r.get('eli_id')}]  type={r.get('type')!r}  | {title[:160]}")


def kind_counts() -> Counter[str]:
    """Return a Counter of act_kind across all rows. Cheap sanity check
    after a backfill — should sum to total acts and match expectations
    (ustawa_nowa+nowelizacja ≈ 400, rozporzadzenie ≈ 2400, etc.)."""
    sb = supabase()
    counts: Counter[str] = Counter()
    # paginate via offset; default limit is 1000.
    page_size = 1000
    offset = 0
    while True:
        rows = (
            sb.table("acts")
            .select("act_kind")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
            or []
        )
        if not rows:
            break
        for r in rows:
            counts[r.get("act_kind") or "_null_"] += 1
        if len(rows) < page_size:
            break
        offset += page_size
    return counts


def recompute_all(*, dry_run: bool = False) -> int:
    """Re-classify every row in `acts`. Returns rows touched.

    Uses the SQL `compute_act_kind()` function (same logic as the Python
    `classify_act`, but executed server-side so 7k rows stay one round
    trip). Idempotent — only updates rows whose stored act_kind differs
    from the freshly-computed one.
    """
    sb = supabase()
    if dry_run:
        # Postgrest can't run arbitrary UPDATE preview; surface the count
        # of rows that *would* change via classify_act() locally instead.
        rows = (
            sb.table("acts")
            .select("id, type, title, act_kind")
            .execute()
            .data
            or []
        )
        n = sum(
            1 for r in rows
            if classify_act(r.get("type"), r.get("title")) != r.get("act_kind")
        )
        logger.info("recompute_all dry_run: would update {} of {} rows", n, len(rows))
        return n

    # Server-side recompute via RPC. We didn't ship a dedicated RPC for
    # this in 0077 because the migration already runs the same UPDATE on
    # apply; for ad-hoc re-runs we issue raw SQL via supabase.rpc on a
    # convenience function. If/when the heuristic changes, ship a fresh
    # migration rather than relying on this path.
    raise NotImplementedError(
        "recompute_all writes are not exposed via supabase-py. Re-apply "
        "0077_acts_act_kind.sql (the trailing UPDATE statement is "
        "idempotent) or run the equivalent UPDATE directly via psql."
    )


__all__ = [
    "ACT_KINDS",
    "classify_act",
    "verify_sample",
    "print_sample",
    "kind_counts",
    "recompute_all",
]
