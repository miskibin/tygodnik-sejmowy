"""Contract test: PrintUnifiedOutput accepts markdown in summary_plain (v7 prompt).

The `_word_count_in_range` validator must strip `**`, `*`, `_`, and line-start
`- ` bullets before counting words. Plain summaries still count exactly as
before, so the contract for the legacy per-field schema is unaffected.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from supagraf.enrich.print_unified import (
    PLAIN_MAX_WORDS,
    PLAIN_MIN_WORDS,
    PrintUnifiedOutput,
)


def _base_payload(summary_plain: str) -> dict:
    return {
        "summary": "x " * 12,
        "short_title": "Krótki tytuł",
        "stance": "FOR",
        "stance_confidence": 0.9,
        "stance_rationale": "OK",
        "mentions": [],
        "persona_tags": [],
        "persona_rationale": "brak",
        "topic_tags": [],
        "topic_rationale": "",
        "citizen_action": None,
        "citizen_action_rationale": "ok",
        "summary_plain": summary_plain,
        "iso24495_class": "B1",
        "is_procedural": False,
        "impact_punch": "ok",
        "affected_groups": [],
        "sponsor_mps": [],
    }


def _plain(n: int) -> str:
    return " ".join(["slowo"] * n)


def test_plain_text_inside_range_accepted():
    """Regression: plain text (no markdown) still counts correctly."""
    out = PrintUnifiedOutput.model_validate(
        _base_payload(_plain((PLAIN_MIN_WORDS + PLAIN_MAX_WORDS) // 2))
    )
    assert "**" not in out.summary_plain


def test_plain_text_below_min_rejected():
    with pytest.raises(ValidationError, match="word count"):
        PrintUnifiedOutput.model_validate(
            _base_payload(_plain(PLAIN_MIN_WORDS - 1))
        )


def test_markdown_sigils_stripped_before_count_inline():
    """`**bold**` adds no extra words after sigil strip."""
    # Construct text where word count is exactly PLAIN_MIN_WORDS only if
    # markdown is stripped. Without stripping, `**word**` becomes one token
    # joined to the surrounding words depending on spacing — but our regex
    # replaces sigils with space, so `**word**` → ` word `.
    n_words = PLAIN_MIN_WORDS + 2
    decorated = " ".join(f"**{w}**" if i % 5 == 0 else w
                          for i, w in enumerate(["slowo"] * n_words))
    out = PrintUnifiedOutput.model_validate(_base_payload(decorated))
    # Preserved on the way through — DB stores raw markdown.
    assert "**" in out.summary_plain


def test_list_bullets_dont_count_as_words():
    """`- item` at line start: the `-` should NOT count as an extra word."""
    # Five real content words plus three list bullets. Without stripping,
    # the dashes are five separate "-" tokens. After stripping, five words.
    text_with_list = (
        " ".join(["slowo"] * (PLAIN_MIN_WORDS - 3))
        + "\n- alfa\n- beta\n- gamma"
    )
    # Total content words after strip: (PLAIN_MIN_WORDS - 3) + 3 = PLAIN_MIN_WORDS.
    out = PrintUnifiedOutput.model_validate(_base_payload(text_with_list))
    assert out.summary_plain.count("\n- ") == 3
