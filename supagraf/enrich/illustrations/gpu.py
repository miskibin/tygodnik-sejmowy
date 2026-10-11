"""Bounded, isolated Qwen-Image-2.1-Turbo generation on the SFGPU host.

Every call goes through `scripts/illustrations/gate.sh` on SFGPU, which the
daily's SSH key is pinned to (forced command): `status` and `generate` are
the only operations. This adapter deliberately has no fallback: an
unavailable or busy GPU produces no candidates.

SSH target is `SUPAGRAF_SFGPU_SSH` (default: the `sfgpu` alias of a
workstation); `SUPAGRAF_SFGPU_SSH_KEY` / `SUPAGRAF_SFGPU_KNOWN_HOSTS` make it
self-contained inside the daily container.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import subprocess
import tarfile
from pathlib import Path
from typing import Any

from .models import Candidate

REMOTE_ROOT = "/home/michal/tygodnik_illustration_pipeline"
GATE = f"{REMOTE_ROOT}/gate.sh"
IMAGE = "tygodnik-illustration:qwen-image-2.1-turbo"
MODEL = "Qwen/Qwen-Image-2.1-Turbo"
MODEL_LABEL = "Qwen-Image-2.1-Turbo"
REVISION = "d65dbc9a7e8f6b5479e33dee6030eaab2a906509"
MAX_CANDIDATES = 2
MIN_FREE_MIB = 40 * 1024
GENERATE_TIMEOUT_S = 1500
MAX_OUTPUT_BYTES = 64 * 1024 * 1024
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


def _ssh(verb: str) -> list[str]:
    args = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15"]
    if key := os.environ.get("SUPAGRAF_SFGPU_SSH_KEY"):
        args += ["-i", key, "-o", "IdentitiesOnly=yes", "-F", "/dev/null"]
    if known := os.environ.get("SUPAGRAF_SFGPU_KNOWN_HOSTS"):
        args += ["-o", f"UserKnownHostsFile={known}", "-o", "StrictHostKeyChecking=yes"]
    return [*args, os.environ.get("SUPAGRAF_SFGPU_SSH", "sfgpu"), f"{GATE} {verb}"]


def _run(args: list[str], *, timeout: int, stdin: bytes | None = None) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(args, input=stdin, capture_output=True, timeout=timeout, check=True)


def _status() -> dict[str, Any] | None:
    try:
        status = json.loads(_run(_ssh("status"), timeout=45).stdout)
        return status if isinstance(status, dict) else None
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def _gpu_memory() -> tuple[int, int] | None:
    status = _status()
    try:
        return (int(status["free_mib"]), int(status["total_mib"])) if status else None
    except (KeyError, TypeError, ValueError):
        return None


def _image_identity() -> str:
    """Exact worker image ID on SFGPU; unavailable means no stale cache reuse."""
    image_id = str((_status() or {}).get("image_id", ""))
    return image_id if re.fullmatch(r"sha256:[0-9a-f]{64}", image_id) else "unavailable"


def runtime_fingerprint() -> dict[str, str]:
    """Version cache inputs including the exact image ID currently on SFGPU."""
    root = Path(__file__).resolve().parents[3]
    worker = root / "scripts" / "illustrations" / "worker.py"
    dockerfile = root / "scripts" / "illustrations" / "Dockerfile"
    worker_sha = hashlib.sha256(worker.read_bytes()).hexdigest() if worker.is_file() else "packaged"
    dockerfile_sha = hashlib.sha256(dockerfile.read_bytes()).hexdigest() if dockerfile.is_file() else "packaged"
    image_id = _image_identity()
    fingerprint = hashlib.sha256(f"{MODEL}:{REVISION}:{worker_sha}:{dockerfile_sha}:{image_id}".encode()).hexdigest()
    return {"model": MODEL, "revision": REVISION, "worker_sha256": worker_sha,
            "dockerfile_sha256": dockerfile_sha, "image_id": image_id, "fingerprint": fingerprint}


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
        id=f"generated-qwen-image-21-turbo-{record['seed']}",
        provider="sfgpu_qwen_image",
        local_path=str(path),
        source_url="",
        author=f"AI-generated with {MODEL_LABEL}",
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
            "worker": run_metadata,
        },
    )


def _extract(archive: bytes, output_dir: Path, prefix: str) -> dict[str, Any]:
    """Unpack only flat regular files; returns result.json. Names get a job prefix."""
    result: dict[str, Any] = {}
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as tar:
        for member in tar.getmembers():
            name = Path(member.name).name
            if not member.isfile() or not re.fullmatch(r"(?:candidate-\d{2}\.jpg|result\.json)", name):
                continue
            data = tar.extractfile(member).read()
            if name == "result.json":
                result = json.loads(data)
            else:
                (output_dir / f"{prefix}-{name}").write_bytes(data)
    return result


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
    seeds = [_seed(plan, prompt, index) for index in range(count)]
    request = {"prompt": prompt, "count": count, "seeds": seeds, "model": MODEL, "revision": REVISION}
    output_dir = Path(output_dir)
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        archive = _run(_ssh("generate"), timeout=GENERATE_TIMEOUT_S, stdin=json.dumps(request).encode()).stdout
        if len(archive) > MAX_OUTPUT_BYTES:
            raise ValueError("generation output too large")
        prefix = hashlib.sha256(json.dumps(request, sort_keys=True).encode()).hexdigest()[:12]
        result = _extract(archive, output_dir, prefix)
        result["gpu_memory_mib_before"] = {"free": before[0], "total": before[1]}
        return [
            _candidate(path=output_dir / f"{prefix}-{record['file']}", plan=plan, record=record, run_metadata=result)
            for record in result.get("images", [])[:count]
            if isinstance(record, dict) and isinstance(record.get("file"), str)
            and (output_dir / f"{prefix}-{record['file']}").is_file()
        ]
    except (OSError, ValueError, KeyError, tarfile.TarError, subprocess.SubprocessError) as exc:
        raise GPUError("SFGPU generation did not complete") from exc
