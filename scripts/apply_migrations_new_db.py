"""One-shot: apply 0001..0072 to new DB (skip 0073 FTS per user request).

Idempotent only insofar as PG raises on duplicate; we record applied names
in a tiny tracking table on first run so a re-run skips done ones.
"""
from __future__ import annotations
import sys
from pathlib import Path
import psycopg2

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "supabase" / "migrations"
SKIP = {"0073_polish_fts.sql"}

DSN = dict(
    host="aws-0-eu-west-1.pooler.supabase.com",
    port=5432,
    user="postgres.wtvjmhthpheoimuuljin",
    password="pro100_w_dupe",
    dbname="postgres",
    connect_timeout=15,
)


def main() -> int:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    files = [f for f in files if f.name not in SKIP]
    print(f"applying {len(files)} migrations (skipping {sorted(SKIP)})")

    conn = psycopg2.connect(**DSN)
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS _supagraf_applied_migrations (
            name text PRIMARY KEY,
            applied_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    conn.commit()
    cur.execute("SELECT name FROM _supagraf_applied_migrations")
    done = {row[0] for row in cur.fetchall()}
    print(f"already applied: {len(done)}")

    applied = 0
    for f in files:
        if f.name in done:
            continue
        sql = f.read_text(encoding="utf-8")
        print(f"  -> {f.name} ({len(sql)} bytes)", flush=True)
        try:
            cur.execute(sql)
            cur.execute(
                "INSERT INTO _supagraf_applied_migrations(name) VALUES (%s) ON CONFLICT DO NOTHING",
                (f.name,),
            )
            conn.commit()
            applied += 1
        except Exception as e:
            conn.rollback()
            print(f"     FAIL: {type(e).__name__}: {e}")
            return 1
    print(f"\napplied {applied} new migrations")
    return 0


if __name__ == "__main__":
    sys.exit(main())
