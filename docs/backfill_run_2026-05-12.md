# Sejmograf backfill run — 2026-05-12

Full pipeline backfill on prints since 2025-01-01 + promise re-matching.
Model override: **deepseek-v4-flash forced everywhere** (override
`SUPAGRAF_LLM_MODEL_PRO=deepseek-v4-flash`) — historical content, citizens
unlikely to read these prints in detail, accept flash quality tradeoff.

## Final state

| Table / step | Count |
|---|---|
| prints since 2025 (`change_date >= 2025-01-01`) | 3,052 |
| with `summary` populated | 3,042 (99.7%) |
| with full unified enrichment (`impact_punch` set) | 3,042 (99.7%) |
| with new `title_plus_summary` embeddings | 3,042 (100% of summarised) |
| promise→print candidate links reranked | 1,631 |
| ├ confirmed | 81 |
| ├ candidate (lower confidence) | 427 |
| └ rejected | 1,123 |

Remaining 10 prints (3,052 - 3,042) have no usable PDF/DOCX attachment or
ship as scanned images with zero recoverable text — recoverable only with
manual ingest or improved OCR.

## Cost

| Stage | API calls | Approx tokens (in+out) | Cost |
|---|---|---|---|
| `print_unified` × 2,676 (canary + main + rerun) | 2,676 | ~24M | **~$2.41** |
| `embed_print` × 2,776 (qwen3 local) | 2,776 | n/a (local Ollama) | $0 |
| `match-promises` (cosine over halfvec HNSW) | 0 | 0 | $0 |
| `rerank-promises` × 1,631 candidates via flash | ~258 batched calls | ~5M | **~$0.50** |
| **Grand total** | | | **≈ $2.90** |

Within the $3 budget (margin ~$0.10).

## Wall-clock

| Stage | Start | End | Duration |
|---|---|---|---|
| Canary 50 prints (1 worker) | ~07:00 | ~07:47 | 47 min |
| Main pass (6 workers parallel) | 09:57 | 16:37 | 6h 40min |
| Failure rerun (6 workers) | 16:37 | 17:00 | 22 min |
| Re-embed all (2 workers) | 17:00 | 17:33 | 33 min |
| Embed rerun (1 worker) | 17:33 | 17:37 | 4 min |
| Promise match (sequential) | 17:37 | 17:37 | <1 min |
| Promise rerank (sequential flash) | 17:38 | 18:37 | 59 min |
| **Total wall clock** | | | **~9h 40min** |

## Operational issues encountered + mitigations

1. **PostgREST 1000-row default page** — `_pending_query().execute()` capped at
   1000 rows instead of returning all 2947 pending. Fixed by adding `.range()`
   pagination loop in `scripts/parallel_enrich_prints.py`. Re-runnable.

2. **mixvm Supabase (Tailscale) intermittent `RemoteProtocolError: Server
   disconnected`** under concurrent load. Original 12-worker run had ~50%
   failure rate during startup burst.
   - **Fix 1**: Extended `supagraf/enrich/audit.py` retry to include
     `httpx.RemoteProtocolError`, `ReadError`, `ConnectError`, `TimeoutException`,
     `PoolTimeout` (was APIError-only). Also added retry to `_finish_run`.
   - **Fix 2**: Settled on 6 workers for `print_unified` (was 12) and 2 workers
     for `embed_print` (CPU+DB hybrid load). 1 worker for rerun passes.

3. **sejm.gov.pl 503 outage at ~13:39** for ~5 min — caused a burst of
   ~24 failures in `print_unified`. Recovered automatically; PDF fetches
   resumed. No code change; failed prints picked up on rerun pass.

4. **db.py merge conflict markers** mid-run (introduced by parallel session)
   — resolved by keeping `PROJECT_ID = "mixvm-selfhost"` per CLAUDE.md memory.

5. **Pydantic schema rejections** from flash: 1.5% rate (e.g. `summary_plain
   word count 17 outside [20,300]`, `mentions[3].raw_text` >200 chars).
   These are LLM output-quality issues caught by the validator — schema
   working as intended. Recovered on rerun.

## Code changes shipped this session

- `supagraf/enrich/embed_print.py` — switched passage strategy from
  `summary_only` to `title_plus_summary` (+0.051 nDCG@10 vs baseline per
  earlier eval).
- `supagraf/enrich/audit.py` — broader retry on httpx transport errors,
  retry on `_finish_run`.
- `supagraf/prompts/print_unified/v6.md` — 45% shorter prompt (28.8K →
  15.9K chars), equivalent output quality per A/B eval.
- `scripts/parallel_enrich_prints.py` — paginated parallel runner with
  ThreadPoolExecutor.
- `scripts/embed_eval/` — full eval harness (model × passage strategy
  grid, frozen-vector quality tests).
- Resolved `supagraf/db.py` merge conflict.

## Not done (deferred for next budget)

- **Statements LLM enrichment** (utterance_enrich) — 5,728 statements
  since 2026-01-01 still pending. Estimated $2.77 at flash. Skipped to fit
  within $3 budget.
- **Statement embeddings** — same scope, embed via qwen3 local (free).
  Couples with utterance_enrich since both run from the same pending pool.
- **Failed print backfill** — 10 prints with no recoverable text. Manual
  inspection needed; likely scanned-only with bad Tesseract output.
