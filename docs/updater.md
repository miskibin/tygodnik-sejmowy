# The updater (`python -m supagraf daily`)

The daily is an incremental sync from api.sejm.gov.pl / ELI into the
self-hosted Supabase, followed by LLM enrichment and embeddings. It was
rewritten in September 2026 (`supagraf/sync/`); the fixture-file pipeline
(`fixtures capture` → `stage` → `load`) still exists for bulk snapshots and
the non-Sejm sources, but the daily no longer touches the filesystem.

```
python -m supagraf daily                    # the cron entrypoint
python -m supagraf daily --only prints --only proceedings --skip-enrich
python -m supagraf daily --full             # ignore cursors/diffs, run every loader
python -m supagraf sync votings proceedings --load   # one resource, then its loaders
python -m supagraf db-exec -f supabase/migrations/0105_etl_runs_cursors.sql
```

Exit code is **0 only when every step succeeded**; 1 when any step failed
(the old daily always exited 0). Every run writes one `etl_runs` row with
per-step timings, counters and errors:

```sql
select id, status, started_at, finished_at, steps from etl_runs order by id desc limit 5;
```

## Phases

| phase | what happens | skipped when |
|---|---|---|
| `schema` | migration 0105 present (`etl_runs`, `etl_cursors`, `proceeding_day_gaps`) | never — refuses to run without it |
| `sync:<resource>` | fetch only what changed upstream, validate against the Pydantic contract, upsert `_stage_*` | `--skip-fetch`, `--only` |
| `sync:mp_photos`, `sync:polls` | photo URL probe, Wikipedia poll scrape | `--only` without them |
| `load` | `load_*` SQL for **dirty resources only**, FK-ordered (`supagraf/sync/loaders.py`) | nothing dirty, `--skip-load` |
| `load:relink_agenda_refs`, `backfill:*` | cheap relinks that depend on what changed | inputs not dirty |
| `enrich:prints` | unified LLM pass on prints without `impact_punch`, `SUPAGRAF_ENRICH_WORKERS` at a time | `--skip-enrich` |
| `enrich:statements` | flash pass on the newest sitting that has un-enriched statements | `--skip-enrich` |
| `enrich:voting_short_title` | last 30 days | `--skip-enrich` |
| `embed:*` | qwen3 embeddings (Ollama) for prints / statements / promises | `--skip-embed`, `SUPAGRAF_DAILY_SKIP_EMBED=1` |
| `refresh` | matviews whose inputs changed | `--skip-load` |

`--skip-fetch` marks every resource dirty (nothing to diff against), which
reproduces the old "reload everything" run.

## How each resource detects change

Verified against the live API on 2026-09-07. The API sends **no ETag,
Last-Modified or Cache-Control** and ignores `If-None-Match` /
`If-Modified-Since`, so HTTP caching is useless; change detection is done
with the delta parameters that exist and client-side diffs otherwise.

