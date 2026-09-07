"""Incremental updater (`python -m supagraf daily`).

Replaces the fixture-file pipeline (capture to disk → file-scan stage →
load everything) with a direct upstream → `_stage_*` → selective load flow:

  resources/*   one module per upstream resource; each decides what changed
                (server-side delta params where the API has them, otherwise
                a client-side diff against what `_stage_*` already holds),
                fetches only that, and upserts it.
  loaders.py    maps dirty resources to the SQL load_* chain + matview
                refreshes so a quiet day costs a few list requests and no
                heavy SQL.
  daily.py      the orchestrator: phases, tolerance, run ledger, exit code.
  runlog.py     `etl_runs` ledger + per-step timing/counters.
  http.py       retrying, concurrency-capped httpx client for api.sejm.gov.pl.
  stage.py      `_stage_*` reads/writes + Pydantic contract validation.
  cursors.py    `etl_cursors` high-water marks for delta endpoints.

Upstream facts this package is built on (verified 2026-09-07, see
docs/updater.md): the Sejm API sends no ETag/Last-Modified/Cache-Control and
ignores conditional requests; `processes`, `interpellations`,
`writtenQuestions` accept `modifiedSince`; `videos` accepts `since/till`;
`committees/sittings/{date}` lists every committee's sittings for a day;
`/eli/changes/acts?since=` returns full act details for both publishers;
`prints`, `proceedings`, `MP`, `clubs`, `bills` have no delta filter.
"""
