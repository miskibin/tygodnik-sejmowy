"""Daily illustrations for the newest sitting: plan, generate on SFGPU, review, publish.

Runs after the zero-cost Commons catalog (`story_images.run_images`). Prints that
already carry a matched image are left alone. Every other print of the sitting
gets one pipeline attempt per subject: the outcome (a published image or a
definitive "no image") is written to `print_images` under an `illustration:`
catalog hash, so later runs spend no tokens on it. Infrastructure failures (GPU
unreachable or busy, DeepSeek unavailable) write nothing and retry next run.

Approved assets go to the public Supabase Storage bucket `illustrations`
under their SHA-256, so URLs are immutable.
"""
from __future__ import annotations

import functools
import hashlib
import mimetypes
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from loguru import logger
from PIL import Image

from . import gpu
from .models import Article
from .pipeline import run_pipeline
from .planner import PLAN_PROMPT_VERSION
from .review import REVIEW_PROMPT_VERSION

BUCKET = "illustrations"
POLICY = f"illustration:v1:{gpu.MODEL_LABEL}@{gpu.REVISION[:12]}:plan{PLAN_PROMPT_VERSION}:review{REVIEW_PROMPT_VERSION}"
DEFAULT_LIMIT = 12


def subject_hash(row: dict) -> str:
    # Same subject key as the Commons matcher: a changed title re-opens the print.
    return hashlib.sha256(" ".join(filter(None, [row.get("title"), row.get("short_title")])).encode()).hexdigest()


def pending_rows(rows: list[dict], existing: dict[int, dict]) -> list[dict]:
    """Prints without an image whose current subject this policy has not decided yet."""
    out = []
    for row in rows:
        old = existing.get(row["id"])
        if old and old.get("status") == "matched":
            continue
        if old and old.get("catalog_hash") == POLICY and old.get("subject_hash") == subject_hash(row):
            continue
        out.append(row)
    return out


def article_for(row: dict) -> Article:
    title = (row.get("short_title") or row.get("title") or row["number"]).strip()
    summary = "\n".join(filter(None, [row.get("title") if row.get("short_title") else "",
                                      row.get("impact_punch"), row.get("summary_plain")]))
    return Article(term=row["term"], number=str(row["number"]), title=title[:2000], summary=summary[:3000])


class Storage:
    """Minimal Supabase Storage client (service role) for one public bucket."""

    def __init__(self, url: str | None = None, key: str | None = None, public_url: str | None = None):
        self.url = (url or os.environ["SUPABASE_URL"]).rstrip("/")
        self.public_url = (public_url or os.environ.get("SUPAGRAF_PUBLIC_SUPABASE_URL") or self.url).rstrip("/")
        key = key or os.environ["SUPABASE_KEY"]
        self.http = httpx.Client(timeout=60, headers={"apikey": key, "Authorization": f"Bearer {key}"})
        self._bucket_ready = False

    def _ensure_bucket(self) -> None:
        if self._bucket_ready:
            return
        if self.http.get(f"{self.url}/storage/v1/bucket/{BUCKET}").status_code != 200:
            response = self.http.post(f"{self.url}/storage/v1/bucket", json={
                "id": BUCKET, "name": BUCKET, "public": True, "file_size_limit": 10 * 1024 * 1024,
                "allowed_mime_types": ["image/jpeg", "image/png", "image/webp"]})
            response.raise_for_status()
        self._bucket_ready = True

    def upload(self, path: str, data: bytes, content_type: str) -> str:
        self._ensure_bucket()
        response = self.http.post(f"{self.url}/storage/v1/object/{BUCKET}/{path}", content=data,
                                  headers={"content-type": content_type, "x-upsert": "true",
                                           "cache-control": "public, max-age=31536000, immutable"})
        response.raise_for_status()
        return f"{self.public_url}/storage/v1/object/public/{BUCKET}/{path}"


def image_payload(row: dict, item: dict, plan: dict, url: str, data: bytes, path: Path) -> dict:
    candidate, review = item["candidate"], item["review"]
    with Image.open(path) as image:
        width, height = image.size
    generated = candidate["provider"].startswith("sfgpu")
    label = f"Ilustracja: {(row.get('short_title') or row.get('title') or '').strip()}"[:300]
    meta = candidate.get("metadata") or {}
    return {
        "url": url, "provider": "generated" if generated else candidate["provider"],
        "author": gpu.MODEL_LABEL if generated else candidate["author"],
        "license": f"Ilustracja AI — {gpu.MODEL_LABEL}" if generated else candidate["license"],
        "license_url": "" if generated else candidate["license_url"],
        "source_url": "" if generated else candidate["source_url"],
        "caption": label, "alt": label, "width": width, "height": height,
        "sha256": hashlib.sha256(data).hexdigest(), "editorial_selected": False,
        "metadata": {"pipeline": POLICY, "model": meta.get("model"), "revision": meta.get("revision"),
                     "seed": meta.get("seed"), "plan": plan, "review": review,
                     "review_provenance": item.get("review_provenance", {})},
    }


