"""Dedicated legal indexes: exact model digests/dimensions, no padding or truncation."""
from __future__ import annotations

import math
import os
import time
from typing import Callable

import httpx
from postgrest.exceptions import APIError

from supagraf.db import supabase
from supagraf.law.extract import sha256
from supagraf.sync.runlog import RunLedger

MODEL_DIMS = {"qwen3-embedding:0.6b": 1024, "embeddinggemma-2:270m": 768}
MODEL_CONTEXT = {"qwen3-embedding:0.6b": 32768, "embeddinggemma-2:270m": 8192}
QUERY_PREFIX = "Instruct: Given a question about Polish law, retrieve relevant legal provisions.\nQuery: "


def validate_vector(vector: list, dimension: int) -> list[float]:
    if not isinstance(vector, list) or len(vector) != dimension or not all(
        isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) for n in vector
    ):
        raise ValueError("Embedding dimension or numeric contents mismatch; no padding allowed")
    return [float(n) for n in vector]


def embedding_input(unit: dict) -> str:
    return "\n".join([unit["act_title"], *unit["context"], unit["body"]])


def db_request(call: Callable):
    for attempt in range(3):
        try:
            return call()
        except (APIError, httpx.HTTPError) as error:
            if isinstance(error, APIError) and str(error.code) not in {"502", "503", "504", "PGRST002"}:
                raise
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def build_index(*, model: str = "qwen3-embedding:0.6b", limit: int = 0, activate: bool = False) -> dict:
    ledger = RunLedger(kind="law_embed", term=10, args={"model": model, "limit": limit, "activate": activate})
    ledger.start()
    counts = {"model": model, "ok": 0, "skipped": 0, "errors": []}
    try:
        with ledger.step("legal_articles", fatal=True) as step:
            counts = _build_index(model=model, limit=limit, activate=activate)
            step.counts = counts
            if counts["errors"]:
                step.fail("Some legal articles could not be indexed; index was not promoted")
    except Exception as error:
        counts["errors"].append({"type": type(error).__name__})
    finally:
        receipt = ledger.finish()
    counts.update(run_id=receipt["run_id"], status=receipt["status"])
    return counts


def _build_index(*, model: str, limit: int, activate: bool) -> dict:
    if model not in MODEL_DIMS:
        raise ValueError("Unregistered legal embedding model")
    url = (os.environ.get("OLLAMA_BASE_URL") or os.environ.get("OLLAMA_HOST") or "http://localhost:11434").rstrip("/")
    sb = supabase()
    with httpx.Client(timeout=90) as client:
        response = client.get(url + "/api/tags")
        response.raise_for_status()
        metadata = next((m for m in response.json()["models"] if m["name"] == model), None)
        if not metadata or not metadata.get("digest"):
            raise ValueError("Requested model is not installed; existing indexes are preserved")
        prefix = QUERY_PREFIX if model.startswith("qwen3-") else ""
        options = {"num_ctx": MODEL_CONTEXT[model]}
        index_id = sha256(f"{model}|{metadata['digest']}|{MODEL_DIMS[model]}|{prefix}|full-article-v1|context={MODEL_CONTEXT[model]}")
        existing = sb.table("law_embedding_indexes").select("id").eq("id", index_id).execute().data
        if not existing:
            sb.table("law_embedding_indexes").insert({"id": index_id, "model": model, "model_digest": metadata["digest"],
                "dimension": MODEL_DIMS[model], "query_prefix": prefix, "document_prefix": "", "encoder_options": options, "active": False}).execute()
        counts = {"index_id": index_id, "model_digest": metadata["digest"], "model": model, "ok": 0, "reused": 0, "skipped": 0, "errors": []}
        versions = sb.table("law_versions").select("id,root_eli_id,document_date").order("document_date", desc=True).execute().data or []
        selected = {}
        for version in versions:
            selected.setdefault(version["root_eli_id"], version["id"])
        if not selected:
            return counts
        counts["scope_versions"] = list(selected.values())
        offset = 0
        while True:
            units = db_request(lambda: sb.table("law_units_v").select("id,body,body_sha256,context,act_title").in_("version_id", list(selected.values())).order("id").range(offset, offset + 99).execute()).data or []
            if not units:
                break
            stored = db_request(lambda: sb.table("law_unit_embeddings").select("unit_id,body_sha256,input_sha256").eq("index_id", index_id).in_("unit_id", [u["id"] for u in units]).execute()).data or []
            old = {e["unit_id"]: e for e in stored}
            for unit in units:
                if old.get(unit["id"], {}).get("body_sha256") == unit["body_sha256"] and old[unit["id"]].get("input_sha256") == sha256(embedding_input(unit)):
                    counts["skipped"] += 1
                    continue
                if limit and counts["ok"] + len(counts["errors"]) >= limit:
                    return counts
                try:
                    text = embedding_input(unit)
                    input_hash = sha256(text)
                    cached = db_request(lambda: sb.table("law_unit_embeddings").select("vec").eq("index_id", index_id).eq("input_sha256", input_hash).limit(1).execute()).data
                    if cached:
                        import json
                        vector = validate_vector(json.loads(cached[0]["vec"]) if isinstance(cached[0]["vec"], str) else cached[0]["vec"], MODEL_DIMS[model])
                        counts["reused"] += 1
                    else:
                        response = client.post(url + "/api/embed", json={"model": model, "input": text, "truncate": False, "options": options})
                        response.raise_for_status()
                        vector = validate_vector(response.json()["embeddings"][0], MODEL_DIMS[model])
                    db_request(lambda: sb.table("law_unit_embeddings").upsert({"unit_id": unit["id"], "index_id": index_id,
                        "body_sha256": unit["body_sha256"], "input_sha256": input_hash, "vec": "[" + ",".join(str(n) for n in vector) + "]"}).execute())
                    counts["ok"] += 1
                except (APIError, httpx.HTTPError, ValueError, KeyError, IndexError) as error:
                    counts["errors"].append({"unit_id": unit["id"], "type": type(error).__name__})
            offset += len(units)
        if activate and not counts["errors"]:
            # Deliberately refuse model switches through an ingestion flag.
            active = sb.table("law_embedding_indexes").select("id").eq("active", True).execute().data
            if active and active[0]["id"] != index_id:
                raise ValueError("Another index is active; benchmark/explicit promotion required")
            sb.table("law_embedding_indexes").update({"active": True}).eq("id", index_id).execute()
        return counts
