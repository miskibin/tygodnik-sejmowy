"""Live Ollama smoke test — gated, skipped by default.

Enable by exporting OLLAMA_BASE_URL and RUN_E2E=1. Requires the model named
in LIVE_LLM_MODEL (defaults to qwen3:8b) to be pulled locally.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest
from pydantic import BaseModel

from supagraf.enrich import llm as llm_mod
from supagraf.enrich.llm import call_structured

pytestmark = pytest.mark.skipif(
    not os.environ.get("OLLAMA_BASE_URL") or os.environ.get("RUN_E2E") != "1",
    reason="Set OLLAMA_BASE_URL and RUN_E2E=1 to run live LLM smoke test",
)


class Echo(BaseModel):
    word: str


def test_live_ollama_structured_call(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(llm_mod, "PROMPTS_DIR", tmp_path)
    prompt_dir = tmp_path / "echo"
    prompt_dir.mkdir()
    (prompt_dir / "v1.md").write_text(
        "Return JSON {\"word\": <single-word echo of the user input>}.",
        encoding="utf-8",
    )

    model = os.environ.get("LIVE_LLM_MODEL", "qwen3:8b")
    result = call_structured(
        model=model,
        prompt_name="echo",
        user_input="banana",
        output_model=Echo,
    )
    assert isinstance(result.parsed.word, str)
    assert result.parsed.word.strip()