def infrastructure_failure(result: dict) -> str:
    if result["plan"]["reason"].startswith("Planning unavailable:"):
        return result["plan"]["reason"]
    if result.get("candidate_error"):
        return result["candidate_error"]
    for item in result.get("candidates", []):
        if "unavailable:" in item["review"]["reason"].lower():
            return item["review"]["reason"]
    return ""


def latest_sitting(sb: Any, term: int) -> int | None:
    rows = (sb.table("votings").select("sitting").eq("term", term)
            .lte("date", datetime.now(timezone.utc).isoformat())
            .order("date", desc=True).limit(1).execute().data or [])
    return rows[0]["sitting"] if rows else None


def run_illustrations(*, term: int = 10, sitting: int | None = None, limit: int | None = None,
                      output_dir: Path | None = None, client: Any = None, storage: Storage | None = None,
                      generator=gpu.generate_candidates, **pipeline_kwargs) -> dict:
    from supagraf.db import supabase
    from supagraf.enrich.scoped_prints import build_plan
    from .sourcing import find_authentic, provider_fingerprint

    sb = client or supabase()
    sitting = sitting if sitting is not None else latest_sitting(sb, term)
    stats: dict[str, Any] = {"sitting": sitting, "published": 0, "no_image": 0, "failed": 0, "pending": 0, "deferred": 0}
    if sitting is None:
        return stats
    ids = [row["id"] for row in build_plan(term=term, sitting=sitting, client=sb).rows]
    if not ids:
        return stats
    rows = (sb.table("prints").select("id,term,number,title,short_title,impact_punch,summary_plain")
            .eq("term", term).in_("id", ids).order("number").execute().data or [])
    existing = {r["print_id"]: r for r in (sb.table("print_images").select("print_id,status,subject_hash,catalog_hash")
                                           .in_("print_id", ids).execute().data or [])}
    todo = pending_rows(rows, existing)
    limit = limit if limit is not None else int(os.environ.get("SUPAGRAF_ILLUSTRATION_MAX", DEFAULT_LIMIT))
    stats["pending"], stats["deferred"] = len(todo), max(0, len(todo) - limit)
    todo = todo[:limit]
    if not todo:
        return stats
    output_dir = output_dir or Path(os.environ.get("SUPAGRAF_ILLUSTRATION_DIR", "artifacts/illustrations/daily"))
    pipeline_kwargs.setdefault("authentic_search", functools.partial(
        find_authentic, pixabay=bool(os.environ.get("PIXABAY_API_KEY"))))
    pipeline_kwargs.setdefault("authentic_fingerprint", provider_fingerprint())
    if generator is gpu.generate_candidates:
        pipeline_kwargs.setdefault("generator_fingerprint", gpu.runtime_fingerprint()["fingerprint"])
    report = run_pipeline([article_for(r) for r in todo], output_dir.resolve(), generate=True,
                          generator=generator, stop_at_first_approved=True, **pipeline_kwargs)
    storage = storage or Storage()
    now = datetime.now(timezone.utc).isoformat()
    errors = []
    for row, result in zip(todo, report["articles"]):
        if reason := infrastructure_failure(result):
            stats["failed"] += 1
            errors.append((row["number"], reason[:120]))
            continue
        selected = next((item for item in result["candidates"]
                         if item["candidate"]["id"] == result["selected_candidate_id"]), None)
        record = {"print_id": row["id"], "subject_hash": subject_hash(row), "catalog_hash": POLICY,
                  "checked_at": now, "status": "no_match", "image": None}
        if selected:
            path = Path(selected["candidate"]["local_path"])
            data = path.read_bytes()
            content_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
            url = storage.upload(f"term-{term}/{hashlib.sha256(data).hexdigest()}{path.suffix.lower()}", data, content_type)
            record.update(status="matched", image=image_payload(row, selected, result["plan"], url, data, path))
        sb.table("print_images").upsert(record, on_conflict="print_id").execute()
        stats["published" if selected else "no_image"] += 1
        logger.info("illustration {}/{}: {} ({})", term, row["number"], record["status"], result["plan"]["route"])
    if errors:
        stats["errors_sample"] = errors[:3]
    stats["metrics"] = report["metrics"]
    return stats
