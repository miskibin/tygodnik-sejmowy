"""Run core load via direct psql connection (bypass PostgREST 8s timeout).

Replicates supagraf.load.run_core_load but calls the SQL fns over psycopg2
on the pooler. Each fn returns int affected count.
"""
from __future__ import annotations
import io
import sys
import time
import psycopg2

# Force UTF-8 stdout for Polish diacritics in error messages.
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

DSN = dict(
    host="aws-0-eu-west-1.pooler.supabase.com",
    port=5432,
    user="postgres.wtvjmhthpheoimuuljin",
    password="pro100_w_dupe",
    dbname="postgres",
    connect_timeout=15,
)

PRE_STEPS = [
    "load_clubs",
    "load_inferred_clubs",
    "load_mps",
    "load_mp_club_membership",
    "load_proceedings",
    "load_votings",
    "load_committees",
    "load_prints",
    "load_prints_additional",
    "load_print_relationships",
    "load_print_attachments",
    "load_processes",
    "load_bills",
    "load_questions",
    "load_videos",
    "load_districts",
    "load_district_postcodes",
    "load_promises",
    "load_acts",
    "load_act_relations",
]


def main() -> int:
    term = 10
    start_from = sys.argv[1] if len(sys.argv) > 1 else None
    conn = psycopg2.connect(**DSN)
    conn.autocommit = True
    cur = conn.cursor()
    # Generous statement timeout — sessions through pooler 5432 honor SET.
    cur.execute("SET statement_timeout = '600000'")

    total = 0
    skip_pre = start_from == "votes_only"
    started = start_from is None
    for fn in PRE_STEPS:
        if skip_pre:
            break
        if not started:
            if fn == start_from:
                started = True
            else:
                print(f"  {fn}: SKIP (start_from={start_from})")
                continue
        t0 = time.time()
        try:
            cur.execute(f"SELECT {fn}(%s)", (term,))
            n = cur.fetchone()[0] or 0
        except Exception as e:
            print(f"FAIL {fn}: {type(e).__name__}: {e}")
            return 1
        dt = time.time() - t0
        total += int(n)
        print(f"  {fn}: affected={n} ({dt:.1f}s)", flush=True)

    # load_votes (single bulk call). load_votes_for_sitting + staged_sittings
    # were in the dropped 0006 migration; the bulk variant in 0002 is sufficient
    # since we run on direct psql with 600s timeout (no PostgREST 8s limit).
    print("\nload_votes (bulk)...")
    t0 = time.time()
    cur.execute("SELECT load_votes(%s)", (term,))
    votes_total = cur.fetchone()[0] or 0
    print(f"  load_votes: affected={votes_total} ({time.time()-t0:.1f}s)")
    total += int(votes_total)
    print(f"\nTotal rows touched: {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
