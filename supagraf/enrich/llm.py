"""LLM client with versioned prompts and structured Pydantic output.

Three backends share one interface (`call_structured`):

- **deepseek** (default) — OpenAI-compatible chat completions. JSON mode via
  `response_format={"type":"json_object"}` (DeepSeek has no json_schema
  mode, so the Pydantic schema is embedded in the system prompt and the
  reply is validated post-hoc). Supports image content parts for the
  `deepseek-v4-flash-vision-exp` model (`images=` kwarg / `call_vision_text`).
- **ollama** — local HTTP /api/chat with `format=<JSON Schema>`.
- **gemini** — Google GenAI SDK with `response_schema=<pydantic>`,
  `response_mime_type="application/json"`.

Backend chosen via `SUPAGRAF_LLM_BACKEND` env (or `backend=` kwarg).
Schema mismatch is fatal — every job declares a Pydantic model and the
response MUST validate. No silent coercion, no defaults filled in.

Prompt versioning unchanged: prompts at supagraf/prompts/<name>/v<n>.md.
Path + sha256 returned so audit rows (B5 decorator) trace exactly which
prompt produced which row.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Type, TypeVar

import httpx
from pydantic import BaseModel, ValidationError
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"
DEFAULT_TIMEOUT_S = float(os.environ.get("SUPAGRAF_LLM_TIMEOUT_S", "300.0"))

T = TypeVar("T", bound=BaseModel)


class LLMHTTPError(Exception):
    """5xx / network / transient — retried by tenacity."""


class LLMResponseError(Exception):
    """4xx, malformed JSON, schema mismatch — NOT retried."""


@dataclass(frozen=True)
class PromptRef:
    name: str
    version: int
    path: Path
    sha256: str
    body: str


@dataclass(frozen=True)
class TokenUsage:
    input_tokens: int | None
    output_tokens: int | None
    # DeepSeek-only extras (None on other backends). Cache hits are billed at
    # ~3% of the miss price, so these are the numbers to watch when tuning
    # prompt layout (static prefix first, per-document body last).
    cache_hit_tokens: int | None = None
    cache_miss_tokens: int | None = None
    reasoning_tokens: int | None = None


@dataclass(frozen=True)
class LLMCall:
    model: str
    backend: str
    prompt: PromptRef
    parsed: BaseModel
    raw_response: str
    usage: TokenUsage
    # B5 decorator fills this; standalone calls leave None.
    model_run_id: int | None


def _resolve_prompt(name: str, version: int | None = None) -> PromptRef:
    """Load supagraf/prompts/<name>/v<n>.md. version=None → highest vN found."""
    base = PROMPTS_DIR / name
    if not base.is_dir():
        raise FileNotFoundError(f"Prompt directory not found: {base}")
    files = sorted(base.glob("v*.md"))
    valid = [(p, m) for p in files if (m := re.match(r"v(\d+)\.md$", p.name))]
    if not valid:
        raise FileNotFoundError(f"No vN.md files in {base}")
    if version is None:
        chosen, match = max(valid, key=lambda pm: int(pm[1].group(1)))
    else:
        chosen = base / f"v{version}.md"
        if not chosen.exists():
            raise FileNotFoundError(chosen)
        match = re.match(r"v(\d+)\.md$", chosen.name)
    body = chosen.read_text(encoding="utf-8")
    sha = hashlib.sha256(body.encode("utf-8")).hexdigest()
    ver_int = int(match.group(1))
    return PromptRef(name=name, version=ver_int, path=chosen, sha256=sha, body=body)


# ---- Ollama backend ---------------------------------------------------------


def _ollama_url() -> str:
    return os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")


@retry(
    retry=retry_if_exception_type((LLMHTTPError, httpx.TimeoutException)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def _post_chat(payload: dict, timeout: float) -> dict:
    url = f"{_ollama_url()}/api/chat"
    try:
        r = httpx.post(url, json=payload, timeout=timeout)
    except httpx.TimeoutException:
        raise
    except httpx.HTTPError as e:
        raise LLMHTTPError(f"transport error: {e!r}") from e
    if 500 <= r.status_code < 600:
        raise LLMHTTPError(f"ollama {r.status_code}: {r.text[:300]}")
    if r.status_code >= 400:
        raise LLMResponseError(f"ollama {r.status_code}: {r.text[:300]}")
    try:
        return r.json()
    except json.JSONDecodeError as e:
        raise LLMResponseError(f"non-JSON response: {e!r}") from e


def _call_ollama(
    *,
    model: str,
    prompt: PromptRef,
    user_input: str,
    output_model: Type[T],
    system_extra: str | None,
    timeout_s: float,
) -> tuple[T, str, TokenUsage]:
    schema = output_model.model_json_schema()
    messages = [{"role": "system", "content": prompt.body}]
    if system_extra:
        messages.append({"role": "system", "content": system_extra})
    messages.append({"role": "user", "content": user_input})

    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "format": schema,
        "options": {"temperature": 0.1},
    }
    response = _post_chat(payload, timeout=timeout_s)
    raw = (response.get("message") or {}).get("content")
    if not isinstance(raw, str) or not raw.strip():
        raise LLMResponseError(f"missing message.content in response: {response!r}")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise LLMResponseError(f"content is not JSON: {raw[:300]}") from e
    try:
        parsed = output_model.model_validate(data)
    except ValidationError as e:
        raise LLMResponseError(
            f"response failed {output_model.__name__} schema: {e}"
        ) from e
    usage = TokenUsage(
        input_tokens=response.get("prompt_eval_count"),
        output_tokens=response.get("eval_count"),
    )
    return parsed, raw, usage


# ---- DeepSeek backend -------------------------------------------------------
#
# DeepSeek API is OpenAI-compatible. Bare httpx keeps the dependency surface
# identical to the Ollama path. Facts this code relies on (api-docs.deepseek.com,
# verified 2026-09):
#   * `response_format={"type":"json_object"}` is the only structured mode —
#     the schema goes into the system prompt, Pydantic validates the reply.
#     JSON mode "may occasionally return empty content" → treated as a
#     retryable condition below.
#   * Thinking is ON by default. `thinking={"type":"disabled"}` turns it off;
#     `reasoning_effort` ∈ {low, high, max}. While thinking is enabled,
#     `temperature` is silently ignored. (The old `reasoning={"effort":
#     "minimal"}` body key was the *Anthropic*-format field and never did
#     anything on this endpoint — pro calls were running at effort=high.)
#   * Rate limiting is concurrency-based (flash/vision 2500, pro 500) and
#     surfaces as 429; 503 = overloaded. Both are retried with backoff.
#   * Prefix caching is automatic; usage carries prompt_cache_hit_tokens /
#     prompt_cache_miss_tokens.
#   * Vision: images only in user messages, as `image_url` data URLs
#     (JPEG/PNG/GIF/WebP, sniffed by content), ≤600 per request, each image
#     costs ≤384 tokens regardless of resolution.


def _deepseek_url() -> str:
    return os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").rstrip("/")


def _deepseek_api_key() -> str:
    key = os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        from supagraf.db import load_dotenv
        load_dotenv()
        key = os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        raise LLMResponseError(
            "DEEPSEEK_API_KEY missing — required for deepseek backend"
        )
    return key


# "off" → thinking disabled (temperature honoured, cheapest, deterministic
# enough for extraction). "low"/"high"/"max" → thinking enabled at that
# reasoning_effort. Per-call override via `thinking=`; job-level defaults in
# the enrichers; global default via SUPAGRAF_LLM_THINKING.
THINKING_MODES = ("off", "low", "high", "max")
DEFAULT_THINKING = os.environ.get("SUPAGRAF_LLM_THINKING", "off").lower()
# JSON mode needs an explicit ceiling so a runaway reply cannot eat the
# 384K max-output budget; our largest schema (print_unified) is ~2K tokens.
DEFAULT_MAX_TOKENS = int(os.environ.get("SUPAGRAF_LLM_MAX_TOKENS", "8192"))
# Peak-price windows (UTC, Mon-Fri) — off-peak is half price. Only used for
# the warning in `is_deepseek_peak_hour`; scheduling is the operator's call.
_PEAK_WINDOWS_UTC = ((1, 4), (6, 10))


def is_deepseek_peak_hour(now=None) -> bool:
    """True when DeepSeek bills at peak rate (weekdays 01-04 & 06-10 UTC)."""
    from datetime import datetime, timezone

    now = now or datetime.now(timezone.utc)
    if now.weekday() >= 5:
        return False
    return any(lo <= now.hour < hi for lo, hi in _PEAK_WINDOWS_UTC)


class _EmptyContent(LLMHTTPError):
    """JSON-mode reply with empty content — documented DeepSeek quirk, retry."""


@retry(
    retry=retry_if_exception_type((LLMHTTPError, httpx.TimeoutException)),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    reraise=True,
)
def _post_deepseek(payload: dict, timeout: float) -> dict:
    url = f"{_deepseek_url()}/chat/completions"
    headers = {
        "Authorization": f"Bearer {_deepseek_api_key()}",
        "Content-Type": "application/json",
    }
    try:
        r = httpx.post(url, json=payload, headers=headers, timeout=timeout)
    except httpx.TimeoutException:
        raise
    except httpx.HTTPError as e:
        raise LLMHTTPError(f"transport error: {e!r}") from e
    if r.status_code == 429 or 500 <= r.status_code < 600:
        raise LLMHTTPError(f"deepseek {r.status_code}: {r.text[:300]}")
    if r.status_code >= 400:
        raise LLMResponseError(f"deepseek {r.status_code}: {r.text[:300]}")
    try:
        body = r.json()
    except json.JSONDecodeError as e:
        raise LLMResponseError(f"non-JSON response: {e!r}") from e
    choices = body.get("choices") or []
    if not choices:
        raise LLMResponseError(f"missing choices in deepseek response: {body!r}")
    content = ((choices[0] or {}).get("message") or {}).get("content")
    if not isinstance(content, str) or not content.strip():
        # Documented: JSON mode "may occasionally return empty content".
        # Retrying is the only sane response; give up after the retry budget.
        raise _EmptyContent(f"empty deepseek content: {str(body)[:300]}")
    return body


def _image_part(data: bytes) -> dict:
    """OpenAI-style image content part from raw PNG/JPEG bytes."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        mime = "image/png"
    elif data[:3] == b"\xff\xd8\xff":
        mime = "image/jpeg"
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        mime = "image/webp"
    elif data[:6] in (b"GIF87a", b"GIF89a"):
        mime = "image/gif"
    else:
        raise LLMResponseError("image bytes are not PNG/JPEG/WebP/GIF")
    b64 = base64.b64encode(data).decode("ascii")
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}


