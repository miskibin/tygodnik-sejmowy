## Cursor Cloud specific instructions

### Services overview

| Service | How to run | Notes |
|---|---|---|
| **supagraf** (Python ETL) | `uv run python -m supagraf --help` | Python 3.10, deps via `uv sync` |
| **frontend** (Next.js 16) | `cd frontend && pnpm dev` | Runs on http://localhost:3000 |

### Environment setup

- Python 3.10 is required (`.python-version`). Install via `uv python install 3.10` if missing.
- `uv sync` installs only dependencies (supagraf is a virtual workspace package). Run `uv pip install -e .` after `uv sync` to install supagraf itself in editable mode — required for pytest to resolve `supagraf.*` imports correctly (otherwise `tests/supagraf/__init__.py` shadows the real package).
- Frontend uses `pnpm install` (lockfile: `frontend/pnpm-lock.yaml`).
- Both services require `.env` (root) and `frontend/.env.local` populated from secrets (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). See `.env.example`.

### Running tests

- **Python unit tests**: `uv run pytest tests/supagraf/unit -q --ignore=tests/supagraf/unit/test_pdf_extract.py`
  - `test_pdf_extract.py` has a stale import (`_resolve_ocr_backend`) — skip it.
  - Some unit tests have pre-existing mock signature mismatches (61 failures as of May 2026) — these are not caused by env issues.
- **E2E tests** (hit live Supabase): `RUN_E2E=1 uv run pytest tests/supagraf/e2e -q`
- **Frontend lint**: `cd frontend && pnpm lint` (23 pre-existing errors, mostly React hooks warnings)

### Gotchas

- DB is the self-hosted Supabase at `db.msulawiak.pl` (mixvm). Do **not** use Supabase MCP tools or assume a managed-project endpoint — those target unrelated environments. DDL goes through direct psql on mixvm; PostgREST handles queries only.
- PostgREST ("schema cache" / PGRST002 / PGRST205) errors can appear after DDL until the cache reloads — `NOTIFY pgrst, 'reload schema'` on the same DB, then retry.
- The Python `SUPABASE_KEY` in `.env` should be the **service_role** JWT (not the publishable key) for ETL write operations. The frontend uses the publishable/anon key.
- `uv run python -m supagraf` loads `.env` from workspace root automatically via `supagraf/db.py:load_dotenv()`.
- Next.js 16 is a canary release — read `node_modules/next/dist/docs/` before modifying frontend code.
- The `msw` build script warning during `pnpm install` is benign (ignored build script). The `pnpm-workspace.yaml` lists `msw`, `sharp`, and `unrs-resolver` in `ignoredBuiltDependencies`.
- Frontend `.env.local` uses server-side env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or `SUPABASE_KEY`), and `SUPABASE_SERVICE_ROLE_KEY` — not `NEXT_PUBLIC_` prefixed.
