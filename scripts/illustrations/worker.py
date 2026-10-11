"""Container entrypoint for one bounded Qwen-Image-2.1-Turbo generation job."""
from __future__ import annotations

import json
import platform
import sys
import time
from pathlib import Path

import diffusers
import torch
import transformers
from diffusers import QwenImage21Pipeline

MODEL = "Qwen/Qwen-Image-2.1-Turbo"
REVISION = "d65dbc9a7e8f6b5479e33dee6030eaab2a906509"
# Native 3:2 preset; the published asset is downscaled for the web.
WIDTH, HEIGHT = 2528, 1696
OUT_WIDTH, OUT_HEIGHT, JPEG_QUALITY = 1536, 1024, 88


def main(request_path: Path) -> None:
    request = json.loads(request_path.read_text(encoding="utf-8"))
    count, seeds, prompt = request.get("count"), request.get("seeds"), request.get("prompt")
    if request.get("model") != MODEL or request.get("revision") != REVISION:
        raise ValueError("unapproved model or revision")
    if not isinstance(count, int) or not 1 <= count <= 2 or not isinstance(seeds, list) or len(seeds) != count:
        raise ValueError("count must be between one and two")
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("prompt required")
    root, output = request_path.parent, request_path.parent / "output"
    output.mkdir(exist_ok=True)
    started = time.perf_counter()
    pipe = QwenImage21Pipeline.from_pretrained(
        MODEL, revision=REVISION, cache_dir="/models/hub", local_files_only=True, dtype=torch.bfloat16,
    ).to("cuda")
    load_seconds = time.perf_counter() - started
    images = []
    for index, seed in enumerate(seeds):
        began = time.perf_counter()
        # Turbo carries its own 8-step sigma schedule and CFG=1; do not override.
        image = pipe(prompt=prompt, width=WIDTH, height=HEIGHT, use_kv_cache=True,
                     generator=torch.Generator("cpu").manual_seed(int(seed))).images[0]
        name = f"candidate-{index + 1:02d}.jpg"
        image.convert("RGB").resize((OUT_WIDTH, OUT_HEIGHT), resample=3).save(
            output / name, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
        images.append({"file": name, "seed": int(seed), "seconds": round(time.perf_counter() - began, 3)})
    result = {
        "model": MODEL, "revision": REVISION, "images": images,
        "load_seconds": round(load_seconds, 3), "total_seconds": round(time.perf_counter() - started, 3),
        "dimensions": [OUT_WIDTH, OUT_HEIGHT], "generated_dimensions": [WIDTH, HEIGHT],
        "dependencies": {"python": platform.python_version(), "torch": torch.__version__,
                         "cuda": torch.version.cuda, "diffusers": diffusers.__version__,
                         "transformers": transformers.__version__},
    }
    (output / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
