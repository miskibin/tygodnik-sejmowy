"""Pin LLM default — guards against accidental model swap. Override via
SUPAGRAF_LLM_MODEL env at runtime; the source-of-truth default is gemma4:e4b."""
from __future__ import annotations

import importlib
import os

import supagraf.enrich as enrich_pkg


def test_default_llm_model_is_gemma(monkeypatch):
    monkeypatch.delenv("SUPAGRAF_LLM_MODEL", raising=False)
    importlib.reload(enrich_pkg)
    assert enrich_pkg.DEFAULT_LLM_MODEL == "gemma4:e4b"


def test_default_llm_model_env_override(monkeypatch):
    monkeypatch.setenv("SUPAGRAF_LLM_MODEL", "qwen3:8b")
    importlib.reload(enrich_pkg)
    assert enrich_pkg.DEFAULT_LLM_MODEL == "qwen3:8b"
    # Restore default for downstream tests in same process.
    monkeypatch.delenv("SUPAGRAF_LLM_MODEL", raising=False)
    importlib.reload(enrich_pkg)
