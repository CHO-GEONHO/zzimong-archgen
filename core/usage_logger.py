"""API 사용량 로거 — ~/Library/Python/dashboard-data/monitoring/usage-archgen.json"""
import json
import os
import time
from datetime import date
from pathlib import Path
from typing import Optional

APP_ID   = "archgen"
LOG_DIR  = Path.home() / "Library" / "Python" / "dashboard-data" / "monitoring"
LOG_FILE = LOG_DIR / f"usage-{APP_ID}.json"

_EMPTY_STAT = lambda: {"input_tokens": 0, "output_tokens": 0, "calls": 0, "errors": 0, "latency_avg_ms": 0}


def _model_key(model: str) -> str:
    """모델명 → 'deepseek' | 'gemini'"""
    m = model.lower()
    if "deepseek" in m:
        return "deepseek"
    if "gemini" in m or "flash" in m or "pro" in m:
        return "gemini"
    return "deepseek"  # 기본값


def _read() -> dict:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    if LOG_FILE.exists():
        try:
            return json.loads(LOG_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {"app_id": APP_ID, "daily": {}}


def _write(data: dict) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    tmp = LOG_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(LOG_FILE)


def record(
    model: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    latency_ms: float = 0.0,
    error: bool = False,
) -> None:
    """사용량 1건 기록. 파일 없으면 생성, 있으면 누적 합산."""
    try:
        today    = date.today().isoformat()
        mkey     = _model_key(model)
        data     = _read()
        daily    = data.setdefault("daily", {})
        day      = daily.setdefault(today, {})
        stat     = day.setdefault(mkey, _EMPTY_STAT())

        if error:
            stat["errors"] += 1
        else:
            # latency 누적 평균 갱신
            prev_calls = stat["calls"]
            prev_avg   = stat["latency_avg_ms"]
            new_avg    = (prev_avg * prev_calls + latency_ms) / (prev_calls + 1)

            stat["input_tokens"]   += input_tokens
            stat["output_tokens"]  += output_tokens
            stat["calls"]          += 1
            stat["latency_avg_ms"] = round(new_avg, 1)

        _write(data)
    except Exception:
        pass  # 로깅 실패가 서비스에 영향 주지 않도록


class CallTimer:
    """with 블록으로 latency 측정 + 자동 기록"""

    def __init__(self, model: str):
        self.model   = model
        self._start  = 0.0
        self.elapsed = 0.0

    def __enter__(self):
        self._start = time.time()
        return self

    def __exit__(self, exc_type, *_):
        self.elapsed = (time.time() - self._start) * 1000  # ms
        return False  # 예외 전파


def log_response(model: str, response, latency_ms: float) -> None:
    """OpenAI-compatible response 객체에서 usage 추출 후 기록."""
    try:
        usage = response.usage
        record(
            model=model,
            input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            output_tokens=getattr(usage, "completion_tokens", 0) or 0,
            latency_ms=latency_ms,
        )
    except Exception:
        pass


def log_error(model: str) -> None:
    record(model=model, error=True)
