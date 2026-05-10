"""LLM-restore Polish diacritics on the legacy ASCII-folded promise corpus.

Hard validation: the LLM output MUST equal the input under ASCII-fold. If
fold(restored) != input, we reject (likely hallucination). Only diacritic
character swaps are accepted; word boundaries, length, punctuation must
be byte-for-byte identical post-fold.

Idempotent: rows with diacritics_restored_at IS NOT NULL are skipped.
Audit-trailed via @with_model_run.
"""
from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field

from supagraf.db import supabase
from supagraf.enrich import DEFAULT_LLM_MODEL
from supagraf.enrich.audit import with_model_run
from supagraf.enrich.llm import LLMResponseError, call_structured

JOB_NAME = "restore_promise_diacritics"
PROMPT_NAME = "promise_restore_diacritics"

DIACRITIC_FOLD = {
    "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n",
    "ó": "o", "ś": "s", "ź": "z", "ż": "z",
    "Ą": "A", "Ć": "C", "Ę": "E", "Ł": "L", "Ń": "N",
    "Ó": "O", "Ś": "S", "Ź": "Z", "Ż": "Z",
}


def ascii_fold(s: str) -> str:
    return "".join(DIACRITIC_FOLD.get(ch, ch) for ch in s)


class RestoredText(BaseModel):
    model_config = ConfigDict(extra="forbid")
    restored: str = Field(min_length=1)


def validate_restoration(original: str, restored: str) -> None:
    """Reject anything beyond pure diacritic swaps.

    The fold of the restored text must equal the original byte-for-byte.
    This catches: added/removed words, reordered text, punctuation changes,
    case swaps, character substitutions outside the diacritic set.
    """
    if len(restored) != len(original):
        raise LLMResponseError(
            f"length mismatch: original={len(original)} restored={len(restored)}"
        )
    folded = ascii_fold(restored)
    if folded != original:
        for i, (a, b) in enumerate(zip(original, folded)):
            if a != b:
                raise LLMResponseError(
                    f"fold mismatch at position {i}: "
                    f"original[{i}]={a!r} fold(restored)[{i}]={b!r}; "
                    f"original={original!r} restored={restored!r}"
                )
        raise LLMResponseError("fold mismatch (post-zip)")


def _restore_one(text: str, *, llm_model: str) -> tuple[str, object]:
    """Call LLM, validate, return (restored, llm_call). Raises on failure."""
    if not text.strip():
        return text, None
    if ascii_fold(text) != text:
        return text, None

    call = call_structured(
        model=llm_model,
        prompt_name=PROMPT_NAME,
        user_input=text,
        output_model=RestoredText,
    )
    parsed: RestoredText = call.parsed  # type: ignore[assignment]
    validate_restoration(text, parsed.restored)
    return parsed.restored, call


@with_model_run(
    fn_name=JOB_NAME,
    model=DEFAULT_LLM_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg="prompt_version",
    prompt_sha256_arg="prompt_sha256",
)
def restore_promise_diacritics(
    *,
    entity_type: str,
    entity_id: str,
    title: str,
    normalized_text: str,
    source_quote: str | None = None,
    llm_model: str = DEFAULT_LLM_MODEL,
    prompt_version: int | None = None,
    prompt_sha256: str | None = None,
    model_run_id: int | None = None,
) -> dict:
    new_title, _ = _restore_one(title, llm_model=llm_model)
    new_normalized, _ = _restore_one(normalized_text, llm_model=llm_model)
    new_quote: str | None
    if source_quote is None:
        new_quote = None
    else:
        new_quote, _ = _restore_one(source_quote, llm_model=llm_model)

    payload: dict = {
        "title": new_title,
        "normalized_text": new_normalized,
        "diacritics_restored_at": datetime.now(timezone.utc).isoformat(),
    }
    if source_quote is not None:
        payload["source_quote"] = new_quote

    supabase().table("promises").update(payload).eq("id", int(entity_id)).execute()
    return {
        "id": int(entity_id),
        "title_changed": new_title != title,
        "normalized_changed": new_normalized != normalized_text,
        "quote_changed": (
            source_quote is not None and new_quote != source_quote
        ),
    }
