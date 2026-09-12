"""DeepSeek wire format — the parts that cost money when wrong.

Thinking is ON by default upstream and silently ignores `temperature`, so the
request body must say `thinking.type=disabled` unless a reasoning mode is
asked for. 429 is concurrency throttling and must be retried. JSON mode can
legitimately return empty content, which is also a retry, not a failure.
"""
from __future__ import annotations

import base64
import json

import pytest
from pydantic import BaseModel
from tenacity import wait_none

from supagraf.enrich import llm as llm_mod


class Out(BaseModel):
    a: int


class _Resp:
    def __init__(self, status: int, body: dict | None = None, text: str = ""):
        self.status_code = status
        self._body = body
        self.text = text or json.dumps(body or {})

    def json(self):
        if self._body is None:
            raise json.JSONDecodeError("x", "", 0)
        return self._body


def _ok(content: str, usage: dict | None = None) -> _Resp:
    return _Resp(200, {
        "choices": [{"message": {"content": content}}],
        "usage": usage or {
            "prompt_tokens": 100, "completion_tokens": 5,
            "prompt_cache_hit_tokens": 64, "prompt_cache_miss_tokens": 36,
            "completion_tokens_details": {"reasoning_tokens": 0},
        },
    })


@pytest.fixture(autouse=True)
def _env(monkeypatch, tmp_path):
    monkeypatch.setenv("SUPAGRAF_LLM_BACKEND", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.delenv("SUPAGRAF_LLM_THINKING", raising=False)
    monkeypatch.setattr(llm_mod, "DEFAULT_THINKING", "off")
    monkeypatch.setattr(llm_mod._post.retry, "wait", wait_none())
    d = tmp_path / "p"
    d.mkdir()
    (d / "v1.md").write_text("system prompt", encoding="utf-8")
    monkeypatch.setattr(llm_mod, "PROMPTS_DIR", tmp_path)


def _capture(monkeypatch, responses: list):
    calls: list[dict] = []

    def fake_post(url, json, headers, timeout):
        calls.append(json)
        nxt = responses.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return nxt

    monkeypatch.setattr(llm_mod.httpx, "post", fake_post)
    return calls


def test_thinking_off_by_default_sets_disabled_and_temperature(monkeypatch):
    calls = _capture(monkeypatch, [_ok('{"a": 1}')])
    r = llm_mod.call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)
    body = calls[0]
    assert body["thinking"] == {"type": "disabled"}
    assert body["temperature"] == 0.1
    assert "reasoning" not in body  # the old Anthropic-format key
    assert body["response_format"] == {"type": "json_object"}
    assert body["max_tokens"] == llm_mod.DEFAULT_MAX_TOKENS
    assert r.usage.cache_hit_tokens == 64 and r.usage.cache_miss_tokens == 36


def test_thinking_mode_sets_reasoning_effort(monkeypatch):
    calls = _capture(monkeypatch, [_ok('{"a": 1}')])
    llm_mod.call_structured(model="m", prompt_name="p", user_input="u", output_model=Out, thinking="low")
    body = calls[0]
    assert body["thinking"] == {"type": "enabled"}
    assert body["reasoning_effort"] == "low"
    assert "temperature" not in body


def test_unknown_thinking_mode_rejected(monkeypatch):
    _capture(monkeypatch, [])
    with pytest.raises(llm_mod.LLMResponseError, match="thinking mode"):
        llm_mod.call_structured(model="m", prompt_name="p", user_input="u", output_model=Out, thinking="minimal")


def test_schema_first_user_last_for_prefix_cache(monkeypatch):
    calls = _capture(monkeypatch, [_ok('{"a": 1}')])
    llm_mod.call_structured(model="m", prompt_name="p", user_input="DOC", output_model=Out)
    msgs = calls[0]["messages"]
    assert msgs[0]["role"] == "system" and msgs[0]["content"].startswith("system prompt")
    assert "OUTPUT SCHEMA" in msgs[0]["content"]
    assert msgs[-1] == {"role": "user", "content": "DOC"}


def test_429_and_empty_content_are_retried(monkeypatch):
    calls = _capture(monkeypatch, [
        _Resp(429, text="slow down"),
        _ok(""),                       # documented JSON-mode quirk
        _Resp(503, text="overloaded"),
        _ok('{"a": 7}'),
    ])
    r = llm_mod.call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)
    assert r.parsed.a == 7
    assert len(calls) == 4


def test_4xx_not_retried(monkeypatch):
    calls = _capture(monkeypatch, [_Resp(400, text="bad")])
    with pytest.raises(llm_mod.LLMResponseError):
        llm_mod.call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)
    assert len(calls) == 1


def test_images_become_data_url_parts(monkeypatch):
    calls = _capture(monkeypatch, [_ok('{"a": 1}')])
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
    llm_mod.call_structured(model="m", prompt_name="p", user_input="read", output_model=Out, images=[png])
    content = calls[0]["messages"][-1]["content"]
    assert content[0]["type"] == "image_url"
    assert content[0]["image_url"]["url"] == "data:image/png;base64," + base64.b64encode(png).decode()
    assert content[-1] == {"type": "text", "text": "read"}


