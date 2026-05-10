# enrich layer.

# Backend selected via SUPAGRAF_LLM_BACKEND:
#   - "deepseek" (default; needs DEEPSEEK_API_KEY) — V4 family
#   - "gemini"   (Google GenAI; needs GOOGLE_API_KEY)
#   - "ollama"   (local — used historically with gemma)
#
# Per-print model picker (see supagraf.enrich.print_unified.pick_model) chooses
# between LLM_MODELS["pro"] and LLM_MODELS["flash"] based on print metadata.
# DEFAULT_LLM_MODEL stays as the "pro" model for back-compat with the seven
# legacy per-field enrichers that don't use the picker.
import os

DEFAULT_LLM_BACKEND = os.environ.get("SUPAGRAF_LLM_BACKEND", "deepseek")

LLM_MODELS = {
    "pro": os.environ.get("SUPAGRAF_LLM_MODEL_PRO", "deepseek-v4-pro"),
    "flash": os.environ.get("SUPAGRAF_LLM_MODEL_FLASH", "deepseek-v4-flash"),
}

DEFAULT_LLM_MODEL = os.environ.get("SUPAGRAF_LLM_MODEL", LLM_MODELS["pro"])