def _user_content(text: str, images: list[bytes] | None) -> str | list[dict]:
    if not images:
        return text
    parts: list[dict] = [_image_part(img) for img in images]
    parts.append({"type": "text", "text": text})
    return parts


def _thinking_fields(thinking: str | None) -> dict:
    mode = (thinking or DEFAULT_THINKING).lower()
    if mode not in THINKING_MODES:
        raise LLMResponseError(f"unknown thinking mode {mode!r}; expected one of {THINKING_MODES}")
    if mode == "off":
        return {"thinking": {"type": "disabled"}, "temperature": 0.1}
    return {"thinking": {"type": "enabled"}, "reasoning_effort": mode}


def _deepseek_usage(body: dict) -> TokenUsage:
    u = body.get("usage") or {}
    details = u.get("completion_tokens_details") or {}
    return TokenUsage(
        input_tokens=u.get("prompt_tokens"),
        output_tokens=u.get("completion_tokens"),
        cache_hit_tokens=u.get("prompt_cache_hit_tokens"),
        cache_miss_tokens=u.get("prompt_cache_miss_tokens"),
        reasoning_tokens=details.get("reasoning_tokens"),
    )


def _deepseek_chat(
    *,
    model: str,
    messages: list[dict],
    timeout_s: float,
    json_mode: bool,
    thinking: str | None,
    max_tokens: int | None,
) -> tuple[str, TokenUsage]:
    payload: dict = {
        "model": model,
        "messages": messages,
        "stream": False,
        "max_tokens": max_tokens or DEFAULT_MAX_TOKENS,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    payload.update(_thinking_fields(thinking))
    body = _post_deepseek(payload, timeout=timeout_s)
    raw = body["choices"][0]["message"]["content"]
    return raw, _deepseek_usage(body)


def _call_deepseek(
    *,
    model: str,
    prompt: PromptRef,
    user_input: str,
    output_model: Type[T],
    system_extra: str | None,
    timeout_s: float,
    images: list[bytes] | None = None,
    thinking: str | None = None,
    max_tokens: int | None = None,
) -> tuple[T, str, TokenUsage]:
    schema = output_model.model_json_schema()
    schema_block = (
        "\n\n## OUTPUT SCHEMA (must match exactly)\n"
        "Reply with a single JSON object conforming to this schema. "
        "No markdown, no prose, no fences — just the JSON.\n\n"
        f"```json\n{json.dumps(schema, ensure_ascii=False)}\n```"
    )
    # Static material first (system prompt + schema), per-document input last:
    # DeepSeek's prefix cache hits on the shared prefix from the 3rd call on.
    messages = [{"role": "system", "content": prompt.body + schema_block}]
    if system_extra:
        messages.append({"role": "system", "content": system_extra})
    messages.append({"role": "user", "content": _user_content(user_input, images)})

    raw, usage = _deepseek_chat(
        model=model, messages=messages, timeout_s=timeout_s,
        json_mode=True, thinking=thinking, max_tokens=max_tokens,
    )
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise LLMResponseError(f"deepseek content is not JSON: {raw[:300]}") from e
    try:
        parsed = output_model.model_validate(data)
    except ValidationError as e:
        raise LLMResponseError(
            f"response failed {output_model.__name__} schema: {e}"
        ) from e
    return parsed, raw, usage


def call_vision_text(
    *,
    model: str,
    system: str,
    user_text: str,
    images: list[bytes],
    timeout_s: float = DEFAULT_TIMEOUT_S,
    thinking: str = "off",
    max_tokens: int | None = None,
) -> tuple[str, TokenUsage]:
    """Free-text (non-JSON) completion over images — used for OCR transcripts.

    DeepSeek-only: the other backends have no image path in this client.
    """
    backend = os.environ.get("SUPAGRAF_LLM_BACKEND", "deepseek").lower()
    if backend != "deepseek":
        raise LLMResponseError(f"call_vision_text needs the deepseek backend, got {backend!r}")
    if not images:
        raise LLMResponseError("call_vision_text: no images supplied")
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": _user_content(user_text, images)},
    ]
    return _deepseek_chat(
        model=model, messages=messages, timeout_s=timeout_s,
        json_mode=False, thinking=thinking, max_tokens=max_tokens,
    )


