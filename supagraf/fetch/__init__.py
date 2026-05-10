"""Real-data ingest fetchers (api.sejm.gov.pl etc.).

Distinct from supagraf.enrich.* which derives DB columns from already-loaded
rows (LLM/embeddings). Modules in this package go to upstream APIs to fill
gaps in the canonical fixtures + DB rows.
"""