| resource | signal | cost of a quiet day |
|---|---|---|
| prints | full `/prints` list (1.8 MB — every query param is ignored upstream), `changeDate` diffed against `_stage_prints.payload->>changeDate`; detail (400 B) only for new/advanced numbers | 1 request |
| processes | `?modifiedSince=<cursor>` (server-side), detail per changed process, detail compared to the stage row so a timestamp-only bump does not trigger `load_processes` | 1 request |
| votings | 8 KB `/votings` index (`votingsNum` per sitting) vs stage count; unsealed votings (captured before vote rows were published) are re-pulled; sealed via `etl_watermarks` | 1 request |
| proceedings | `current=true`, any date inside `--window-days`, not yet staged, or reported by `proceeding_day_gaps()` (a recent day with no statements or statements without bodies). Composes the stage payload from detail + per-day transcripts + statement HTML; **bodies already in `proceeding_statements` are reused, only new statements are fetched**; identical payloads are not rewritten | 1 list request + detail/transcripts for the current sitting |
| committee_sittings | `/committees/sittings/{date}` for each day in `[today-window, today+30]` (60 KB/day), merged by `num` into the per-committee bundle | ~45 requests |
| mps | `/MP` list vs stored detail (the list repeats the detail's fields); detail only on disagreement | 1 request |
| clubs, committees | every detail (12 / 40 rows), written only when changed | 52 requests |
| bills | full list (850 KB, no filter upstream) diffed against stage | 1 request |
| videos | `?since=&till=` from a cursor (full list is 7.5 MB) | 1 request |
| questions | `interpellations` + `writtenQuestions` `?modifiedSince=<cursor>` | 2 requests |
| acts | `/eli/changes/acts?since=<cursor>` — full act details for DU **and** MP in one feed, replaces the year listing + per-act detail loop | 1 request |

Cursors (`etl_cursors`) are only advanced after a resource sync with no
item errors, and a 2 h overlap is subtracted on read, so a crash never
skips a window. Upstream timestamps are Warsaw local time; the cursors
are kept in that space.

Not touched by the daily: districts, postcodes, promises,
mp_office_expenses (external sources — `stage <resource>` + `load`).

Removed with the rewrite (all replaced by `sync <resource> [--full]`):
`backfill-prints`, `backfill-processes`, `fetch proceeding-bodies|committees|
committee-sittings|acts`, `fixtures <sejm resource>` capture, the per-resource
`supagraf/stage/*` modules for Sejm data, the legacy `supagraf/fetch/*`
fetchers, the seven per-field print enrichers (unified covers them), the
gemini/ollama chat backends and the PaddleOCR path.

## Code map

```
supagraf/sync/
  cli.py          daily / sync / db-exec (typer)
  daily.py        phases; `_run(ledger, name, fn)` wraps every step
  context.py      SyncContext: term, api, window, dirty set, changed keys
  http.py         SejmApi: retrying GET, paginate, map (thread pool)
  stage.py        SyncResult + read_index / read_payloads / upsert_rows
  cursors.py      etl_cursors helpers
  loaders.py      LOAD_CHAIN / REFRESH_CHAIN, per-sitting variants
  runlog.py       RunLedger + StepResult (etl_runs)
  resources/
    _common.py    fetch_details() + upsert_changed() — every detail resource is
                  "list → ids to fetch → fetch_details → upsert_changed"
    <resource>.py sync(ctx) -> SyncResult, ~30 lines each
supagraf/enrich/jobs.py        concurrent enrichment + embed jobs
supagraf/enrich/vision_ocr.py  scan → vision transcript
supagraf/backfill/agenda_refs.py  relink queued agenda → print refs
```

Adding a resource: write `resources/<name>.py` with `sync(ctx)`, add the
name to `daily.RESOURCES` and its loader triggers to `loaders.LOAD_CHAIN`.
Tests patch `supagraf.sync.stage`, `supagraf.sync.cursors` and
`supagraf.etl.watermark` (see `tests/supagraf/unit/sync/conftest.py`) and
serve HTTP from an `httpx.MockTransport`.

## Loader plan

No `load_*` function is incremental — each rebuilds its target from the
whole `_stage_*` table for the term. The daily therefore only *calls* the
ones whose inputs changed (`supagraf/sync/loaders.py`), in FK order, with
proceedings loaded after prints/processes so agenda refs resolve the same
day. Matview refreshes are gated the same way: no votings change → no
`refresh_mp_discipline` / atlas refresh.

The two loaders that dominate runtime have per-sitting variants (migration
0108): the sync reports which sittings it wrote and the plan calls
`load_proceeding(term, number)`, `load_votings_sitting(term, sitting)` and
`load_votes_sitting(term, sitting)` for exactly those, instead of rebuilding
75 sittings / 2M vote rows. The whole-term functions remain for `--full` and
`--skip-fetch` (no keys known) — those need `SUPAGRAF_LOAD_DIRECT_DSN`
on mixvm, because through PostgREST they exceed Cloudflare's 100 s gateway
limit and come back as 504 without committing.

Trigger sets list inputs only; FK prerequisites are guaranteed by the chain
order (a new proceeding does not reload the term's votings).

`load_proceeding` writes `body_html`/`body_text` from the payload
unconditionally, which is why the proceedings composer always carries the
bodies the DB already has.

## LLM

* Prints: `deepseek-v4-flash-vision-exp` (`SUPAGRAF_LLM_MODEL_VISION`) for
  every print, text in, JSON out, `thinking=off` (`SUPAGRAF_PRINT_THINKING=low`
  buys ~4k reasoning tokens per print, ≈3× the cost). Input budget is 240 000 chars head+tail
  (`SUPAGRAF_PRINT_MAX_INPUT_CHARS`) — the old 8 000-char cap dropped ~95 %
  of a typical bill. The legacy pro/flash router is behind
  `SUPAGRAF_LLM_ROUTING=pro_flash`.
* Scanned PDFs (no text layer): pages rasterized at 200 DPI, cut into 3
  strips (each image is capped at 384 tokens upstream, whole pages are too
  coarse), transcribed to markdown by the vision model, cached in
  `pdf_extracts` under `deepseek-v4-flash-vision-exp-ocr-v1`. Tesseract+`pol`
  remains the fallback (`SUPAGRAF_VISION_OCR=0` disables vision OCR).
* Statements: `deepseek-v4-flash`, `thinking=off`.
* DeepSeek facts encoded in `supagraf/enrich/llm.py`: thinking is on by
  default and silently ignores `temperature`, so requests carry
  `thinking.type=disabled` unless a mode is asked for; 429 is
  concurrency throttling and is retried; JSON mode can return empty
  content and is retried; prefix caching is automatic — system prompt +
  schema first, document last — and hits are logged from
  `prompt_cache_hit_tokens`.
* **Pricing windows**: peak is Mon–Fri 01:00–04:00 and 06:00–10:00 UTC,
  off-peak is half price. Schedule the cron outside those windows (e.g.
  22:00 UTC); the daily logs a warning when it starts inside one.

Prints that failed 3 times in 14 days are left alone until the window
slides (`SUPAGRAF_ENRICH_FAILURE_BACKOFF_*`); after 8 attachment-fetch
failures in a run the phase aborts (upstream document backend down).

## Applying the migrations

Without SSH/Tailscale, through the service-role RPC:

```
uv run python -m supagraf db-exec -f supabase/migrations/0105_etl_runs_cursors.sql
uv run python -m supagraf db-exec -f supabase/migrations/0106_vote_choice_vote_valid.sql
uv run python -m supagraf db-exec -f supabase/migrations/0107_load_votings_topic_fallback.sql
uv run python -m supagraf db-exec -f supabase/migrations/0108_targeted_loaders.sql
```

0106 adds the `VOTE_VALID` enum value upstream started sending for ON_LIST
votings; 0107 lets `load_votings` fall back to the title when `topic` is
null (elections); 0108 adds the per-sitting loaders. All four were applied
to prod on 2026-09-07 through the RPC. Note the RPC's search_path starts
with `pg_catalog`: `create function` must be schema-qualified (`public.`).

## Upstream schema drift

Every payload is validated against the strict Pydantic contract in
`supagraf/schema/` before it is staged; a drift shows up as
`sync:<resource> failed … schema: … Extra inputs are not permitted` in the
ledger with the row left untouched. Fix = extend the model (optional
field), add a migration only if a loader consumes the new value. Drift
absorbed in the rewrite (2026-09): clubs `members[]`, committee members
`firstName/lastName/joinDate`, MPs `oathDate/mandateExpiryDate`, votes
`VOTE_VALID`.

(then `NOTIFY pgrst, 'reload schema'` via `db-exec -q` if PostgREST reports
PGRST205). Or via psql on mixvm as documented in CLAUDE.md.

## mixvm

`deploy/mixvm/docker-compose.yml` runs `python -m supagraf daily --term 10`
one-shot. Keep `SUPAGRAF_LOAD_DIRECT_DSN` set there — `load_votes`,
`load_proceedings` and the matview refreshes exceed Kong's 60 s upstream
timeout when they run through PostgREST. The `fixtures/` bind mount is no
longer needed by the daily.

## Dashboard

`etl_runs` / `etl_cursors` are also readable from the frontend at
[`/admin/etl`](../frontend/app/admin/etl/page.tsx) — the last run and its
status, a duration strip, one expandable row per run with the full per-step
breakdown (status, duration, counters, error text) plus the run `args`, and a
card listing the delta cursors. Filters `?kind=daily|sync` and
`?limit=25|50|100`.

The page is gated by a single shared password in the frontend's
`ETL_DASHBOARD_PASSWORD` env var (Portainer stack var, see
`deploy/mixvm/docker-compose.frontend.yml`). Unset or empty and the panel is
open without a login (the ledger holds nothing secret). It reads through the
anon key like the rest of the site — strictly read-only.

## First live runs (2026-09-07)

Prod had not completed a daily since 2026-07-28. The rewrite's first pass
from a remote container (through Cloudflare, no direct DSN):

| step | result |
|---|---|
| sync (all resources, cold cursors) | prints 1 303 changed of 3 275 (exactly the upstream `changeDate > 2026-07-28` count), processes 171, votings 148 details, proceedings 63–65 with 1 638 bodies, questions 8 638, acts 5 369, videos 253, bills 86 |
| targeted loads | `load_proceeding` ×3 in 4 s; `load_votes_sitting` ×9 (sitting 1 = 67 613 rows in 8 s) |
| whole-term `load_proceedings` / `load_questions` | 504 after 100 s through Cloudflare (questions committed server-side anyway) — use the per-sitting variants or a direct DSN |
| steady-state daily right after | 93 s, 123 requests / 4.4 MB, 3 prints + 1 committee sitting changed, loaders only for those, refreshes skipped |
| enrichment | 4 prints in 45 s (4 workers, ~4k reasoning tokens each), 20 statements in 17 s; vision OCR of a scanned print: 1 page, 5.6 s, ~1.6k tokens, diacritics and signatures intact |

Backlog left for the next scheduled daily: ~229 prints without enrichment
(new since July) and the remaining statements of sitting 64.
