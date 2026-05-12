"""@with_model_run decorator + helpers for audit-trailed enrich calls.

Every enrich fn wrapped with this:
  1. inserts a model_runs row (status='running')
  2. invokes the fn; on success calls model_run_finish('ok')
  3. on Exception logs to enrichment_failures + finish('failed') and re-raises

The wrapped fn receives `model_run_id` injected as kwarg if it accepts it
(detected via inspect.signature). Otherwise it runs as-is and only the
model_runs row is stamped — useful for fns that don't need the id but
should still be auditable.

Hard validations: missing model/fn_name/entity_type at wrap time raises
ValueError; unknown entity_type raises ValueError. No silent fallback.
"""
from __future__ import annotations

import functools
import inspect
import traceback
from dataclasses import dataclass
from typing import Any, Callable, ParamSpec, TypeVar

from loguru import logger
import httpx
from postgrest.exceptions import APIError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from supagraf.db import supabase
from supagraf.enrich.embed import ALLOWED_ENTITY_TYPES

ERROR_MAX_CHARS = 4000

# Supabase via Tailscale (mixvm) sees intermittent RemoteProtocolError +
# ReadError under concurrent load — retry transport-layer drops on top of
# the postgrest API errors.
_RETRY_EXC = (
    APIError,
    httpx.RemoteProtocolError,
    httpx.ReadError,
    httpx.ConnectError,
    httpx.TimeoutException,
    httpx.PoolTimeout,
)

P = ParamSpec("P")
R = TypeVar("R")


def _validate_entity_type(et: str) -> None:
    if et not in ALLOWED_ENTITY_TYPES:
        raise ValueError(
            f"unknown entity_type {et!r}; allowed: {sorted(ALLOWED_ENTITY_TYPES)}"
        )


