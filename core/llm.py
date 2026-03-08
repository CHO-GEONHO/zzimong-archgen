"""LLM 클라이언트 팩토리 (DeepSeek primary, Gemini Pro/Flash fallback)"""
import os
from typing import Optional
from openai import OpenAI

LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "150"))  # 기본 150초 (대형 아키텍처 대응)

# 텍스트 파싱 전용 모델 (다이어그램 초기 생성): Gemini Pro 사용
PARSE_MODEL = os.getenv("ARCHGEN_PARSE_MODEL", "gemini-2.5-pro")


def _gemini_client(timeout: float) -> Optional[OpenAI]:
    """Gemini OpenAI-compatible 클라이언트"""
    api_key = os.getenv("FALLBACK_API_KEY", os.getenv("GOOGLE_API_KEY", ""))
    if not api_key:
        return None
    return OpenAI(
        api_key=api_key,
        base_url=os.getenv("FALLBACK_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai"),
        timeout=timeout,
    )


def get_parse_client(timeout: Optional[float] = None) -> OpenAI:
    """다이어그램 초기 생성 전용 클라이언트 (Gemini Pro). 없으면 DeepSeek."""
    t = timeout if timeout is not None else LLM_TIMEOUT
    client = _gemini_client(t)
    if client:
        return client
    return get_llm_client(t)


def get_llm_client(timeout: Optional[float] = None) -> OpenAI:
    """
    DeepSeek API 클라이언트 반환.
    DEEPSEEK_API_KEY 없으면 FALLBACK으로 Gemini 사용.
    """
    t = timeout if timeout is not None else LLM_TIMEOUT
    deepseek_key = os.getenv("DEEPSEEK_API_KEY", "")
    fallback_enabled = os.getenv("FALLBACK_ENABLED", "true").lower() == "true"

    if deepseek_key:
        return OpenAI(
            api_key=deepseek_key,
            base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            timeout=t,
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
            timeout=t,
        )
    else:
        raise RuntimeError("DEEPSEEK_API_KEY가 설정되지 않았습니다.")


def get_fallback_client(timeout: Optional[float] = None) -> Optional[OpenAI]:
    """Gemini fallback 클라이언트 (DeepSeek 실패 시)"""
    t = timeout if timeout is not None else LLM_TIMEOUT
    return _gemini_client(t)


def get_model_name() -> str:
    """DeepSeek/기본 LLM 모델명 반환"""
    if os.getenv("DEEPSEEK_API_KEY"):
        return os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    return os.getenv("FALLBACK_MODEL", "gemini-2.5-flash")


def get_fallback_model_name() -> str:
    return os.getenv("FALLBACK_MODEL", "gemini-2.5-flash")
