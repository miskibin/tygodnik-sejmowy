"""DeepSeek client with versioned prompts and structured Pydantic output.

`call_structured` = prompt from supagraf/prompts/<name>/v<n>.md + JSON schema
of the output model in the system turn, `response_format=json_object`, and
Pydantic validation of the reply (DeepSeek has no json_schema mode). The
prompt path + sha256 come back so audit rows trace what produced a row.
`call_vision_text` is the free-text variant used for OCR transcripts.

Facts this code relies on (api-docs.deepseek.com, verified 2026-09):
  * thinking is ON by default and then `temperature` is ignored — we send
    `thinking.type=disabled` unless a reasoning mode is requested;
  * 429 is concurrency throttling, 503 overload — both retried;
  * JSON mode may return empty content — retried;
  * prefix caching is automatic: static prompt + schema first, document
    last; hits are reported in `usage.prompt_cache_hit_tokens`;
  * images: JPEG/PNG/GIF/WebP data URLs in user turns only, ≤384 tokens each.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"
DEFAULT_TIMEOUT_S = float(os.environ.get("SUPAGRAF_LLM_TIMEOUT_S", "300"))
# "off" → thinking disabled (cheapest, temperature honoured); "low"/"high"/"max"
# → reasoning_effort. Global default via SUPAGRAF_LLM_THINKING.
THINKING_MODES = ("off", "low", "high", "max")
DEFAULT_THINKING = os.environ.get("SUPAGRAF_LLM_THINKING", "off").lower()
# Ceiling for a JSON reply so a runaway never eats the 384K output budget.
DEFAULT_MAX_TOKENS = int(os.environ.get("SUPAGRAF_LLM_MAX_TOKENS", "8192"))
# Peak-price windows (UTC, Mon-Fri); off-peak is half price.
PEAK_WINDOWS_UTC = ((1, 4), (6, 10))

T = TypeVar("T", bound=BaseModel)


class LLMHTTPError(Exception):
    """5xx / 429 / network / empty reply — retried."""


class LLMResponseError(Exception):
    """4xx, malformed JSON, schema mismatch — NOT retried."""


class PromptRef(BaseModel):
    name: str
    version: int
    path: Path
    sha256: str
    body: str


class TokenUsage(BaseModel):
    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_hit_tokens: int | None = None
    cache_miss_tokens: int | None = None
    reasoning_tokens: int | None = None


class LLMCall(BaseModel):
    model_config = {"arbitrary_types_allowed": True}
    model: str
    prompt: PromptRef
    parsed: BaseModel
    raw_response: str
    usage: TokenUsage
    model_run_id: int | None = None


def _resolve_prompt(name: str, version: int | None = None) -> PromptRef:
    """Load supagraf/prompts/<name>/v<n>.md. version=None → highest vN found."""
    base = PROMPTS_DIR / name
    files = {int(m.group(1)): p for p in base.glob("v*.md") if (m := re.fullmatch(r"v(\d+)\.md", p.name))}
    if not files:
        raise FileNotFoundError(f"No vN.md prompts in {base}")
    ver = max(files) if version is None else version
    if ver not in files:
        raise FileNotFoundError(base / f"v{ver}.md")
    body = files[ver].read_text(encoding="utf-8")
    return PromptRef(name=name, version=ver, path=files[ver], sha256=hashlib.sha256(body.encode()).hexdigest(), body=body)


def is_deepseek_peak_hour(now: datetime | None = None) -> bool:
    """True when DeepSeek bills at peak rate (weekdays 01-04 & 06-10 UTC)."""
    now = now or datetime.now(timezone.utc)
    return now.weekday() < 5 and any(lo <= now.hour < hi for lo, hi in PEAK_WINDOWS_UTC)


def _api_key() -> str:
    if not os.environ.get("DEEPSEEK_API_KEY"):
        from supagraf.db import load_dotenv
        load_dotenv()
    if not (key := os.environ.get("DEEPSEEK_API_KEY")):
        raise LLMResponseError("DEEPSEEK_API_KEY missing")
    return key


@retry(retry=retry_if_exception_type((LLMHTTPError, httpx.TimeoutException)),
       stop=stop_after_attempt(4), wait=wait_exponential(multiplier=2, min=2, max=30), reraise=True)
def _post(payload: dict, timeout: float) -> dict:
    url = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").rstrip("/") + "/chat/completions"
    try:
        r = httpx.post(url, json=payload, timeout=timeout,
                       headers={"Authorization": f"Bearer {_api_key()}", "Content-Type": "application/json"})
    except httpx.TimeoutException:
        raise
    except httpx.HTTPError as e:
        raise LLMHTTPError(f"transport error: {e!r}") from e
    if r.status_code == 429 or r.status_code >= 500:
        raise LLMHTTPError(f"deepseek {r.status_code}: {r.text[:300]}")
    if r.status_code >= 400:
        raise LLMResponseError(f"deepseek {r.status_code}: {r.text[:300]}")
    body = r.json()
    content = ((body.get("choices") or [{}])[0].get("message") or {}).get("content")
    if not isinstance(content, str) or not content.strip():
        raise LLMHTTPError(f"empty deepseek content: {str(body)[:300]}")
    return body


_MIME = {b"\x89PNG": "image/png", b"\xff\xd8\xff": "image/jpeg", b"RIFF": "image/webp", b"GIF8": "image/gif"}


def _image_part(data: bytes) -> dict:
    mime = next((m for magic, m in _MIME.items() if data.startswith(magic)), None)
    if mime is None:
        raise LLMResponseError("image bytes are not PNG/JPEG/WebP/GIF")
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(data).decode()}"}}


def _chat(*, model: str, messages: list[dict], timeout_s: float, json_mode: bool,
          thinking: str | None, max_tokens: int | None) -> tuple[str, TokenUsage]:
    mode = (thinking or DEFAULT_THINKING).lower()
    if mode not in THINKING_MODES:
        raise LLMResponseError(f"unknown thinking mode {mode!r}; expected one of {THINKING_MODES}")
    payload: dict = {"model": model, "messages": messages, "stream": False,
                     "max_tokens": max_tokens or DEFAULT_MAX_TOKENS}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    if mode == "off":
        payload |= {"thinking": {"type": "disabled"}, "temperature": 0.1}
    else:
        payload |= {"thinking": {"type": "enabled"}, "reasoning_effort": mode}
    body = _post(payload, timeout=timeout_s)
    u = body.get("usage") or {}
    usage = TokenUsage(
        input_tokens=u.get("prompt_tokens"), output_tokens=u.get("completion_tokens"),
        cache_hit_tokens=u.get("prompt_cache_hit_tokens"), cache_miss_tokens=u.get("prompt_cache_miss_tokens"),
        reasoning_tokens=(u.get("completion_tokens_details") or {}).get("reasoning_tokens"),
    )
    return body["choices"][0]["message"]["content"], usage


def _user_content(text: str, images: list[bytes] | None) -> str | list[dict]:
    if not images:
        return text
    return [*map(_image_part, images), {"type": "text", "text": text}]


def call_structured(
    *,
    model: str,
    prompt_name: str,
    user_input: str,
    output_model: type[T],
    prompt_version: int | None = None,
    system_extra: str | None = None,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    images: list[bytes] | None = None,
    thinking: str | None = None,
    max_tokens: int | None = None,
) -> LLMCall:
    """Versioned prompt + Pydantic schema → validated `output_model` instance.

    Raises FileNotFoundError (prompt), LLMHTTPError (after retries),
    LLMResponseError (4xx, non-JSON, schema mismatch).
    """
    prompt = _resolve_prompt(prompt_name, prompt_version)
    schema_block = (
        "\n\n## OUTPUT SCHEMA (must match exactly)\nReply with a single JSON object conforming to "
        "this schema. No markdown, no prose, no fences — just the JSON.\n\n"
        f"```json\n{json.dumps(output_model.model_json_schema(), ensure_ascii=False)}\n```"
    )
    messages = [{"role": "system", "content": prompt.body + schema_block}]
    if system_extra:
        messages.append({"role": "system", "content": system_extra})
    messages.append({"role": "user", "content": _user_content(user_input, images)})
    raw, usage = _chat(model=model, messages=messages, timeout_s=timeout_s, json_mode=True,
                       thinking=thinking, max_tokens=max_tokens)
    try:
        parsed = output_model.model_validate(json.loads(raw))
    except json.JSONDecodeError as e:
        raise LLMResponseError(f"deepseek content is not JSON: {raw[:300]}") from e
    except ValidationError as e:
        raise LLMResponseError(f"response failed {output_model.__name__} schema: {e}") from e
    return LLMCall(model=model, prompt=prompt, parsed=parsed, raw_response=raw, usage=usage)


def call_vision_text(*, model: str, system: str, user_text: str, images: list[bytes],
                     timeout_s: float = DEFAULT_TIMEOUT_S, thinking: str = "off",
                     max_tokens: int | None = None) -> tuple[str, TokenUsage]:
    """Free-text completion over images (OCR transcripts)."""
    if not images:
        raise LLMResponseError("call_vision_text: no images supplied")
    messages = [{"role": "system", "content": system},
                {"role": "user", "content": _user_content(user_text, images)}]
    return _chat(model=model, messages=messages, timeout_s=timeout_s, json_mode=False,
                 thinking=thinking, max_tokens=max_tokens)