def test_bad_image_bytes_rejected(monkeypatch):
    _capture(monkeypatch, [])
    with pytest.raises(llm_mod.LLMResponseError, match="PNG/JPEG"):
        llm_mod.call_structured(model="m", prompt_name="p", user_input="u", output_model=Out, images=[b"notanimage"])


def test_prompt_resolution_picks_highest_version_and_pins(monkeypatch, tmp_path):
    d = tmp_path / "q"
    d.mkdir()
    for v in (1, 2, 10):
        (d / f"v{v}.md").write_text(f"prompt v{v}", encoding="utf-8")
    monkeypatch.setattr(llm_mod, "PROMPTS_DIR", tmp_path)
    ref = llm_mod._resolve_prompt("q")
    assert ref.version == 10 and ref.body == "prompt v10" and len(ref.sha256) == 64
    assert llm_mod._resolve_prompt("q", 2).version == 2
    with pytest.raises(FileNotFoundError):
        llm_mod._resolve_prompt("q", 99)
    with pytest.raises(FileNotFoundError):
        llm_mod._resolve_prompt("missing")


def test_schema_mismatch_and_bad_json_are_response_errors(monkeypatch):
    _capture(monkeypatch, [_ok('{"b": 1}')])
    with pytest.raises(llm_mod.LLMResponseError, match="failed Out schema"):
        llm_mod.call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)
    _capture(monkeypatch, [_ok("not json {{")])
    with pytest.raises(llm_mod.LLMResponseError, match="not JSON"):
        llm_mod.call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)


def test_call_vision_text_returns_raw_text(monkeypatch):
    calls = _capture(monkeypatch, [_ok("## Strona\ntekst")])
    text, usage = llm_mod.call_vision_text(
        model="v", system="ocr", user_text="page 1", images=[b"\xff\xd8\xff\x00"],
    )
    assert text == "## Strona\ntekst"
    assert "response_format" not in calls[0]
    assert calls[0]["messages"][-1]["content"][0]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert usage.output_tokens == 5


def test_peak_hour_detection():
    from datetime import datetime, timezone

    assert llm_mod.is_deepseek_peak_hour(datetime(2026, 9, 7, 2, 0, tzinfo=timezone.utc))      # Mon 02:00
    assert llm_mod.is_deepseek_peak_hour(datetime(2026, 9, 7, 9, 59, tzinfo=timezone.utc))
    assert not llm_mod.is_deepseek_peak_hour(datetime(2026, 9, 7, 5, 0, tzinfo=timezone.utc))
    assert not llm_mod.is_deepseek_peak_hour(datetime(2026, 9, 7, 22, 0, tzinfo=timezone.utc))
    assert not llm_mod.is_deepseek_peak_hour(datetime(2026, 9, 5, 2, 0, tzinfo=timezone.utc))   # Sat


def test_402_raises_budget_error_without_retry(monkeypatch):
    calls = _capture(monkeypatch, [_Resp(402, text='{"error":{"message":"Insufficient Balance"}}')])
    with pytest.raises(llm_mod.LLMBudgetError):
        llm_mod.call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)
    assert len(calls) == 1


def test_usage_totals_accumulate_per_call(monkeypatch):
    _capture(monkeypatch, [_ok('{"a": 1}'), _ok('{"a": 2}')])
    before = llm_mod.usage_snapshot()
    llm_mod.call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)
    llm_mod.call_structured(model="m", prompt_name="p", user_input="u", output_model=Out)
    d = llm_mod.usage_since(before)
    assert d["calls"] == 2 and d["input"] == 200 and d["cache_hit"] == 128 and d["output"] == 10


def test_paid_empty_retries_are_counted(monkeypatch):
    _capture(monkeypatch, [_ok(""), _ok('{"a": 1}')])
    before = llm_mod.usage_snapshot()
    llm_mod.call_structured(model="deepseek-flash", prompt_name="p", user_input="u", output_model=Out)
    delta = llm_mod.usage_since(before)
    assert delta["calls"] == 2 and delta["output"] == 10
    assert delta["estimated_usd"] > 0


def test_truncated_response_is_counted_but_not_retried(monkeypatch):
    response = _ok('{"a": 1}')
    response._body["choices"][0]["finish_reason"] = "length"
    calls = _capture(monkeypatch, [response])
    before = llm_mod.usage_snapshot()
    with pytest.raises(llm_mod.LLMResponseError, match="truncated"):
        llm_mod.call_structured(model="deepseek-flash", prompt_name="p", user_input="u", output_model=Out)
    assert len(calls) == 1
    assert llm_mod.usage_since(before)["calls"] == 1


def test_flash_41_price_includes_cache_and_does_not_double_count_reasoning():
    usage = llm_mod.TokenUsage(input_tokens=1_000_000, cache_hit_tokens=500_000,
                               output_tokens=1_000_000, reasoning_tokens=500_000)
    assert llm_mod.estimate_cost_usd(usage, "deepseek-flash", peak=True) == pytest.approx(1.353)
    assert llm_mod.estimate_cost_usd(usage, "deepseek-flash", peak=False) == pytest.approx(0.6765)
    assert llm_mod.estimate_cost_usd(usage, "unknown", peak=False) is None
    assert llm_mod.estimate_cost_usd(llm_mod.TokenUsage(), "deepseek-flash", peak=False) is None
