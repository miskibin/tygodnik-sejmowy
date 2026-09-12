"""Optional, zero-LLM-cost illustrations for the newest sitting.

A small reviewed catalog deliberately favors precision over coverage. Match the
document title and its enriched short title (not broad tags or incidental summary mentions). Commons
metadata is checked on every changed subject/catalog and at least every 30 days.
Transport failures preserve prior records and are retried next run.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from bs4 import BeautifulSoup

CATALOG_PATH = Path(__file__).with_name("image_catalog.json")
API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "TygodnikSejmowy/1.0 (https://github.com/miskibin/tygodnik-sejmowy)"


def plain(value: str) -> str:
    return BeautifulSoup(value, "html.parser").get_text(" ", strip=True) if "<" in value else value.strip()


def trusted_url(url: str, hosts: set[str]) -> bool:
    parsed = urlsplit(url)
    return parsed.scheme == "https" and parsed.hostname in hosts and not parsed.username


def match_rule(title: str, catalog: list[dict]) -> dict | None:
    matches = [rule for rule in catalog if re.search(rule["pattern"], title, re.I)]
    # Ambiguous multiple subjects are better left without a picture.
    return matches[0] if len(matches) == 1 else None


def parse_image(page: dict, rule: dict) -> dict | None:
    info = (page.get("imageinfo") or [{}])[0]
    meta = info.get("extmetadata", {})
    def value(key: str) -> str:
        return plain(str(meta.get(key, {}).get("value", "")))
    license_name, license_url = value("LicenseShortName"), value("LicenseUrl")
    if not re.fullmatch(r"CC (?:BY(?:-SA)? [1-4]\.0(?: [a-z]{2})?|0(?: 1\.0)?)", license_name):
        return None
    if not trusted_url(license_url, {"creativecommons.org"}):
        return None
    if not re.match(r"^/(?:licenses/by(?:-sa)?/[1-4]\.0(?:/|$)|publicdomain/zero/1\.0(?:/|$))", urlsplit(license_url).path):
        return None
    author = value("Attribution") or value("Artist")
    url, source = info.get("url", ""), info.get("descriptionurl", "")
    if not author or value("Restrictions") or not trusted_url(url, {"upload.wikimedia.org", "thumb.wikimedia.org"}):
        return None
    if not trusted_url(source, {"commons.wikimedia.org"}):
        return None
    width, height = info.get("width", 0), info.get("height", 0)
    if width < 600 or height < 300 or info.get("mime") not in {"image/jpeg", "image/png", "image/webp"}:
        return None
    return {"url": url, "source_url": source, "author": author,
            "license": license_name, "license_url": license_url,
            "caption": rule["caption"], "alt": rule["caption"],
            "width": width, "height": height, "date": value("DateTimeOriginal"),
            "file": page["title"], "provider": "wikimedia_commons", "rule": rule["id"]}


def fetch_image(rule: dict, session: httpx.Client) -> dict | None:
    response = session.get(API, params={
        "action": "query", "format": "json", "prop": "imageinfo", "titles": rule["file"],
        "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 960,
        "iiextmetadatalanguage": "pl", "maxlag": 5,
    }, timeout=25)
    response.raise_for_status()
    body = response.json()
    if "error" in body:
        raise RuntimeError(f"Commons API: {body['error'].get('code', 'error')}")
    pages = list(body.get("query", {}).get("pages", {}).values())
    if not pages:
        raise RuntimeError("Commons returned no pages")
    return parse_image(pages[0], rule)


def run_images(*, term: int = 10, sitting: int | None = None, dry_run: bool = False,
               force: bool = False, client=None) -> dict:
    from supagraf.db import supabase
    from supagraf.enrich.scoped_prints import build_plan

    sb = client or supabase()
    if sitting is None:
        latest = (sb.table("votings").select("sitting").eq("term", term)
                  .lte("date", datetime.now(timezone.utc).isoformat())
                  .order("date", desc=True).limit(1).execute().data or [])
        if not latest:
            return {"matched": 0, "no_match": 0, "failed": 0, "skipped": 0, "sitting": None}
        sitting = latest[0]["sitting"]
    plan = build_plan(term=term, sitting=sitting, client=sb)
    ids = [row["id"] for row in plan.rows]
    stats = {"matched": 0, "no_match": 0, "failed": 0, "skipped": 0,
             "sitting": sitting, "term": term, "dry_run": dry_run, "results": []}
    if not ids:
        return stats
    rows = (sb.table("prints").select("id,number,title,short_title")
            .eq("term", term).in_("id", ids).execute().data or [])
    existing = {r["print_id"]: r for r in (sb.table("print_images").select("*")
                .in_("print_id", ids).execute().data or [])}
    catalog_bytes = CATALOG_PATH.read_bytes()
    catalog = json.loads(catalog_bytes)
    catalog_hash = hashlib.sha256(catalog_bytes).hexdigest()
    now = datetime.now(timezone.utc)
    cache: dict[str, dict | None] = {}
    with httpx.Client() as session:
        session.headers["User-Agent"] = USER_AGENT
        for row in rows:
            # Both titles identify the subject; changes invalidate a previous match.
            title = " ".join(filter(None, [row.get("title"), row.get("short_title")]))
            subject_hash = hashlib.sha256(title.encode()).hexdigest()
            old = existing.get(row["id"])
            # Explicit editorial selections are immutable to the daily Commons matcher.
            if old and isinstance(old.get("image"), dict) and old["image"].get("editorial_selected") is True:
                stats["skipped"] += 1
                continue
            if not force and old and old["subject_hash"] == subject_hash and old["catalog_hash"] == catalog_hash:
                stamp = re.sub(r"\.(\d+)", lambda m: "." + m[1].ljust(6, "0")[:6], old["checked_at"])
                checked = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
                if checked > now - timedelta(days=30):
                    stats["skipped"] += 1
                    continue
            rule = match_rule(title, catalog)
            try:
                if rule and rule["id"] not in cache:
                    cache[rule["id"]] = fetch_image(rule, session)
                image = cache.get(rule["id"]) if rule else None
                status = "matched" if image else "no_match"
                payload = {"print_id": row["id"], "status": status,
                           "subject_hash": subject_hash, "catalog_hash": catalog_hash,
                           "checked_at": now.isoformat(), "image": image}
                if not dry_run:
                    sb.table("print_images").upsert(payload, on_conflict="print_id").execute()
                stats[status] += 1
                stats["results"].append({"number": row["number"], "status": status,
                                         "rule": rule["id"] if rule else None, "image": image})
            except (httpx.HTTPError, ValueError, RuntimeError) as exc:
                stats["failed"] += 1
                stats["results"].append({"number": row["number"], "error": str(exc)[:200]})
    return stats

