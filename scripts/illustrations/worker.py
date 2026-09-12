"""Container entrypoint for one bounded FLUX.2 [klein] generation job."""
from __future__ import annotations

import json
import platform
import sys
import time
from pathlib import Path

import diffusers
import torch
import transformers
from diffusers import Flux2KleinPipeline

MODEL = "black-forest-labs/FLUX.2-klein-4B"
REVISION = "e7b7dc27f91deacad38e78976d1f2b499d76a294"
WIDTH, HEIGHT, STEPS, GUIDANCE = 1536, 1024, 4, 1.0


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
    pipe = Flux2KleinPipeline.from_pretrained(
        MODEL, revision=REVISION, cache_dir="/models/hub", local_files_only=True, torch_dtype=torch.bfloat16,
    )
    pipe.to("cuda")
    load_seconds = time.perf_counter() - started
    images = []
    for index, seed in enumerate(seeds):
        began = time.perf_counter()
        image = pipe(prompt=prompt, width=WIDTH, height=HEIGHT, num_inference_steps=STEPS,
                     guidance_scale=GUIDANCE, generator=torch.Generator("cuda").manual_seed(int(seed))).images[0]
        name = f"candidate-{index + 1:02d}.png"
        image.save(output / name)
        images.append({"file": name, "seed": int(seed), "seconds": round(time.perf_counter() - began, 3)})
    result = {
        "model": MODEL, "revision": REVISION, "images": images,
        "load_seconds": round(load_seconds, 3), "total_seconds": round(time.perf_counter() - started, 3),
        "dimensions": [WIDTH, HEIGHT], "steps": STEPS, "guidance_scale": GUIDANCE,
        "dependencies": {"python": platform.python_version(), "torch": torch.__version__,
                         "cuda": torch.version.cuda, "diffusers": diffusers.__version__,
                         "transformers": transformers.__version__},
    }
    (root / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