# ---- Gemini backend ---------------------------------------------------------

# Lazy import — google-genai is heavy and only needed when backend=gemini.
_GENAI_CLIENT = None


def _gemini_client():
    global _GENAI_CLIENT
    if _GENAI_CLIENT is None:
        from google import genai  # type: ignore[import-not-found]
        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            # Fall back to .env so CLI users don't have to export manually.
            from supagraf.db import load_dotenv
            load_dotenv()
            api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise LLMResponseError(
                "GOOGLE_API_KEY missing — required for gemini backend"
            )
        _GENAI_CLIENT = genai.Client(api_key=api_key)
    return _GENAI_CLIENT


def _gemini_schema(output_model: Type[BaseModel]) -> dict:
    """Build a Gemini-compatible JSON schema from a Pydantic model.

    Gemini's `response_schema` is JSON-Schema-shaped but rejects fields it
    doesn't recognize, including:
      - `additionalProperties` (emitted by Pydantic `extra="forbid"`)
      - `$defs` / `$ref` (Pydantic uses these for nested models)
      - `title`, `default`, validation-only keys

    This sanitizer inlines $refs, drops unknown keys, and recurses into
    nested objects/arrays.
    """
    schema = output_model.model_json_schema()
    defs = schema.get("$defs", {})
    # ``minItems`` / ``maxItems`` removed — Gemini rejects schemas with array
    # length bounds and the underlying Pydantic validators run on the parsed
    # response anyway, so DB writes still see length-checked values.
    allowed = {
        "type", "properties", "required", "items", "enum", "format",
        "minimum", "maximum", "minLength", "maxLength",
        "description", "nullable", "anyOf",
    }

    def walk(node):
        if isinstance(node, dict):
            if "$ref" in node:
                ref = node["$ref"]
                key = ref.rsplit("/", 1)[-1]
                if key in defs:
                    return walk(defs[key])
                return {}
            # Pydantic emits Optional[T] as ``anyOf: [T, {type: null}]`` —
            # Gemini schema doesn't accept that. Collapse to ``T`` plus
            # ``nullable: true`` (Gemini's union-with-null encoding).
            if "anyOf" in node:
                variants = node["anyOf"]
                non_null = [v for v in variants if v.get("type") != "null"]
                has_null = any(v.get("type") == "null" for v in variants)
                if len(non_null) == 1 and has_null:
                    inner = walk(non_null[0])
                    inner["nullable"] = True
                    # Carry over any sibling keys (description, etc.).
                    for k, v in node.items():
                        if k == "anyOf":
                            continue
                        if k in allowed:
                            inner[k] = walk(v)
                    return inner
            out = {}
            for k, v in node.items():
                if k == "properties":
                    # property NAMES are arbitrary — recurse into each
                    # value's schema without filtering the name as a keyword.
                    out[k] = {pname: walk(pschema) for pname, pschema in v.items()}
                elif k in allowed:
                    out[k] = walk(v)
            return out
        if isinstance(node, list):
            return [walk(x) for x in node]
        return node

    return walk(schema)


