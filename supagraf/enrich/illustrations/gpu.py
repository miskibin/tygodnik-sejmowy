"""Bounded, isolated FLUX image generation on the SFGPU host.

This adapter deliberately has no fallback: an unavailable or busy GPU produces
no candidates.  It is not a general remote-command runner.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import uuid
from pathlib import Path
from typing import Any

from .models import Candidate

HOST = "sfgpu"
REMOTE_ROOT = "/home/michal/tygodnik_illustration_pipeline"
REMOTE_CACHE = "/home/michal/tygodnik_illustration_pipeline/hf-cache"
IMAGE = "tygodnik-illustration:flux2-klein4b"
MODEL = "black-forest-labs/FLUX.2-klein-4B"
REVISION = "e7b7dc27f91deacad38e78976d1f2b499d76a294"
MAX_CANDIDATES = 2
MIN_FREE_MIB = 20 * 1024
SSH = ("ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", HOST)
FORBIDDEN_PROMPT = re.compile(
    r"\b(?:face|faces|portrait|person|people|man|woman|child|children|crowd|"
    r"selfie|celebrity|politician|interior|inside|room|courtroom|office|signage|letters|"
    r"written words|readable text|logo|logos)\b", re.IGNORECASE,
)
NEGATIVE_SAFETY_CLAUSE = re.compile(
    r"\b(?:no|without)\s+(?:(?:readable\s+)?text|faces?|people|persons?|"
    r"portraits?|logos?|signage|letters|interiors?)\b", re.IGNORECASE,
)


class GPUError(RuntimeError):
    """A sanitized infrastructure failure; no remote command output is exposed."""


def runtime_fingerprint() -> dict[str, str]:
    """Version cache inputs including the exact image ID currently on SFGPU."""
    root = Path(__file__).resolve().parents[3]
    worker = root / "scripts" / "illustrations" / "worker.py"
    dockerfile = root / "scripts" / "illustrations" / "Dockerfile"
    worker_sha = hashlib.sha256(worker.read_bytes()).hexdigest()
    dockerfile_sha = hashlib.sha256(dockerfile.read_bytes()).hexdigest()
    image_id = _image_identity()
    fingerprint = hashlib.sha256(f"{MODEL}:{REVISION}:{worker_sha}:{dockerfile_sha}:{image_id}".encode()).hexdigest()
    return {"model": MODEL, "revision": REVISION, "worker_sha256": worker_sha,
            "dockerfile_sha256": dockerfile_sha, "image_id": image_id, "fingerprint": fingerprint}

def _run(args: list[str], *, timeout: int, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, text=True, capture_output=True, timeout=timeout, check=check)


def _remote(command: str, *, timeout: int = 45, check: bool = True) -> subprocess.CompletedProcess[str]:
    # command strings only contain constants and a UUID made below.
    return _run([*SSH, command], timeout=timeout, check=check)


def _image_identity() -> str:
    """Resolve the exact local Docker image ID; unavailable means no stale cache reuse."""
    try:
        result = _remote("docker image inspect --format '{{.Id}}' " + IMAGE, timeout=30)
        image_id = result.stdout.strip()
        return image_id if re.fullmatch(r"sha256:[0-9a-f]{64}", image_id) else "unavailable"
    except (OSError, subprocess.SubprocessError):
        return "unavailable"

def _gpu_memory() -> tuple[int, int] | None:
    try:
        result = _remote(
            "nvidia-smi --query-gpu=memory.free,memory.total --format=csv,noheader,nounits",
            timeout=30,
        )
        line = next((line.strip() for line in result.stdout.splitlines() if line.strip()), "")
        values = [int(value.strip()) for value in line.split(",")]
        return (values[0], values[1]) if len(values) == 2 else None
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def _safe_prompt(plan: Any) -> str | None:
    if getattr(plan, "route", "none") != "generate" or getattr(plan, "required_identity", None):
        return None
    prompt = getattr(plan, "prompt", None)
    if not isinstance(prompt, str) or not prompt.strip():
        return None
    # Keep explicit negative instructions, but exclude them from the unsafe-subject scan.
    if FORBIDDEN_PROMPT.search(NEGATIVE_SAFETY_CLAUSE.sub("", prompt)):
        return None
    return prompt.strip()


def _seed(plan: Any, prompt: str, index: int) -> int:
    subject = str(getattr(plan, "subject", ""))
    digest = hashlib.sha256(f"{subject}\0{prompt}\0{index}".encode()).digest()
    return int.from_bytes(digest[:4], "big") % 2_000_000_000


def _candidate(*, path: Path, plan: Any, record: dict[str, Any], run_metadata: dict[str, Any]) -> Candidate:
    return Candidate(
        id=f"generated-flux2-{record['seed']}",
        provider="sfgpu_flux2",
        local_path=str(path),
        source_url="",
        author="AI-generated with FLUX.2 [klein] 4B",
        license="Model output; editorial review required",
        license_url="",
        caption=getattr(plan, "subject", None) or "Ilustracja wygenerowana dla artykułu",
        identity="",
        metadata={
            "model": MODEL,
            "revision": REVISION,
            "seed": record["seed"],
            "generation_seconds": record.get("seconds"),
            "gpu_memory_mib_before": run_metadata.get("gpu_memory_mib_before"),
            "gpu_memory_mib_after": run_metadata.get("gpu_memory_mib_after"),
            "worker": run_metadata,
        },
    )


def generate_candidates(plan: Any, output_dir: Path, count: int = MAX_CANDIDATES) -> list[Candidate]:
    """Generate at most two reviewed candidates, or abstain without side effects.

    The caller still has to review the result.  Plans involving a required
    identity, faces, text, or synthetic interiors never reach the GPU.
    """
    prompt = _safe_prompt(plan)
    if prompt is None or count <= 0:
        return []
    count = min(int(count), MAX_CANDIDATES)
    before = _gpu_memory()
    if before is None:
        raise GPUError("SFGPU is unavailable")
    if before[0] < MIN_FREE_MIB:
        raise GPUError("SFGPU does not have enough free GPU memory")

    job = f"tygodnik-illustration-{uuid.uuid4().hex}"
    if not re.fullmatch(r"tygodnik-illustration-[0-9a-f]{32}", job):  # defensive invariant
        return []
    remote_job = f"{REMOTE_ROOT}/jobs/{job}"
    request = {
        "prompt": prompt,
        "count": count,
        "seeds": [_seed(plan, prompt, index) for index in range(count)],
        "model": MODEL,
        "revision": REVISION,
        "gpu_memory_mib_before": {"free": before[0], "total": before[1]},
    }
    output_dir = Path(output_dir)
    request_file = output_dir / f".{job}.json"
    copied = False
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        request_file.write_text(json.dumps(request), encoding="utf-8")
        _remote(f"mkdir -p {remote_job} && chmod 700 {remote_job}")
        _run(["scp", "-q", str(request_file), f"{HOST}:{remote_job}/request.json"], timeout=60)
        _remote(
            "docker image inspect " + IMAGE + " >/dev/null && "
            "docker run --rm --name " + job + " --gpus all --network none --user 1000:1000 "
            f"-v {REMOTE_CACHE}:/models:ro -v {remote_job}:/work {IMAGE} "
            "/work/request.json",
            timeout=900,
        )
        _run(["scp", "-q", f"{HOST}:{remote_job}/result.json", str(output_dir / f".{job}.result.json")], timeout=60)
        _run(["scp", "-q", "-r", f"{HOST}:{remote_job}/output/.", str(output_dir)], timeout=120)
        copied = True
        result_path = output_dir / f".{job}.result.json"
        result = json.loads(result_path.read_text(encoding="utf-8"))
        result["gpu_memory_mib_before"] = request["gpu_memory_mib_before"]
        after = _gpu_memory()
        result["gpu_memory_mib_after"] = ({"free": after[0], "total": after[1]} if after else None)
        return [
            _candidate(path=output_dir / record["file"], plan=plan, record=record, run_metadata=result)
            for record in result.get("images", [])[:count]
            if isinstance(record, dict) and isinstance(record.get("file"), str)
            and Path(record["file"]).name == record["file"] and (output_dir / record["file"]).is_file()
        ]
    except (OSError, ValueError, json.JSONDecodeError, subprocess.SubprocessError) as exc:
        raise GPUError("SFGPU generation did not complete") from exc
    finally:
        request_file.unlink(missing_ok=True)
        if copied:
            (output_dir / f".{job}.result.json").unlink(missing_ok=True)
        # Only the UUID-derived container/job owned by this call is removed.
        try:
            _remote(f"docker rm -f {job} >/dev/null 2>&1 || true; rm -rf {remote_job}", check=False)
        except (OSError, subprocess.SubprocessError):
            pass
