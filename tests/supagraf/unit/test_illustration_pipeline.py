from __future__ import annotations

from pathlib import Path

from supagraf.enrich.illustrations.models import Article, Candidate, Plan, Review
from supagraf.enrich.illustrations.pipeline import run_pipeline
from supagraf.enrich.illustrations.planner import guard_plan
from supagraf.enrich.illustrations import review as review_mod


def _article(title: str = "Program ochrony jezior") -> Article:
    return Article(number="123", title=title)


def _ok_review(*_args):
    return Review(status="approved", semantic_relevance=True, physical_geometry_ok=True)


def test_rejected_courtroom_is_never_replanned_as_generated_interior():
    article = _article("Wyrok ETPC w Strasburgu")
    proposed = Plan(route="generate", subject="courtroom", reason="", prompt="empty European courtroom")
    plan = guard_plan(article, proposed)
    assert plan.route == "authentic"
    assert plan.required_identity.lower() in {"etpc", "strasbourg"}
    generic = guard_plan(_article("Zmiana procedury"), proposed)
    assert generic.route == "none"


def test_authentic_identity_mismatch_is_rejected_before_vision(tmp_path):
    image = tmp_path / "x.png"
    image.write_bytes(b"not reviewed")
    plan = Plan(route="authentic", subject="ETPC", reason="", required_identity="ETPC")
    candidate = Candidate(id="x", provider="wikimedia_commons", local_path=str(image), identity="Leipzig court", source_url="https://commons.wikimedia.org/wiki/File:Leipzig.jpg", author="Author", license="CC BY-SA 4.0", license_url="https://creativecommons.org/licenses/by-sa/4.0/", metadata={"source_title": "Leipzig court"})
    review, _ = review_mod.review_candidate(_article(), plan, candidate, llm=lambda **_: (_ for _ in ()).throw(AssertionError()))
    assert review.status == "rejected" and "identity" in review.reason.lower()


def test_missing_image_needs_review_and_feedback_hash_is_rejected(tmp_path, monkeypatch):
    plan = Plan(route="generate", subject="reeds", reason="", prompt="empty reeds")
    missing = Candidate(id="missing", provider="gpu", local_path=str(tmp_path / "missing.png"))
    review, _ = review_mod.review_candidate(_article(), plan, missing)
    assert review.status == "needs_review"
    image = tmp_path / "rejected.png"
    image.write_bytes(b"known rejected bytes")
    import hashlib
    monkeypatch.setattr(review_mod, "REJECTED_SHA256", {hashlib.sha256(image.read_bytes()).hexdigest()})
    review, provenance = review_mod.review_candidate(_article(), plan, Candidate(id="r", provider="gpu", local_path=str(image)))
    assert review.status == "rejected" and provenance["feedback_policy_version"]


def test_pipeline_bounds_candidates_caches_plan_and_reports_metrics(tmp_path):
    calls = {"plan": 0, "review": 0, "generator": 0}

    def planner(_article):
        calls["plan"] += 1
        return Plan(route="generate", subject="reeds", reason="", prompt="empty reed shore"), {"model": "cheap"}

    def generator(_plan, directory: Path):
        calls["generator"] += 1
        values = []
        for i in range(3):
            path = directory / f"{i}.png"
            path.write_bytes(f"image-{i}".encode())
            values.append(Candidate(id=str(i), provider="gpu", local_path=str(path)))
        return values

    def reviewer(*args):
        calls["review"] += 1
        return _ok_review()

    first = run_pipeline([_article()], tmp_path, generate=True, planner=planner, generator=generator, reviewer=reviewer)
    second = run_pipeline([_article()], tmp_path, generate=True, planner=planner, generator=generator, reviewer=reviewer)
    assert first["metrics"] == {"planner_calls": 1, "provider_calls": 1, "review_calls": 2, "candidate_count": 2}
    assert second["metrics"]["planner_calls"] == 0
    assert second["metrics"] == {"planner_calls": 0, "provider_calls": 0, "review_calls": 0, "candidate_count": 2}
    assert calls == {"plan": 1, "review": 2, "generator": 1}
    assert first["publication"].startswith("Approved means")


def test_incidental_sejm_in_summary_does_not_force_authentic():
    article = Article(number="1", title="Ochrona jezior", summary="Sejm uchwalił ustawę po debacie.")
    plan = guard_plan(article, Plan(route="generate", subject="reeds", reason="", prompt="empty reed shore"))
    assert plan.route == "generate"