@retry(
    retry=retry_if_exception_type(LLMHTTPError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def _call_gemini(
    *,
    model: str,
    prompt: PromptRef,
    user_input: str,
    output_model: Type[T],
    system_extra: str | None,
    timeout_s: float,
) -> tuple[T, str, TokenUsage]:
    from google.genai import types  # type: ignore[import-not-found]
    from google.genai import errors as genai_errors  # type: ignore[import-not-found]

    client = _gemini_client()
    system_parts = [prompt.body]
    if system_extra:
        system_parts.append(system_extra)

    config = types.GenerateContentConfig(
        system_instruction="\n\n".join(system_parts),
        temperature=0.1,
        response_mime_type="application/json",
        response_schema=_gemini_schema(output_model),
        http_options=types.HttpOptions(timeout=int(timeout_s * 1000)),
    )
    try:
        response = client.models.generate_content(
            model=model,
            contents=user_input,
            config=config,
        )
    except genai_errors.ServerError as e:
        raise LLMHTTPError(f"gemini server error: {e!r}") from e
    except genai_errors.APIError as e:
        # 4xx — bad request, auth, etc. NOT retried.
        raise LLMResponseError(f"gemini api error: {e!r}") from e

    raw = response.text
    if not isinstance(raw, str) or not raw.strip():
        raise LLMResponseError(f"empty gemini response: {response!r}")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise LLMResponseError(f"gemini content is not JSON: {raw[:300]}") from e
    try:
        parsed = output_model.model_validate(data)
    except ValidationError as e:
        raise LLMResponseError(
            f"response failed {output_model.__name__} schema: {e}"
        ) from e

    usage_meta = getattr(response, "usage_metadata", None)
    usage = TokenUsage(
        input_tokens=getattr(usage_meta, "prompt_token_count", None) if usage_meta else None,
        output_tokens=getattr(usage_meta, "candidates_token_count", None) if usage_meta else None,
    )
    return parsed, raw, usage


# ---- Public entry point -----------------------------------------------------


def call_structured(
    *,
    model: str,
    prompt_name: str,
    user_input: str,
    output_model: Type[T],
    prompt_version: int | None = None,
    system_extra: str | None = None,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    backend: str | None = None,
    images: list[bytes] | None = None,
    thinking: str | None = None,
    max_tokens: int | None = None,
) -> LLMCall:
    """Call the configured LLM backend with a versioned prompt + Pydantic schema.

    `images` (PNG/JPEG bytes) are attached to the user turn — deepseek backend
    only, and only meaningful for a vision-capable model. `thinking` picks the
    DeepSeek reasoning mode ("off" | "low" | "high" | "max"; default from
    SUPAGRAF_LLM_THINKING). Both are ignored by the ollama/gemini paths except
    that images raise there (no silent drop of input).

    Returns LLMCall on success. Raises:
      - FileNotFoundError: prompt missing
      - LLMHTTPError: persistent server/transport failure (after retries)
      - LLMResponseError: 4xx, non-JSON, schema mismatch (no retry)
    """
    backend = (backend or os.environ.get("SUPAGRAF_LLM_BACKEND", "deepseek")).lower()
    prompt = _resolve_prompt(prompt_name, prompt_version)
    if images and backend != "deepseek":
        raise LLMResponseError(f"image input is only supported on the deepseek backend (got {backend!r})")

    if backend == "ollama":
        parsed, raw, usage = _call_ollama(
            model=model,
            prompt=prompt,
            user_input=user_input,
            output_model=output_model,
            system_extra=system_extra,
            timeout_s=timeout_s,
        )
    elif backend == "gemini":
        parsed, raw, usage = _call_gemini(
            model=model,
            prompt=prompt,
            user_input=user_input,
            output_model=output_model,
            system_extra=system_extra,
            timeout_s=timeout_s,
        )
    elif backend == "deepseek":
        parsed, raw, usage = _call_deepseek(
            model=model,
            prompt=prompt,
            user_input=user_input,
            output_model=output_model,
            system_extra=system_extra,
            timeout_s=timeout_s,
            images=images,
            thinking=thinking,
            max_tokens=max_tokens,
        )
    else:
        raise LLMResponseError(f"unknown backend: {backend!r}")

    return LLMCall(
        model=model,
        backend=backend,
        prompt=prompt,
        parsed=parsed,
        raw_response=raw,
        usage=usage,
        model_run_id=None,
    )
