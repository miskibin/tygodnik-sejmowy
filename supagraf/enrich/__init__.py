# enrich layer.
#
# Backend selected via SUPAGRAF_LLM_BACKEND:
#   - "deepseek" (default; needs DEEPSEEK_API_KEY) — V4 family
#   - "gemini"   (Google GenAI; needs GOOGLE_API_KEY)
#   - "ollama"   (local — used historically with gemma)
#
# Model roles (all overridable per role via env):
#   vision — deepseek-v4-flash-vision-exp. Default for every print job: reads
#            text like flash (same price) and reads rasterized scan pages
#            when a print has no text layer (vision_ocr.py). Flash-rate
#            billing, 1M context, 2500 concurrency.
#   flash  — deepseek-v4-flash. Text-only volume jobs (statements, voting
#            titles, act titles).
#   pro    — deepseek-v4-pro. Not used by default any more; kept as an
#            opt-in via SUPAGRAF_LLM_ROUTING=pro_flash for the legacy
#            substantive-vs-procedural print router (text-only, no images).
#
# SUPAGRAF_LLM_MODEL pins ONE model for every job and beats the routing.
import os

DEFAULT_LLM_BACKEND = os.environ.get("SUPAGRAF_LLM_BACKEND", "deepseek")

LLM_MODELS = {
    "pro": os.environ.get("SUPAGRAF_LLM_MODEL_PRO", "deepseek-v4-pro"),
    "flash": os.environ.get("SUPAGRAF_LLM_MODEL_FLASH", "deepseek-v4-flash"),
    "vision": os.environ.get("SUPAGRAF_LLM_MODEL_VISION", "deepseek-v4-flash-vision-exp"),
}

# "single" (default): every print goes to LLM_MODELS["vision"].
# "pro_flash": legacy router — substantive bills to pro, procedural to flash.
LLM_ROUTING = os.environ.get("SUPAGRAF_LLM_ROUTING", "single").lower()

DEFAULT_LLM_MODEL = os.environ.get("SUPAGRAF_LLM_MODEL", LLM_MODELS["vision"])
