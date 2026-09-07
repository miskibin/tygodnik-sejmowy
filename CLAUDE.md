# supagraf — agent notes

Per-project conventions for Claude Code agents (and humans). Not user-facing docs.

## GPU / CUDA

- Hardware: **NVIDIA GeForce RTX 5060 Ti, 16 GB VRAM** (per `nvidia-smi`).
- Driver / CUDA: driver 591.44, CUDA 13.1 (driver-supported runtime); toolkit 13.0 installed.
- Reference working CUDA env: `D:\SIMFACTOR_CLAUDE\.venv` runs PyTorch `2.12.0.dev+cu128` (Python 3.14) — proves CUDA 12.x runtime works system-wide. Do not break that venv.

### PDF/DOCX extraction stack (current)

Three-path dispatch in `supagraf/enrich/pdf.py`:

1. **`.docx` → python-docx** — Sejm prints often ship .docx alongside the signed-PDF; CLI prefers .docx (clean text, no OCR). ~174/543 prints have .docx.
2. **`.pdf` digital → pymupdf4llm** — markdown output (## headings, **bold**, lists). Detects scans via per-page text probe before invoking pymupdf4llm so its internal English-Tesseract auto-OCR doesn't destroy Polish diacritics.
3. **`.pdf` scan → Tesseract + `pol`** — auto-fallback when pymupdf returns 0 chars. Rasterizes pages via pymupdf at 300 DPI, OCRs with Polish traineddata. Plain text output (no markdown). ~140/543 prints affected.

Tesseract install: v5.5.0 from UB Mannheim Win build at `C:\Program Files\Tesseract-OCR`. `pol` traineddata pre-installed. `pytesseract` wraps it from Python.

LightOnOCR-1B / Marker / Surya / paddle were all rejected for scanned-PDF OCR: GPU-bound transformer models risk repeating the paddle deadlock disaster (multi-GB VRAM, ~30s+ cold start, silent wedges) for marginal markdown-on-scans gain. Sejm scans are mostly 1-page transmittal letters where heading structure is minimal.

### Legacy: PaddleOCR (escape hatch behind env flag)

`SUPAGRAF_PDF_BACKEND=paddle` re-enables the old PaddleOCR-VL-1.5 path. Heavy: ~6 GB VRAM, deadlocks ~1 in 5 PDFs (watchdog at 180 s catches). Kept only for cases where layout-aware multi-column OCR is genuinely needed.

- Install: **`paddlepaddle-gpu==3.3.1` from `cu130` wheel index** (`https://www.paddlepaddle.org.cn/packages/stable/cu130/`). RTX 50-series is **Blackwell sm_120**; the cu126 wheel only ships kernels through sm_90 → `cudaErrorNoKernelImageForDevice`.
- Verify: `import paddle; paddle.is_compiled_with_cuda()` must return `True`.

### sejmograf venv

- `D:\sejmograf\.venv` is Python **3.10**. Cannot share with SIMFACTOR_CLAUDE (3.14). Install paddle-gpu directly here.

## Data ingest invariants

- **Real data only** for non-Sejm sources (Patronite, manifestos, postcodes). No synthetic fixtures.
- On-demand PDF fetch: `supagraf/enrich/pdf_fetch.py` caches to `~/.cache/supagraf/prints/` with TTL 24h. Do not re-introduce a "PDFs on disk in fixtures/" pattern. The daily itself writes no fixture files either (see Updater).
- `pdf_extracts` table is the durable cache (sha256-keyed paddle markdown). Second enricher on same print reuses, no re-paddle.
- Hard FK / hard CHECK / provenance / idempotent on every layer. No silent fallbacks. No mocks for production runs (mocks fine in tests).

## Updater (daily)

- `python -m supagraf daily` = `supagraf/sync/` (Sept 2026 rewrite). Incremental: per-resource change detection (server-side `modifiedSince`/`since` where the API has it, `changeDate`/payload diffs against `_stage_*` otherwise), loaders only for dirty resources, `etl_runs` ledger, non-zero exit on any failed step. Full description in `docs/updater.md`.
- Needs migration **0105** (`etl_runs`, `etl_cursors`, `proceeding_day_gaps`); refuses to run without it. `python -m supagraf db-exec -f <file>` applies SQL through the `exec_sql` RPC.
- The daily writes no fixture files. `fixtures capture` / `stage` remain for bulk snapshots and the external sources (districts, postcodes, promises, mp_office_expenses).
- Sejm API facts (verified 2026-09-07): no ETag/Last-Modified, conditional GETs are ignored, no gzip; `/prints` ignores every query param; `processes`, `interpellations`, `writtenQuestions` accept `modifiedSince`; `videos` accepts `since/till`; `/committees/sittings/{date}`; `/eli/changes/acts?since=` returns full details for DU+MP. Transcripts have no change signal and an empty `statements[]` means "not published yet".
- `_stage_*.source_path` carries the upstream URL for rows written by the updater.

## LLM

- **Default backend: `deepseek`** (`SUPAGRAF_LLM_BACKEND=deepseek`). Needs `DEEPSEEK_API_KEY`. Code defaults live in `supagraf/enrich/__init__.py`.
- **Prints: `deepseek-v4-flash-vision-exp`** (`SUPAGRAF_LLM_MODEL_VISION`, `LLM_MODELS["vision"]`) for every print — flash pricing, 1M ctx, reads images. `pick_model` returns it unless `SUPAGRAF_LLM_MODEL` pins a model or `SUPAGRAF_LLM_ROUTING=pro_flash` re-enables the legacy substantive→`deepseek-v4-pro` / procedural→`deepseek-v4-flash` split. Input budget `SUPAGRAF_PRINT_MAX_INPUT_CHARS` (default 240 000, head+tail trim) — do not reintroduce the 8 000-char cap.
- **Scanned prints → vision OCR** (`supagraf/enrich/vision_ocr.py`): pages rasterized + cut into 3 strips (DeepSeek caps every image at 384 tokens), transcribed to markdown, cached in `pdf_extracts` as `deepseek-v4-flash-vision-exp-ocr-v1`. Tesseract+`pol` is the fallback (`SUPAGRAF_VISION_OCR=0`).
- **Statements (`enrich-utterances`) use `deepseek-v4-flash`** (`SUPAGRAF_UTTERANCE_LLM_MODEL`), `thinking=off`. Do NOT pass `SUPAGRAF_LLM_MODEL` to the utterance job; it clobbers the per-statement default.
- **Thinking**: DeepSeek enables it by default and then ignores `temperature`. `call_structured(thinking="off"|"low"|"high"|"max")`; default `SUPAGRAF_LLM_THINKING=off`, prints use `SUPAGRAF_PRINT_THINKING=low`. The body key is `thinking: {"type": ...}` + `reasoning_effort` — `reasoning.effort` is the Anthropic-format field and is ignored on this endpoint.
- 429 (concurrency throttle) and 503 are retried; empty JSON-mode content is retried; `usage.prompt_cache_hit_tokens` is logged — keep system prompt + schema first, document last, so the automatic prefix cache hits.
- **Peak pricing** Mon–Fri 01–04 & 06–10 UTC (2× off-peak). Schedule enrichment outside it; `is_deepseek_peak_hour()` warns.
- Enrichment concurrency `SUPAGRAF_ENRICH_WORKERS` (default 4); failure backoff 3 failures / 14 days per print.
- Alternative backends behind `SUPAGRAF_LLM_BACKEND`: `gemini` (needs `GOOGLE_API_KEY`) and `ollama` (legacy local). Images are deepseek-only.
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

- `supagraf/fetch/acts.py` fetches both **DU** (Dziennik Ustaw) and **MP** (Monitor Polski) by default — `--publisher both`. Roughly half of passed Sejm processes culminate in MP entries, not DU; fetching only DU leaves those processes with `eli` set but `eli_act_id=null`.
- Fixtures: `fixtures/sejm/eli/{publisher}/{year}/{pos}.json`. Stage iterates per-publisher; load is publisher-agnostic (acts table keyed on `(publisher, year, position)`).
- Stale-ELI gap: Sejm passes day N → President signs N+30 → Dz.U./MP publishes N+45. Daily fetch before publication leaves `eli_act_id` null. `uv run python -m supagraf refresh-stale-eli --term 10` re-pulls the upstream process JSON for passed-but-unlinked processes, fetches the single ELI act detail, and runs `backfill_process_act_links`. Wired into `daily` after the regular backfill — tolerant (logs error, doesn't crash).

## Git

- `main` is the only branch. Push per logical commit; rebase on conflict; **never** `--force-push`.
- Push permission may require manual confirmation — surface to user, don't bypass.
