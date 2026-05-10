"""Unit tests for supagraf.enrich.llm — mock httpx.post and prompt dir."""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
from pydantic import BaseModel, ConfigDict
from tenacity import wait_none

from supagraf.enrich import llm as llm_mod
from supagraf.enrich.llm import (
    LLMHTTPError,
    LLMResponseError,
    call_structured,
)


class Out(BaseModel):
    summary: str
    short_title: str


class StrictOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str


@pytest.fixture
def prompts_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect PROMPTS_DIR to a tmp tree per test."""
    monkeypatch.setattr(llm_mod, "PROMPTS_DIR", tmp_path)
    return tmp_path


@pytest.fixture(autouse=True)
def no_retry_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    """Eliminate tenacity backoff delay so retry tests run fast."""
    monkeypatch.setattr(llm_mod._post_chat.retry, "wait", wait_none())


def _make_prompt(prompts_dir: Path, name: str, versions: list[int]) -> Path:
    d = prompts_dir / name
    d.mkdir(parents=True, exist_ok=True)
    for v in versions:
        (d / f"v{v}.md").write_text(f"prompt v{v}", encoding="utf-8")
    return d


class _FakeResponse:
    def __init__(
        self, status_code: int, json_body: dict | None = None, text: str = ""
    ):
        self.status_code = status_code
        self._json = json_body
        self.text = text or (json.dumps(json_body) if json_body is not None else "")

    def json(self):
        if self._json is None:
            raise json.JSONDecodeError("no json", "", 0)
        return self._json


def _ok_chat(content_obj: dict) -> _FakeResponse:
    return _FakeResponse(200, {"message": {"content": json.dumps(content_obj)}})


def test_happy_path(prompts_dir, monkeypatch):
    _make_prompt(prompts_dir, "summarize", [1])
    calls = []

    def fake_post(url, json, timeout):
        calls.append((url, json, timeout))
        return _ok_chat({"summary": "x", "short_title": "y"})

    monkeypatch.setattr(llm_mod.httpx, "post", fake_post)
    result = call_structured(
        model="qwen3:8b",
        prompt_name="summarize",
        user_input="hello",
        output_model=Out,
    )
    assert result.parsed == Out(summary="x", short_title="y")
    assert result.model_run_id is None
    assert result.prompt.version == 1
    assert result.prompt.sha256 and len(result.prompt.sha256) == 64
    assert len(calls) == 1
    assert calls[0][1]["format"] == Out.model_json_schema()


def test_versioned_prompt_picks_highest(prompts_dir, monkeypatch):
    _make_prompt(prompts_dir, "p", [1, 2, 10])
    monkeypatch.setattr(
        llm_mod.httpx, "post",
        lambda url, json, timeout: _ok_chat({"summary": "x", "short_title": "y"}),
    )
    r = call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)
    assert r.prompt.version == 10


def test_specific_version_pin(prompts_dir, monkeypatch):
    _make_prompt(prompts_dir, "p", [1, 2])
    monkeypatch.setattr(
        llm_mod.httpx, "post",
        lambda url, json, timeout: _ok_chat({"summary": "x", "short_title": "y"}),
    )
    r = call_structured(
        model="m", prompt_name="p", user_input="u",
        output_model=Out, prompt_version=1,
    )
    assert r.prompt.version == 1


def test_missing_pinned_version_raises(prompts_dir):
    _make_prompt(prompts_dir, "p", [1])
    with pytest.raises(FileNotFoundError):
        call_structured(
            model="m", prompt_name="p", user_input="u",
            output_model=Out, prompt_version=99,
        )


def test_prompt_not_found(prompts_dir):
    with pytest.raises(FileNotFoundError):
        call_structured(
            model="m", prompt_name="nope", user_input="u", output_model=Out
        )


def test_5xx_retries_and_succeeds(prompts_dir, monkeypatch):
    _make_prompt(prompts_dir, "p", [1])
    seq = [
        _FakeResponse(500, text="boom1"),
        _FakeResponse(503, text="boom2"),
        _ok_chat({"summary": "ok", "short_title": "t"}),
    ]
    calls = {"n": 0}

    def fake_post(url, json, timeout):
        calls["n"] += 1
        return seq.pop(0)

    monkeypatch.setattr(llm_mod.httpx, "post", fake_post)
    r = call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)
    assert r.parsed.summary == "ok"
    assert calls["n"] == 3


def test_5xx_exhausted(prompts_dir, monkeypatch):
    _make_prompt(prompts_dir, "p", [1])
    calls = {"n": 0}

    def fake_post(url, json, timeout):
        calls["n"] += 1
        return _FakeResponse(500, text="boom")

    monkeypatch.setattr(llm_mod.httpx, "post", fake_post)
    with pytest.raises(LLMHTTPError):
        call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)
    assert calls["n"] == 3


def test_4xx_no_retry(prompts_dir, monkeypatch):
    _make_prompt(prompts_dir, "p", [1])
    calls = {"n": 0}

    def fake_post(url, json, timeout):
        calls["n"] += 1
        return _FakeResponse(401, text="unauth")

    monkeypatch.setattr(llm_mod.httpx, "post", fake_post)
    with pytest.raises(LLMResponseError):
        call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)
    assert calls["n"] == 1


def test_timeout_retries_and_succeeds(prompts_dir, monkeypatch):
    _make_prompt(prompts_dir, "p", [1])
    seq: list = [
        httpx.TimeoutException("t1"),
        _ok_chat({"summary": "ok", "short_title": "t"}),
    ]
    calls = {"n": 0}

    def fake_post(url, json, timeout):
        calls["n"] += 1
        nxt = seq.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return nxt

    monkeypatch.setattr(llm_mod.httpx, "post", fake_post)
    r = call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)
    assert r.parsed.summary == "ok"
    assert calls["n"] == 2


def test_timeout_exhausted(prompts_dir, monkeypatch):
    _make_prompt(prompts_dir, "p", [1])
    calls = {"n": 0}

    def fake_post(url, json, timeout):
        calls["n"] += 1
        raise httpx.TimeoutException("nope")

    monkeypatch.setattr(llm_mod.httpx, "post", fake_post)
    with pytest.raises(httpx.TimeoutException):
        call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)
    assert calls["n"] == 3


def test_malformed_json_content(prompts_dir, monkeypatch):
    _make_prompt(prompts_dir, "p", [1])
    monkeypatch.setattr(
        llm_mod.httpx, "post",
        lambda url, json, timeout: _FakeResponse(
            200, {"message": {"content": "not json {{"}}
        ),
    )
    with pytest.raises(LLMResponseError, match="not JSON"):
        call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)


def test_missing_message_field(prompts_dir, monkeypatch):
    _make_prompt(prompts_dir, "p", [1])
    monkeypatch.setattr(
        llm_mod.httpx, "post",
        lambda url, json, timeout: _FakeResponse(200, {"foo": "bar"}),
    )
    with pytest.raises(LLMResponseError, match="missing message.content"):
        call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)


def test_schema_mismatch_missing_field(prompts_dir, monkeypatch):
    _make_prompt(prompts_dir, "p", [1])
    monkeypatch.setattr(
        llm_mod.httpx, "post",
        lambda url, json, timeout: _ok_chat({"summary": "x"}),
    )
    with pytest.raises(LLMResponseError, match="failed Out schema"):
        call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)


def test_schema_mismatch_extra_field_when_forbidden(prompts_dir, monkeypatch):
    _make_prompt(prompts_dir, "p", [1])
    monkeypatch.setattr(
        llm_mod.httpx, "post",
        lambda url, json, timeout: _ok_chat({"summary": "x", "junk": 1}),
    )
    with pytest.raises(LLMResponseError, match="failed StrictOut schema"):
        call_structured(
            model="m", prompt_name="p", user_input="u", output_model=StrictOut
        )
