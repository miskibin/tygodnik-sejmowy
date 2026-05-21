"""Pin LLM default — guards against accidental model swap. Override via
SUPAGRAF_LLM_MODEL env at runtime; the source-of-truth default is gemma4:e4b.

OBSOLETE: the default backend migrated from ollama/gemma4:e4b to deepseek
with a per-print pro/flash picker (see supagraf/enrich/__init__.py and
print_unified.pick_model). Asserting `DEFAULT_LLM_MODEL == "gemma4:e4b"`
no longer pins anything meaningful. The `importlib.reload(enrich_pkg)`
trick also resets the `enrich` attribute on the `supagraf` package
mid-suite, breaking downstream `unittest.mock.patch("supagraf.enrich.X")`
lookups and turning otherwise-isolated tests into order-dependent flakes.
Skipping the whole module is the right move until rewritten against the
deepseek pro/flash defaults.
"""
from __future__ import annotations

import pytest

pytest.skip(
    "Legacy ollama-default pin; needs rewrite against the deepseek pro/flash "
    "picker (see supagraf/enrich/__init__.py).",
    allow_module_level=True,
)


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
