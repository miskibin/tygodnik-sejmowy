## Cursor Cloud specific instructions

### Services overview

| Service | How to run | Notes |
|---|---|---|
| **supagraf** (Python ETL) | `uv run python -m supagraf --help` | Python 3.10, deps via `uv sync` |
| **frontend** (Next.js 16) | `cd frontend && pnpm dev` | Runs on http://localhost:3000 |

### Environment setup

- Python 3.10 is required (`.python-version`). Install via `uv python install 3.10` if missing.
- `uv sync` installs the supagraf package in editable mode automatically.
- Frontend uses `pnpm install` (lockfile: `frontend/pnpm-lock.yaml`).
- Both services require `.env` (root) and `frontend/.env.local` populated from secrets (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). See `.env.example`.

### Running tests

- **Python unit tests**: `uv run pytest tests/supagraf/unit -q --ignore=tests/supagraf/unit/test_pdf_extract.py`
  - `test_pdf_extract.py` has a stale import (`_resolve_ocr_backend`) — skip it.
  - Some unit tests have pre-existing mock signature mismatches (61 failures as of May 2026) — these are not caused by env issues.
- **E2E tests** (hit live Supabase): `RUN_E2E=1 uv run pytest tests/supagraf/e2e -q`
- **Frontend lint**: `cd frontend && pnpm lint` (23 pre-existing errors, mostly React hooks warnings)

### Frontend deployment (self-host on mixvm)

Prod traffic for `vm.tygodniksejmowy.pl` runs from a container on mixvm,
not Vercel. Apex + `www` are still Vercel (separate cutover).

**Components:**

- **GitHub Actions** (`.github/workflows/frontend-image.yml`) — builds the
  frontend Docker image on every `v*` tag and pushes to
  `ghcr.io/miskibin/tygodnik-sejmowy-frontend:<semver>` + `:latest`. Pure
  CD — no CI/PR runs.
- **GHCR package** — public. Settings:
  `https://github.com/users/miskibin/packages/container/tygodnik-sejmowy-frontend/settings`
- **Portainer Stack** — `sejmograf-frontend` on `mixvm`, Stack-from-Git
  pointed at `deploy/mixvm/docker-compose.frontend.yml` (branch `main`).
  Compose pulls the image, no on-VM build.
- **Cloudflare Tunnel** — separate stack `sejmograf-cloudflared` running
  `cloudflared` (token in `secrets/.env.cloudflared`). Routes
  `vm.tygodniksejmowy.pl` → `http://sejmograf-frontend:3000` (internal
  bridge). Bypasses Orange CGNAT/port blocks.
- **DNS** — CNAME `vm` → `<tunnel-uuid>.cfargotunnel.com` in CF dashboard,
  proxied. `tygodniksejmowy.pl` is on CF nameservers
  (`keyla.ns.cloudflare.com` + `kurt.ns.cloudflare.com`).

**Required GH Actions repo secrets** (`Settings → Secrets and variables`):

- `SUPABASE_URL` = `https://db.msulawiak.pl`
- `SUPABASE_KEY` = anon key (NOT service_role — anon respects RLS)

**Required Portainer stack env** (already set):

- `SUPABASE_URL`, `SUPABASE_KEY` — same anon key
- `FRONTEND_IMAGE_TAG` = `latest` (or pin to e.g. `0.10.2`)
- `TUNNEL_TOKEN` — on the `sejmograf-cloudflared` stack only

**Cutting a release:**

```bash
git tag v0.10.X && git push origin v0.10.X
```

That's the whole flow:
1. GHA builds image (~5 min cold, ~1 min cached) and pushes to GHCR.
2. `:latest` is moved to the new tag (workflow does this).
3. Portainer stack uses `pull_policy: always` — next stack restart picks
   it up. Auto-pull on tag is **not** wired (no webhook); trigger
   manually (below).

**Force a pull/restart without a new tag** (via Portainer API,
`endpointId=3`, stack id `1`):

```bash
JWT=$(curl -sk -X POST https://mixvm.bison-fort.ts.net:9443/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<portainer-pwd>"}' \
  | jq -r .jwt)

curl -sk -X PUT "https://mixvm.bison-fort.ts.net:9443/api/stacks/1/git/redeploy?endpointId=3" \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"RepositoryReferenceName":"refs/heads/main","RepositoryAuthentication":false,"PullImage":true,"Prune":false,"Env":[{"name":"SUPABASE_URL","value":"https://db.msulawiak.pl"},{"name":"SUPABASE_KEY","value":"<anon-jwt>"},{"name":"FRONTEND_IMAGE_TAG","value":"latest"}]}'
```

Or in the Portainer UI: Stacks → `sejmograf-frontend` → Update the stack
→ check "Re-pull image and redeploy" → Update.

**Rollback:** change `FRONTEND_IMAGE_TAG` in the Portainer stack env to a
previous version (e.g. `0.10.1`) and redeploy. Old images stay in GHCR.

**Verifying deploy:**

```bash
# end-to-end through Cloudflare
curl -sI https://vm.tygodniksejmowy.pl/

# bypass any local DNS cache, hit CF edge directly
curl -sI --resolve vm.tygodniksejmowy.pl:443:104.21.6.193 https://vm.tygodniksejmowy.pl/
```

Expect `200 OK`, `x-nextjs-cache: HIT`, `cf-ray: <id>-WAW`. The
`CF-Cache-Status` header tells you whether you hit the edge or origin.

**Gotchas — frontend deploy specifically:**

- The build needs Supabase creds at *build time* (Next prerenders
  `/rss.xml`, `/alerty`). Without them the GHA build fails with
  `SUPABASE_URL and SUPABASE_ANON_KEY ... must be set`. Secrets flow:
  GHA secret → BuildKit `--mount=type=secret,id=... ,env=...` → bash env
  inside the `pnpm build` RUN step. They never land in image layers.
- `Dockerfile` uses `# syntax=docker/dockerfile:1.10` (env= shorthand
  for secret mounts is a 1.10 feature; 1.7 fails on GHA's BuildKit).
- pnpm v10 hard-fails install on any ignored postinstall script —
  `pnpm install --frozen-lockfile --ignore-scripts` is the only flag set
  that survives. `sharp` ships prebuilt linux binaries so this is fine.
- The `:latest` tag is repointed on every `v*` push (workflow rule).
  Pin `FRONTEND_IMAGE_TAG` to an explicit version for rollback safety.
- Cloudflare DNS still has `*` / apex / `www` records pointing at
  Vercel — those are intentional (prod still on Vercel until cutover).
  Only the `vm` CNAME goes through the tunnel.

### Gotchas

- DB is the self-hosted Supabase at `db.msulawiak.pl` (mixvm). Do **not** use Supabase MCP tools or assume a managed-project endpoint — those target unrelated environments. DDL goes through direct psql on mixvm; PostgREST handles queries only.
- PostgREST ("schema cache" / PGRST002 / PGRST205) errors can appear after DDL until the cache reloads — `NOTIFY pgrst, 'reload schema'` on the same DB, then retry.
- The Python `SUPABASE_KEY` in `.env` should be the **service_role** JWT (not the publishable key) for ETL write operations. The frontend uses the publishable/anon key.
- `uv run python -m supagraf` loads `.env` from workspace root automatically via `supagraf/db.py:load_dotenv()`.
- Next.js 16 is a canary release — read `node_modules/next/dist/docs/` before modifying frontend code.
- The `msw` build script warning during `pnpm install` is benign (ignored build script).