def test_needs_review_is_never_promoted(tmp_path):
    from types import SimpleNamespace
    image = tmp_path / "x.png"; image.write_bytes(b"image")
    plan = Plan(route="generate", subject="reeds", reason="", prompt="empty shore")
    candidate = Candidate(id="x", provider="gpu", local_path=str(image))
    verdict = Review(status="needs_review", semantic_relevance=True, physical_geometry_ok=True)
    call = SimpleNamespace(parsed=verdict, model="vision", prompt=SimpleNamespace(version=1, sha256="a"), usage=SimpleNamespace(model_dump=lambda: {}))
    result, _ = review_mod.review_candidate(_article(), plan, candidate, llm=lambda **_: call)
    assert result.status == "needs_review"


def test_corrupt_cache_recovers_and_planner_failure_retries(tmp_path):
    (tmp_path / "plan-cache.json").write_text("not json")
    calls = {"n": 0}
    def planner(article):
        calls["n"] += 1
        if calls["n"] == 1: raise RuntimeError("temporary")
        return Plan(route="none", subject="", reason="safe")
    run_pipeline([_article()], tmp_path, planner=planner)
    run_pipeline([_article()], tmp_path, planner=planner)
    assert calls["n"] == 2


def test_provider_error_and_missing_asset_are_visible_and_retried(tmp_path):
    def planner(article): return Plan(route="generate", subject="x", reason="", prompt="empty shore")
    def broken(plan, directory): raise RuntimeError("token=secret")
    report = run_pipeline([_article()], tmp_path / "broken", generate=True, planner=planner, generator=broken)
    assert report["articles"][0]["candidate_error"] == "RuntimeError: provider unavailable"
    calls = {"n": 0}
    def generator(plan, directory):
        calls["n"] += 1; path = directory / "x.png"; path.write_bytes(b"x")
        return [Candidate(id="x", provider="gpu", local_path=str(path))]
    root = tmp_path / "asset"
    run_pipeline([_article()], root, generate=True, planner=planner, generator=generator, reviewer=lambda *_: _ok_review())
    next((root / "assets").rglob("x.png")).unlink()
    run_pipeline([_article()], root, generate=True, planner=planner, generator=generator, reviewer=lambda *_: _ok_review())
    assert calls["n"] == 2


def test_tampered_review_cache_is_recomputed(tmp_path):
    calls = {"n": 0}
    def planner(article): return Plan(route="generate", subject="x", reason="", prompt="empty shore")
    def generator(plan, directory):
        path = directory / "x.png"; path.write_bytes(b"x")
        return [Candidate(id="x", provider="gpu", local_path=str(path))]
    def reviewer(*_): calls["n"] += 1; return _ok_review()
    run_pipeline([_article()], tmp_path, generate=True, planner=planner, generator=generator, reviewer=reviewer)
    (tmp_path / "review-cache.json").write_text('{"bad": {"review": "broken"}}')
    run_pipeline([_article()], tmp_path, generate=True, planner=planner, generator=generator, reviewer=reviewer)
    assert calls["n"] == 2


def test_review_images_has_full_frame_four_crops_and_keeps_input_bytes():
    from io import BytesIO
    from PIL import Image
    source = Image.new("RGB", (800, 600), "white")
    raw = BytesIO(); source.save(raw, format="PNG"); original = raw.getvalue()
    frames = review_mod._review_images(original)
    assert len(frames) == 5 and original == raw.getvalue()
    sizes = [Image.open(BytesIO(frame)).size for frame in frames]
    assert sizes[0] == (800, 600) and sizes[1:] == [(400, 300)] * 4


def test_protected_identity_in_subject_or_prompt_forces_authentic_without_identity_field():
    neutral = Article(number="safe-1", title="Analiza instytucji")
    for plan in (
        Plan(route="generate", subject="ETPC w Strasburgu", reason="", prompt="neutral reeds"),
        Plan(route="generate", subject="neutral subject", reason="", prompt="Editorial photograph of the European Court of Human Rights"),
    ):
        guarded = guard_plan(neutral, plan)
        assert guarded.route == "authentic"
        assert guarded.prompt == "" and guarded.subject == guarded.required_identity


def test_plan_rejects_undeclared_llm_fields():
    import pytest
    with pytest.raises(Exception):
        Plan.model_validate({"route":"none","subject":"x","reason":"x","requiredIdentity":"ETPC"})
