<div align="center">

<img src="frontend/public/logo.png" alt="Tygodnik Sejmowy" width="160" />

# Tygodnik Sejmowy

**Weekly digest of Polish parliamentary activity.**
Open data pipeline + Next.js frontend that ingests Sejm + ELI sources,
enriches them with LLM and embeddings, and surfaces what actually
happened in parliament this week — votes, prints, committees, promises,
statements.

[![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-orange.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](pyproject.toml)
[![Next.js](https://img.shields.io/badge/next.js-16-black.svg)](frontend/package.json)
[![Supabase](https://img.shields.io/badge/supabase-postgres%20%2B%20pgvector-3ECF8E.svg)](supabase/)

</div>

---

## What's inside

- **`supagraf/`** — Python ETL: fetches Sejm + ELI fixtures, stages, loads, enriches with Ollama (gemma4:e4b) + nomic embeddings, OCRs scanned prints (pymupdf + tesseract `pol`).
- **`frontend/`** — Next.js 16 app reading directly from Supabase. Routes for atlas, druki, głosowania, komisje, obietnice, sondaże, tygodnik (weekly).
- **`supabase/migrations/`** — sequential SQL migrations.
- **`.agents/skills/polski-proces-legislacyjny/`** — in-repo Claude Code skill covering the Polish legislative process (auto-loads when working in this repo).

## Setup

```bash
cp .env.example .env       # fill in Supabase + LLM creds
uv sync
```

Frontend:

```bash
cd frontend
cp .env.local.example .env.local
pnpm install
pnpm dev
```

## Fixtures

```bash
# everything (term 10, year 2026), small binary samples per resource
uv run python -m supagraf fixtures all --binary-cap 5

# JSON only
uv run python -m supagraf fixtures all --no-binaries

# one resource
uv run python -m supagraf fixtures votings --limit 50
uv run python -m supagraf fixtures prints --binary-cap 3
```

JSON is git-tracked; PDFs / images / HTML transcripts are gitignored.

## Ingest pipeline

```bash
uv run python -m supagraf stage      # stage fixtures into _stage_* tables
uv run python -m supagraf load       # SQL load functions (idempotent)
uv run python -m supagraf run-all    # both
uv run python -m supagraf daily      # full incremental: fetch -> stage -> load -> enrich -> embed
```

Migrations live under `supabase/migrations/`, applied via Supabase CLI or
MCP `apply_migration`.

## Tests

```bash
uv run pytest tests/supagraf -q --ignore=tests/supagraf/e2e
RUN_E2E=1 uv run pytest tests/supagraf/e2e -q   # hits live Supabase
```

See [docs/v1-skeleton-findings.md](docs/v1-skeleton-findings.md) for the
v1 skeleton run report and data-quality findings.

## Working with Claude Code

The repo ships an in-repo skill at
[`.agents/skills/polski-proces-legislacyjny/`](.agents/skills/polski-proces-legislacyjny/)
covering initiative types, three readings, committee work, Senate stage,
President decisions, and Dz.U. publication. Claude Code auto-loads it.

To re-fetch optional Supabase/Postgres dev skills:

```bash
npx skills add supabase/agent-skills
```

## License

[PolyForm Noncommercial License 1.0.0](LICENSE) — source-available, free
for noncommercial, personal, research, and nonprofit use. Commercial use
requires a separate agreement.

Pre-OSS development history (340 commits) lives in the original private
repository at `github.com/miskibin/sejmograf`.
