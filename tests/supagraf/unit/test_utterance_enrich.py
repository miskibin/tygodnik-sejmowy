from supagraf.enrich.utterance_enrich import (
    MAX_KEY_CLAIMS, MAX_TOPIC_TAGS, UtteranceEnrichmentOutput,
)


def _out(**over):
    base = dict(viral_score=0.1, tone="merytoryczny", topic_tags=[],
                mentioned_entities={}, key_claims=[], addressee="inne",
                summary_one_line="x")
    base.update(over)
    return UtteranceEnrichmentOutput.model_validate(base)


def test_overlong_lists_are_trimmed_not_rejected():
    """v4-flash returned 4 key_claims for a max of 3 (statement 2133815)."""
    o = _out(key_claims=["a", "b", "c", "d"],
             topic_tags=["zdrowie", "transport", "emerytury", "sady-prawa"])
    assert len(o.key_claims) == MAX_KEY_CLAIMS
    assert len(o.topic_tags) == MAX_TOPIC_TAGS
    assert o.key_claims == ["a", "b", "c"]
