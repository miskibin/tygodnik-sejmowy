#!/usr/bin/env bash
# SSH forced command for the Tygodnik illustration key on SFGPU.
#
#   authorized_keys:  command="/home/michal/tygodnik_illustration_pipeline/gate.sh",restrict ssh-ed25519 ... mixvm-daily
#
# Exposes exactly two verbs, whatever the client asks for:
#   status    -> one JSON line: free/total GPU memory and the worker image id
#   generate  -> request.json on stdin, tar of the output directory on stdout
# The worker container has no network and reads the model cache read-only.
set -euo pipefail

ROOT=/home/michal/tygodnik_illustration_pipeline
IMAGE=tygodnik-illustration:qwen-image-2.1-turbo
CACHE=$ROOT/hf-cache

verb=${SSH_ORIGINAL_COMMAND:-${1:-}}
verb=${verb##* }

case "$verb" in
  status)
    mem=$(nvidia-smi --query-gpu=memory.free,memory.total --format=csv,noheader,nounits | head -1 | tr -d ' ')
    id=$(docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null || echo unavailable)
    printf '{"free_mib":%s,"total_mib":%s,"image_id":"%s"}\n' "${mem%,*}" "${mem#*,}" "$id"
    ;;
  generate)
    mkdir -p "$ROOT/jobs"
    exec 9>"$ROOT/gpu.lock"
    flock -w 1800 9  # one generation at a time
    job=$(mktemp -d "$ROOT/jobs/job-XXXXXXXX")
    name="tygodnik-illustration-$(basename "$job")"
    trap 'docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$job"' EXIT
    head -c 65536 > "$job/request.json"
    timeout 1200 docker run --rm --name "$name" --gpus all --network none --user 1000:1000 \
      -v "$CACHE:/models:ro" -v "$job:/work" "$IMAGE" /work/request.json >&2
    tar -C "$job/output" -cf - .
    ;;
  *)
    echo "unsupported command" >&2
    exit 64
    ;;
esac
