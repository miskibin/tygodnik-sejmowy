# DeepSeek V4.1 Flash handles text and vision at the same rates.
# Roles remain configurable; Pro routing is explicit opt-in only.
import os

DEFAULT_LLM_BACKEND = os.environ.get("SUPAGRAF_LLM_BACKEND", "deepseek")

LLM_MODELS = {
    "pro": os.environ.get("SUPAGRAF_LLM_MODEL_PRO", "deepseek-v4-pro"),
    "flash": os.environ.get("SUPAGRAF_LLM_MODEL_FLASH", "deepseek-flash"),
    "vision": os.environ.get("SUPAGRAF_LLM_MODEL_VISION", "deepseek-flash"),
}

# "single" (default): every print goes to LLM_MODELS["vision"].
# "pro_flash": legacy router — substantive bills to pro, procedural to flash.
LLM_ROUTING = os.environ.get("SUPAGRAF_LLM_ROUTING", "single").lower()

DEFAULT_LLM_MODEL = os.environ.get("SUPAGRAF_LLM_MODEL", LLM_MODELS["vision"])
