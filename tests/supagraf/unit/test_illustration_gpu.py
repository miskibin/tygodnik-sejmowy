import json
import subprocess
from types import SimpleNamespace

import pytest

from supagraf.enrich.illustrations import gpu


def plan(**changes):
    base = {"route": "generate", "prompt": "Empty Polish lakeshore, no people, no faces, no readable text.",
            "subject": "Jeziora", "required_identity": None}
    base.update(changes)
    return SimpleNamespace(**base)


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
    monkeypatch.setattr(gpu, "_remote", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("inference")))
    with pytest.raises(gpu.GPUError, match="enough free"):
        gpu.generate_candidates(plan(), tmp_path)


def test_request_is_bounded_pinned_and_constructs_candidate(monkeypatch, tmp_path):
    commands, request_bodies = [], []
    monkeypatch.setattr(gpu, "_gpu_memory", lambda: (50000, 90000))
    monkeypatch.setattr(gpu, "_remote", lambda command, **_: commands.append(command) or SimpleNamespace(stdout=""))

    def fake_run(args, **_):
        commands.append(args)
        if args[0] == "scp" and "request.json" in args[-1]:
            request_bodies.append(json.loads(open(args[2], encoding="utf-8").read()))
        elif args[0] == "scp" and str(args[2]).endswith("result.json"):
            target = next(part for part in args if str(part).endswith(".result.json"))
            open(target, "w", encoding="utf-8").write(json.dumps({"images": [{"file": "candidate-01.png", "seed": 12, "seconds": 4.2}]}))
        elif args[0] == "scp" and any("output/." in str(arg) for arg in args):
            (tmp_path / "candidate-01.png").write_bytes(b"png")
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(gpu, "_run", fake_run)
    candidates = gpu.generate_candidates(plan(), tmp_path, count=99)
    assert request_bodies[0]["count"] == 2
    assert request_bodies[0]["revision"] == gpu.REVISION
    assert candidates[0].local_path == str(tmp_path / "candidate-01.png")
    assert candidates[0].source_url == candidates[0].license_url == candidates[0].identity == ""
    assert candidates[0].metadata["revision"] == gpu.REVISION
    docker = next(command for command in commands if isinstance(command, str) and "docker run" in command)
    assert "--network none" in docker
    assert "--user 1000:1000" in docker
    assert "python /app/worker.py" not in docker
    assert docker.endswith("/work/request.json")
    assert request_bodies[0]["revision"] == gpu.REVISION
