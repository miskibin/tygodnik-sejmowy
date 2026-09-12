"""Publish only hashes explicitly approved in an editorial manifest."""
from __future__ import annotations
import argparse, hashlib, json, sys
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image`nsys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from supagraf.db import supabase

def sha(path: Path) -> str: return hashlib.sha256(path.read_bytes()).hexdigest()

def publish(manifest: Path, assets_root: Path, *, dry_run: bool = True, rollback_dir: Path | None = None) -> list[dict]:
    approved = json.loads(manifest.read_text(encoding="utf-8"))
    if not isinstance(approved, list) or not approved: raise ValueError("approved manifest required")
    sb = supabase(); payloads=[]; print_ids=[]
    # Validate every local asset and every target before changing any record.
    for item in approved:
        term, number, expected = item["term"], item["number"], item["sha256"]
        path = assets_root / f"term-{term}" / Path(item["url"]).name
        if not path.is_file() or sha(path) != expected: raise ValueError(f"asset hash mismatch: {term}/{number}")
        with Image.open(path) as image: width, height = image.size
        rows = sb.table("prints").select("id,title,short_title").eq("term",term).eq("number",number).limit(2).execute().data or []
        if len(rows) != 1: raise ValueError(f"print not uniquely found: {term}/{number}")
        title = " ".join(filter(None,[rows[0].get("title"),rows[0].get("short_title")]))
        image={"url":item["url"],"source_url":item.get("source_url", ""),"author":item.get("author", "Tygodnik Sejmowy"),"license":item.get("license", "Ilustracja AI — FLUX.2 [klein] 4B"),"license_url":item.get("license_url", ""),"caption":item["caption"],"alt":item["alt"],"provider":item["provider"],"editorial_selected":True,"width":width,"height":height,"sha256":expected}
        payloads.append({"print_id":rows[0]["id"],"status":"matched","subject_hash":hashlib.sha256(title.encode()).hexdigest(),"catalog_hash":f"approved-v1:{expected}","image":image}); print_ids.append(rows[0]["id"])
    if dry_run: return payloads
    existing = sb.table("print_images").select("*").in_("print_id",print_ids).execute().data or []
    if rollback_dir:
        rollback_dir.mkdir(parents=True, exist_ok=True)
        (rollback_dir / f"print-images-before-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.json").write_text(json.dumps(existing,ensure_ascii=False,indent=2),encoding="utf-8")
    sb.table("print_images").upsert(payloads,on_conflict="print_id").execute()
    return payloads

def main() -> None:
    parser=argparse.ArgumentParser(); parser.add_argument("--manifest",type=Path,default=Path(__file__).with_name("approved-images-v1.json")); parser.add_argument("--assets-root",type=Path,default=Path("frontend/public/editorial")); parser.add_argument("--publish",action="store_true"); parser.add_argument("--rollback-dir",type=Path,default=Path("artifacts/private-rollbacks")); args=parser.parse_args()
    result=publish(args.manifest,args.assets_root,dry_run=not args.publish,rollback_dir=args.rollback_dir if args.publish else None)
    print(json.dumps({"published":args.publish,"count":len(result),"print_ids":[x["print_id"] for x in result]}))
if __name__ == "__main__": main()
