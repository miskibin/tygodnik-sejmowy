import io
import json
import subprocess
import tarfile
from types import SimpleNamespace

import pytest

from supagraf.enrich.illustrations import gpu


def plan(**changes):
    base = {"route": "generate", "prompt": "Empty Polish lakeshore, no people, no faces, no readable text.",
            "subject": "Jeziora", "required_identity": None}
    base.update(changes)
    return SimpleNamespace(**base)


def tar_of(files: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as tar:
        for name, data in files.items():
            info = tarfile.TarInfo(name); info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


def test_non_generation_and_required_identity_never_contact_gpu(monkeypatch, tmp_path):
    contacted = []
    monkeypatch.setattr(gpu, "_gpu_memory", lambda: contacted.append(True) or (50000, 90000))
    assert gpu.generate_candidates(plan(route="authentic"), tmp_path) == []
    assert gpu.generate_candidates(plan(required_identity="minister"), tmp_path) == []
    assert contacted == []


def test_negative_safety_instructions_are_allowed_but_a_synthetic_interior_is_rejected():
    assert gpu._safe_prompt(plan())
    assert gpu._safe_prompt(plan(prompt="An empty courtroom interior, no people or text.")) is None


def test_busy_gpu_raises_without_remote_inference(monkeypatch, tmp_path):
    monkeypatch.setattr(gpu, "_gpu_memory", lambda: (1000, 90000))
    monkeypatch.setattr(gpu, "_run", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("inference")))
    with pytest.raises(gpu.GPUError, match="enough free"):
        gpu.generate_candidates(plan(), tmp_path)


def test_ssh_only_addresses_the_gate_and_honours_container_key(monkeypatch):
    monkeypatch.setenv("SUPAGRAF_SFGPU_SSH", "michal@sf-ai-gpu")
    monkeypatch.setenv("SUPAGRAF_SFGPU_SSH_KEY", "/run/sfgpu/id_ed25519")
    monkeypatch.setenv("SUPAGRAF_SFGPU_KNOWN_HOSTS", "/run/sfgpu/known_hosts")
    args = gpu._ssh("status")
    assert args[-2:] == ["michal@sf-ai-gpu", f"{gpu.GATE} status"]
    assert "/run/sfgpu/id_ed25519" in args and "StrictHostKeyChecking=yes" in args


def test_request_is_bounded_pinned_and_constructs_candidate(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(gpu, "_gpu_memory", lambda: (50000, 90000))
    result = {"images": [{"file": "candidate-01.jpg", "seed": 12, "seconds": 4.2}]}
    archive = tar_of({"./result.json": json.dumps(result).encode(), "./candidate-01.jpg": b"jpg",
                      "../escape.jpg": b"x", "./other.sh": b"x"})

    def fake_run(args, *, timeout, stdin=None):
        calls.append((args, json.loads(stdin)))
        return subprocess.CompletedProcess(args, 0, archive, b"")

    monkeypatch.setattr(gpu, "_run", fake_run)
    candidates = gpu.generate_candidates(plan(), tmp_path, count=99)
    args, request = calls[0]
    assert args[-1].endswith("gate.sh generate")
    assert request["count"] == 2 and request["revision"] == gpu.REVISION and request["model"] == gpu.MODEL
    assert len(candidates) == 1
    assert candidates[0].local_path.endswith("-candidate-01.jpg")
    assert candidates[0].source_url == candidates[0].license_url == candidates[0].identity == ""
    assert candidates[0].metadata["revision"] == gpu.REVISION
    assert sorted(p.name.split("-", 1)[1] for p in tmp_path.iterdir()) == ["candidate-01.jpg"]


def test_transport_failure_is_sanitized(monkeypatch, tmp_path):
    monkeypatch.setattr(gpu, "_gpu_memory", lambda: (50000, 90000))
    monkeypatch.setattr(gpu, "_run", lambda *_a, **_k: (_ for _ in ()).throw(
        subprocess.CalledProcessError(255, "ssh", b"", b"secret stderr")))
    with pytest.raises(gpu.GPUError) as exc:
        gpu.generate_candidates(plan(), tmp_path)
    assert "secret" not in str(exc.value)
