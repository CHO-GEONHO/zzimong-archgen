"""LLM 클라이언트 팩토리 (DeepSeek primary, Gemini fallback)"""
import os
from openai import OpenAI


def get_llm_client() -> OpenAI:
    """
    DeepSeek API 클라이언트 반환.
    DEEPSEEK_API_KEY 없으면 FALLBACK으로 Gemini 사용.
    """
    deepseek_key = os.getenv("DEEPSEEK_API_KEY", "")
    fallback_enabled = os.getenv("FALLBACK_ENABLED", "true").lower() == "true"

    if deepseek_key:
        return OpenAI(
            api_key=deepseek_key,
            base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        )
    elif fallback_enabled:
        fallback_key = os.getenv("FALLBACK_API_KEY", os.getenv("GOOGLE_API_KEY", ""))
        if not fallback_key:
            raise RuntimeError(
                "DEEPSEEK_API_KEY와 FALLBACK_API_KEY 모두 없습니다. "
                "/Volumes/OpenClawSSD/projects/archgen/.env 파일을 확인하세요."
            )
        return OpenAI(
            api_key=fallback_key,
            base_url=os.getenv("FALLBACK_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai"),
        )
    else:
        raise RuntimeError("DEEPSEEK_API_KEY가 설정되지 않았습니다.")


def get_model_name() -> str:
    """사용 중인 모델명 반환"""
    if os.getenv("DEEPSEEK_API_KEY"):
        return os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    return os.getenv("FALLBACK_MODEL", "gemini-2.5-flash")
