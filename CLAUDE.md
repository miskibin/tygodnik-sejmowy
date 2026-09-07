# supagraf — agent notes

Per-project conventions for Claude Code agents (and humans). Not user-facing docs.

## GPU / CUDA

- Hardware: **NVIDIA GeForce RTX 5060 Ti, 16 GB VRAM** (per `nvidia-smi`).
- Driver / CUDA: driver 591.44, CUDA 13.1 (driver-supported runtime); toolkit 13.0 installed.
- Reference working CUDA env: `D:\SIMFACTOR_CLAUDE\.venv` runs PyTorch `2.12.0.dev+cu128` (Python 3.14) — proves CUDA 12.x runtime works system-wide. Do not break that venv.

### PDF/DOCX extraction stack

Dispatch in `supagraf/enrich/pdf.py`, cached in `pdf_extracts` by (sha256, model_version):

1. **`.docx` → python-docx** — Sejm prints often ship .docx alongside the signed PDF; the enricher prefers .docx.
2. **`.pdf` digital → pymupdf4llm** markdown. Scans detected via per-page text probe first (pymupdf4llm's internal English Tesseract would destroy Polish diacritics).
3. **`.pdf` scan → DeepSeek vision OCR** (`supagraf/enrich/vision_ocr.py`, `deepseek-v4-flash-vision-exp`). Pages rasterized at 200 DPI and cut into 3 strips (DeepSeek caps each image at 384 tokens).
4. **Fallback: Tesseract + `pol`** when vision OCR is disabled (`SUPAGRAF_VISION_OCR=0`) or fails. Installed in the mixvm image; on Windows: UB Mannheim build at `C:\Program Files\Tesseract-OCR`.

PaddleOCR and the GPU OCR experiments were removed in Sept 2026 (deadlocks, multi-GB VRAM, no gain over vision OCR).

### sejmograf venv

- `D:\sejmograf\.venv` is Python **3.10**. Cannot share with SIMFACTOR_CLAUDE (3.14). Install paddle-gpu directly here.

## Data ingest invariants

- **Real data only** for non-Sejm sources (Patronite, manifestos, postcodes). No synthetic fixtures.
- On-demand PDF fetch: `supagraf/enrich/pdf_fetch.py` caches to `~/.cache/supagraf/prints/` with TTL 24h. Do not re-introduce a "PDFs on disk in fixtures/" pattern. The daily itself writes no fixture files either (see Updater).
- `pdf_extracts` table is the durable cache (sha256-keyed extraction text per model_version). A second pass on the same document never re-extracts.
- Hard FK / hard CHECK / provenance / idempotent on every layer. No silent fallbacks. No mocks for production runs (mocks fine in tests).

## Updater (daily)

- `python -m supagraf daily` = `supagraf/sync/` (Sept 2026 rewrite). Incremental: per-resource change detection (server-side `modifiedSince`/`since` where the API has it, `changeDate`/payload diffs against `_stage_*` otherwise), loaders only for dirty resources, `etl_runs` ledger, non-zero exit on any failed step. Full description in `docs/updater.md`.
- Needs migrations **0105** (`etl_runs`, `etl_cursors`, `proceeding_day_gaps`), **0106** (`vote_choice` += `VOTE_VALID`), **0107** (`load_votings` topic fallback), **0108** (per-sitting `load_proceeding` / `load_votings_sitting` / `load_votes_sitting`); refuses to run without 0105. Applied to prod 2026-09-07.
- Heavy whole-term loaders (`load_proceedings`, `load_votes`, matview refreshes) exceed Cloudflare's 100 s limit through PostgREST (504, no commit). The daily avoids them via the per-sitting variants; `--full` / `--skip-fetch` still need `SUPAGRAF_LOAD_DIRECT_DSN` (mixvm).
- In `db-exec` / `exec_sql`, `create function` must be qualified `public.` — the RPC's search_path starts at `pg_catalog`.
- Upstream drift = `sync:<resource> failed … schema:` in `etl_runs`; extend the Pydantic model in `supagraf/schema/`, never loosen `extra="forbid"`. `python -m supagraf db-exec -f <file>` applies SQL through the `exec_sql` RPC.
- No Sejm/ELI data goes through files any more: the capture-to-disk path, the per-resource `stage/*` modules and the per-field print enrichers were removed in Sept 2026. `fixtures <districts|promises|postcodes>` + `stage` remain only for the external sources (districts, postcodes, promises, mp_office_expenses).
- Sejm API facts (verified 2026-09-07): no ETag/Last-Modified, conditional GETs are ignored, no gzip; `/prints` ignores every query param; `processes`, `interpellations`, `writtenQuestions` accept `modifiedSince`; `videos` accepts `since/till`; `/committees/sittings/{date}`; `/eli/changes/acts?since=` returns full details for DU+MP. Transcripts have no change signal and an empty `statements[]` means "not published yet".
- `_stage_*.source_path` carries the upstream URL for rows written by the updater.

## LLM

- **Backend: DeepSeek** (`supagraf/enrich/llm.py`). Needs `DEEPSEEK_API_KEY`. Model defaults live in `supagraf/enrich/__init__.py`.
- **Prints: `deepseek-v4-flash-vision-exp`** (`SUPAGRAF_LLM_MODEL_VISION`, `LLM_MODELS["vision"]`) for every print — flash pricing, 1M ctx, reads images. `pick_model` returns it unless `SUPAGRAF_LLM_MODEL` pins a model or `SUPAGRAF_LLM_ROUTING=pro_flash` re-enables the legacy substantive→`deepseek-v4-pro` / procedural→`deepseek-v4-flash` split. Input budget `SUPAGRAF_PRINT_MAX_INPUT_CHARS` (default 240 000, head+tail trim) — do not reintroduce the 8 000-char cap.
- **Scanned prints → vision OCR** (`supagraf/enrich/vision_ocr.py`): pages rasterized + cut into 3 strips (DeepSeek caps every image at 384 tokens), transcribed to markdown, cached in `pdf_extracts` as `deepseek-v4-flash-vision-exp-ocr-v1`. Tesseract+`pol` is the fallback (`SUPAGRAF_VISION_OCR=0`).
- **Statements (`enrich-utterances`) use `deepseek-v4-flash`** (`SUPAGRAF_UTTERANCE_LLM_MODEL`), `thinking=off`. Do NOT pass `SUPAGRAF_LLM_MODEL` to the utterance job; it clobbers the per-statement default.
- **Thinking**: DeepSeek enables it by default and then ignores `temperature`. `call_structured(thinking="off"|"low"|"high"|"max")`; default `SUPAGRAF_LLM_THINKING=off` everywhere, including prints (`SUPAGRAF_PRINT_THINKING=low` costs ~3× per print). The body key is `thinking: {"type": ...}` + `reasoning_effort` — `reasoning.effort` is the Anthropic-format field and is ignored on this endpoint.
- **402 Insufficient Balance / 401** raise `LLMBudgetError` and stop the whole enrich phase after one call (remaining items stay pending, nothing is counted as failed) — top up at platform.deepseek.com and re-run.
- 429 (concurrency throttle) and 503 are retried; empty JSON-mode content is retried; `usage.prompt_cache_hit_tokens` is logged — keep system prompt + schema first, document last, so the automatic prefix cache hits.
- **Peak pricing** Mon–Fri 01–04 & 06–10 UTC (2× off-peak). Schedule enrichment outside it; `is_deepseek_peak_hour()` warns.
- Enrichment concurrency `SUPAGRAF_ENRICH_WORKERS` (default 4); failure backoff 3 failures / 14 days per print.
- DeepSeek is the only chat backend (gemini/ollama chat paths removed Sept 2026; Ollama still serves embeddings).
- **Default timeout 300 s** (`SUPAGRAF_LLM_TIMEOUT_S`); `SUPAGRAF_LLM_MAX_TOKENS` (default 8192) caps JSON replies.
- Embedding: `qwen3-embedding:0.6b` (Ollama, 639 MB). Native dim 1024 → fits `halfvec(1024)` DB column directly, no padding. Override via `SUPAGRAF_EMBED_MODEL` env or `--model` flag on embed commands. Legacy `nomic-embed-text-v2-moe` (768-d zero-padded) retired Q2 2026; if mixed-model embeddings appear in the table (`SELECT DISTINCT model FROM embeddings`), wipe non-qwen rows before semantic search — vector spaces are not comparable.

## Database

- **Self-hosted Supabase only.** Prod DB is `db.msulawiak.pl` (mixvm). No managed Supabase project is in play — do **not** use Supabase MCP tools or assume cloud-project endpoints; they target unrelated environments and writes go to the wrong DB.
- Python supabase client reads `SUPABASE_URL` / `SUPABASE_KEY` from `.env`; that's the only authoritative target.
- DDL goes through direct psql on mixvm (e.g. `ssh sejm@mixvm.bison-fort.ts.net` then `docker exec` into the postgres container). PostgREST over HTTPS can run queries but not migrations.

## Migrations

- Sequential numbering: 0001..NNNN. Co-existing agents must reserve number ranges to avoid collision. Check `supabase/migrations/` before picking next number.
- **Apply path #1 (preferred — no SSH, no Tailscale):** `POST /rest/v1/rpc/exec_sql` against `db.msulawiak.pl` w/ service-role JWT (`SUPABASE_SECRET_KEY` / `SUPABASE_KEY` in `.env`). RPC defined by migration 0093. CLI wrapper: `uv run python -m supagraf db-exec -f supabase/migrations/NNNN_x.sql` (uses httpx directly — the supabase-py client rejects the RPC's `{"status":"ok"}` reply as an error).
  - Body: `{"query": "<sql>"}` — accepts SELECT (returns jsonb array), DDL/DML (returns `{"status":"ok"}`), and surfaces errors as `{"status":"error","message":...,"sqlstate":...}` instead of HTTP failure.
  - Service-role only; anon/authenticated get `permission denied for function exec_sql`.
  - Defense-in-depth guard blocks `DROP DATABASE`, `DROP SCHEMA public`, `TRUNCATE auth.users` (regex match, not a real sandbox — auth is the actual boundary).
  - PostgREST anon statement timeout is 8 s; service-role bypasses it, so heavy refreshes through this RPC are fine.
- **Apply path #2 (fallback — direct psycopg over Tailscale):** when RPC isn't usable (e.g. installing the RPC itself, or for streaming COPY).
  - Host `mixvm.bison-fort.ts.net:5432`, user `postgres.<POOLER_TENANT_ID>` (Supavisor — plain `postgres` rejects), password in `secrets/supabase_vm.env` (gitignored), `sslmode=disable` (Supavisor on Tailscale doesn't terminate TLS).
  - `uv run --with 'psycopg[binary]'` — the non-binary wheel can't find libpq on Windows.
- **Apply path #3 (last resort — SSH + docker exec):** `ssh sejm@mixvm.bison-fort.ts.net` then `sudo docker exec -i supabase-db psql -U postgres -d postgres`. Use when network paths are blocked.
  - `db.msulawiak.pl:5432` is NOT a path: hostname is behind Cloudflare and only HTTPS is tunneled.
- **Agent pipeline after merging a PR with DDL:** `git pull` → apply via psycopg → `uv run python -m supagraf backfill <name>` → `uv run pytest tests/supagraf/e2e/test_<feature>*.py`. Don't punt to the user once `secrets/supabase_vm.env` is reachable.

## ELI acts (DU + MP)

- `sync acts` reads `/eli/changes/acts?since=` — full act details for **DU** (Dziennik Ustaw) and **MP** (Monitor Polski) in one feed (roughly half of passed Sejm processes culminate in MP entries). Cursor `acts.changes` in `etl_cursors`.
- Stale-ELI gap: Sejm passes day N → President signs N+30 → Dz.U./MP publishes N+45. `supagraf/fetch/acts.py:refresh_stale_eli` re-pulls passed-but-unlinked processes (at most every 7 days each via `processes.last_refreshed_at`), stages any newly referenced act into `_stage_acts` directly, runs `load_acts` + `backfill_process_act_links`. Wired into `daily`.

## Git

- `main` is the only branch. Push per logical commit; rebase on conflict; **never** `--force-push`.
- Push permission may require manual confirmation — surface to user, don't bypass.
