FROM pytorch/pytorch:2.7.1-cuda12.8-cudnn9-runtime

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# QwenImage21Pipeline and pipeline-configured sampling sigmas exist only in
# diffusers source builds (pinned commit, not a moving branch).
RUN python -m pip install --no-cache-dir \
    "diffusers @ git+https://github.com/huggingface/diffusers@85c9fa4caee33d1c5b473395784471d2d7957c1b" \
    transformers==5.17.0 \
    accelerate==1.12.0 \
    safetensors==0.8.0 \
    huggingface_hub \
    pillow \
 && python -c "from diffusers import QwenImage21Pipeline"
COPY worker.py /app/worker.py

ENTRYPOINT ["python", "/app/worker.py"]
