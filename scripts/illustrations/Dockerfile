FROM pytorch/pytorch:2.7.1-cuda12.8-cudnn9-runtime

WORKDIR /app
COPY worker.py /app/worker.py
RUN python -m pip install --no-cache-dir \
    diffusers==0.40.0 \
    transformers==5.17.0 \
    accelerate==1.12.0 \
    safetensors==0.8.0 \
    sentencepiece==0.2.1

ENTRYPOINT ["python", "/app/worker.py"]
