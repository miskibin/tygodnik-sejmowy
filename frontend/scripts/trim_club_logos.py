"""Trim whitespace from Sejm club logos in public/club-logos/.

Sejm API assets often ship with large empty margins (PSL-TD was worst:
logo in top ~15px of a 53px canvas). Run after fetch_club_logos.mjs:

    uv run python scripts/trim_club_logos.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public" / "club-logos"
PAD = 2


def trim_one(path: Path) -> None:
    im = Image.open(path).convert("RGBA")
    mask = Image.new("L", im.size)
    mpx = mask.load()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a < 10 or (r > 240 and g > 240 and b > 240):
                mpx[x, y] = 0
            else:
                mpx[x, y] = 255
    bbox = mask.getbbox()
    if not bbox:
        return
    l, t, r, b = bbox
    l, t = max(0, l - PAD), max(0, t - PAD)
    r, b = min(im.width, r + PAD), min(im.height, b + PAD)
    cropped = im.crop((l, t, r, b))
    side = max(cropped.width, cropped.height)
    out = Image.new("RGBA", (side, side), (255, 255, 255, 255))
    out.paste(cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2), cropped)
    out.convert("RGB").save(path, quality=92)
    print(f"trimmed {path.name} ? {side}�{side}")


def main() -> None:
    for path in sorted(ROOT.glob("*")):
        if path.suffix.lower() in {".jpg", ".jpeg", ".png"}:
            trim_one(path)


if __name__ == "__main__":
    main()
