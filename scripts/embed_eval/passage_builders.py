"""Different passage representations to test.

Tests which textual representation helps retrieval most, independent of
model. ETL improvement: if `title_subjects_summary` beats `summary_only`,
we should change `embed_print.py` accordingly.
"""
from __future__ import annotations

from typing import Callable, Mapping

PassageBuilder = Callable[[Mapping], str]

MAX_INPUT_CHARS = 1400  # matches embed_print.py current cap


def _truncate(text: str) -> str:
    return text[:MAX_INPUT_CHARS] if text else ""


def summary_only(row: Mapping) -> str:
    return _truncate(row.get("summary") or "")


def title_plus_summary(row: Mapping) -> str:
    title = (row.get("title") or "").strip()
    summary = (row.get("summary") or "").strip()
    return _truncate(f"{title}\n\n{summary}" if title else summary)


def title_tags_summary(row: Mapping) -> str:
    """Title + topic_tags + persona_tags + summary.

    `topic_tags` (e.g. ['podatki', 'rolnictwo']) and `persona_tags`
    (e.g. ['emeryt', 'rolnik']) come from existing LLM enrichers and act
    as semantic anchors.
    """
    title = (row.get("title") or "").strip()
    topic_tags = row.get("topic_tags") or []
    persona_tags = row.get("persona_tags") or []
    summary = (row.get("summary") or "").strip()
    parts: list[str] = []
    if title:
        parts.append(title)
    tag_bits: list[str] = []
    if topic_tags:
        tag_bits.append("Tematy: " + ", ".join(str(s) for s in topic_tags))
    if persona_tags:
        tag_bits.append("Dotyczy: " + ", ".join(str(s) for s in persona_tags))
    if tag_bits:
        parts.append(" | ".join(tag_bits))
    if summary:
        parts.append(summary)
    return _truncate("\n\n".join(parts))


STRATEGIES: dict[str, PassageBuilder] = {
    "summary_only": summary_only,
    "title_plus_summary": title_plus_summary,
    "title_tags_summary": title_tags_summary,
}