@retry(
    retry=retry_if_exception_type(_RETRY_EXC),
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def _insert_run(fn_name: str, model: str, prompt_version: str | None,
                prompt_sha256: str | None, notes: dict | None) -> int:
    payload: dict[str, Any] = {
        "fn_name": fn_name,
        "model": model,
        "prompt_version": prompt_version,
        "prompt_sha256": prompt_sha256,
    }
    if notes is not None:
        payload["notes"] = notes
    r = supabase().table("model_runs").insert(payload).execute()
    return int(r.data[0]["id"])


@retry(
    retry=retry_if_exception_type(_RETRY_EXC),
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def _record_failure(model_run_id: int, entity_type: str, entity_id: str,
                    fn_name: str, error: str) -> None:
    # Caller is expected to pre-truncate; we re-clamp defensively.
    supabase().table("enrichment_failures").insert({
        "model_run_id": model_run_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "fn_name": fn_name,
        "error": error[:ERROR_MAX_CHARS],
    }).execute()


@retry(
    retry=retry_if_exception_type(_RETRY_EXC),
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def _finish_run(run_id: int, status: str, notes: dict | None = None) -> None:
    try:
        supabase().rpc("model_run_finish", {
            "p_run_id": run_id,
            "p_status": status,
            "p_notes": notes,
        }).execute()
    except Exception as e:
        # NEVER swallow this silently — leaves the row stuck at 'running' which
        # is observable. Log loud and re-raise so callers see the breakage.
        logger.error("model_run_finish({}, {}) failed: {!r}", run_id, status, e)
        raise


@dataclass(frozen=True)
class _RunMeta:
    fn_name: str
    model: str                      # static fallback; overridable per-call via model_arg
    entity_type_arg: str            # name of fn arg holding entity_type
    entity_id_arg: str              # name of fn arg holding entity_id
    prompt_version_arg: str | None  # optional kwarg name carrying prompt version
    prompt_sha256_arg: str | None
    model_arg: str | None           # optional kwarg name carrying runtime model name
    inject_run_id: bool             # whether wrapped fn accepts model_run_id kwarg


def with_model_run(
    *,
    fn_name: str,
    model: str,
    entity_type_arg: str = "entity_type",
    entity_id_arg: str = "entity_id",
    prompt_version_arg: str | None = "prompt_version",
    prompt_sha256_arg: str | None = "prompt_sha256",
    model_arg: str | None = "llm_model",
) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """Decorator factory. Validates static config at decoration time.

    The static `model` is the fallback recorded on `model_runs.model` when the
    wrapped fn does not accept `model_arg` (default: "llm_model"). If the fn
    accepts it AND it's bound to a non-None value at call time, that runtime
    value is recorded instead — needed for per-call model routing (e.g.
    print_unified's pick_model picks pro/flash per row).
    """
    if not fn_name or not model:
        raise ValueError("fn_name and model are required")
    if not entity_type_arg or not entity_id_arg:
        raise ValueError("entity_type_arg and entity_id_arg are required")

    def deco(func: Callable[P, R]) -> Callable[P, R]:
        sig = inspect.signature(func)
        params = sig.parameters
        if entity_type_arg not in params:
            raise ValueError(
                f"{func.__qualname__} does not accept '{entity_type_arg}' kwarg"
            )
        if entity_id_arg not in params:
            raise ValueError(
                f"{func.__qualname__} does not accept '{entity_id_arg}' kwarg"
            )
        inject = "model_run_id" in params
        meta = _RunMeta(
            fn_name=fn_name,
            model=model,
            entity_type_arg=entity_type_arg,
            entity_id_arg=entity_id_arg,
            prompt_version_arg=prompt_version_arg if prompt_version_arg in params else None,
            prompt_sha256_arg=prompt_sha256_arg if prompt_sha256_arg in params else None,
            model_arg=model_arg if model_arg and model_arg in params else None,
            inject_run_id=inject,
        )

        @functools.wraps(func)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            bound = sig.bind_partial(*args, **kwargs)
            bound.apply_defaults()
            entity_type = bound.arguments.get(meta.entity_type_arg)
            entity_id = bound.arguments.get(meta.entity_id_arg)
            if entity_type is None or entity_id is None:
                raise ValueError(
                    f"{meta.entity_type_arg}/{meta.entity_id_arg} must be provided "
                    f"(got entity_type={entity_type!r}, entity_id={entity_id!r})"
                )
            _validate_entity_type(entity_type)
            entity_id_str = str(entity_id)

            prompt_version = (
                bound.arguments.get(meta.prompt_version_arg)
                if meta.prompt_version_arg else None
            )
            prompt_sha256 = (
                bound.arguments.get(meta.prompt_sha256_arg)
                if meta.prompt_sha256_arg else None
            )
            runtime_model = (
                bound.arguments.get(meta.model_arg)
                if meta.model_arg else None
            ) or meta.model

            run_id = _insert_run(
                meta.fn_name, runtime_model,
                str(prompt_version) if prompt_version is not None else None,
                prompt_sha256, None,
            )

            if meta.inject_run_id:
                kwargs["model_run_id"] = run_id  # type: ignore[arg-type]

            try:
                result = func(*args, **kwargs)
            except Exception as e:
                err = "".join(traceback.format_exception_only(type(e), e)).strip()
                # Pre-truncate so the wrapper boundary contract is testable
                # without reaching into _record_failure internals.
                err = err[:ERROR_MAX_CHARS]
                # Best-effort failure rows + finish; if these themselves fail,
                # surface the original exception (don't swallow).
                try:
                    _record_failure(run_id, entity_type, entity_id_str, meta.fn_name, err)
                except Exception as inner:
                    logger.error("could not write enrichment_failures: {!r}", inner)
                try:
                    _finish_run(run_id, "failed", {"error_kind": type(e).__name__})
                except Exception as inner:
                    logger.error("could not finish run as failed: {!r}", inner)
                raise

            _finish_run(run_id, "ok")
            return result

        wrapper.__supagraf_model_run_meta__ = meta  # type: ignore[attr-defined]
        return wrapper

    return deco
