"""LLM client with versioned prompts and structured Pydantic output.

Two backends share one interface (`call_structured`):

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
# DeepSeek API is OpenAI-compatible. We use bare httpx to match the existing
# Ollama path (no new SDK dependency). `response_format={"type":"json_object"}`
# is the only structured-output mode DeepSeek supports — no schema parameter,
# so we embed the Pydantic JSON schema in the system prompt and rely on
# Pydantic post-validation (same pattern as Ollama).


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


@retry(
    retry=retry_if_exception_type((LLMHTTPError, httpx.TimeoutException)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
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
    if 500 <= r.status_code < 600:
        raise LLMHTTPError(f"deepseek {r.status_code}: {r.text[:300]}")
    if r.status_code >= 400:
        raise LLMResponseError(f"deepseek {r.status_code}: {r.text[:300]}")
    try:
        return r.json()
    except json.JSONDecodeError as e:
        raise LLMResponseError(f"non-JSON response: {e!r}") from e


def _call_deepseek(
    *,
    model: str,
    prompt: PromptRef,
    user_input: str,
    output_model: Type[T],
    system_extra: str | None,
    timeout_s: float,
) -> tuple[T, str, TokenUsage]:
    schema = output_model.model_json_schema()
    schema_block = (
        "\n\n## OUTPUT SCHEMA (must match exactly)\n"
        "Reply with a single JSON object conforming to this schema. "
        "No markdown, no prose, no fences — just the JSON.\n\n"
        f"```json\n{json.dumps(schema, ensure_ascii=False)}\n```"
    )
    messages = [{"role": "system", "content": prompt.body + schema_block}]
    if system_extra:
        messages.append({"role": "system", "content": system_extra})
    messages.append({"role": "user", "content": user_input})

    payload: dict = {
        "model": model,
        "messages": messages,
        "stream": False,
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }
    # Non-thinking mode for v4-pro: ~5x cheaper output, plenty for our schemas.
    # v4-flash ignores reasoning param.
    if "pro" in model.lower():
        payload["reasoning"] = {"effort": "minimal"}

    response = _post_deepseek(payload, timeout=timeout_s)
    choices = response.get("choices") or []
    if not choices:
        raise LLMResponseError(f"missing choices in deepseek response: {response!r}")
    raw = ((choices[0] or {}).get("message") or {}).get("content")
    if not isinstance(raw, str) or not raw.strip():
        raise LLMResponseError(f"empty deepseek content: {response!r}")
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

    usage_meta = response.get("usage") or {}
    usage = TokenUsage(
        input_tokens=usage_meta.get("prompt_tokens"),
        output_tokens=usage_meta.get("completion_tokens"),
    )
    return parsed, raw, usage


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
) -> LLMCall:
    """Call the configured LLM backend with a versioned prompt + Pydantic schema.

    Returns LLMCall on success. Raises:
      - FileNotFoundError: prompt missing
      - LLMHTTPError: persistent server/transport failure (after retries)
      - LLMResponseError: 4xx, non-JSON, schema mismatch (no retry)
    """
    backend = (backend or os.environ.get("SUPAGRAF_LLM_BACKEND", "deepseek")).lower()
    prompt = _resolve_prompt(prompt_name, prompt_version)

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
