import math
import pytest

from scripts.law.evaluate import metrics, validate


def cases():
    categories = ["exact", "colloquial", "exception", "repealed", "future", "unsupported"]
    return [{"id": str(i), "category": categories[i % 6], "split": "holdout" if i >= 70 else "dev",
             "review_status": "proposed", "expected_answerable": False, "expected_units": {}} for i in range(100)]


def test_proposals_cannot_be_reported_as_human_quality_evidence():
    with pytest.raises(ValueError, match="Unreviewed"):
        validate(cases())


def test_heldout_questions_are_required_before_comparing_models():
    rows = cases()
    for row in rows:
        row["split"] = "dev"
    with pytest.raises(ValueError, match="holdout"):
        validate(rows)


def test_retrieval_metrics_penalize_missing_and_low_rank_legal_basis():
    assert metrics({"required": 3}, ["required"])["ndcg_at_10"] == 1
    assert metrics({"required": 3}, ["irrelevant", "required"])["ndcg_at_10"] == pytest.approx(1 / math.log2(3))
    assert metrics({"a": 1, "b": 1}, ["a"])["recall_at_10"] == .5
    assert metrics({}, ["irrelevant"])["recall_at_10"] is None
