"""분석 라우터: 보안 레이어, 자연어 쿼리"""
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class SecurityAnalysisRequest(BaseModel):
    ir_json: dict


@router.post("/security")
async def analyze_security(request: SecurityAnalysisRequest):
    """보안 레이어 오버레이 분석"""
    try:
        from core.llm import get_llm_client
        client = get_llm_client()

        system_prompt = """당신은 인프라 보안 전문가입니다.
JSON IR 다이어그램을 분석해서 보안 이슈를 감지하세요.

반환 형식:
{
  "issues": [
    {
      "severity": "HIGH | MED | INFO",
      "node_ids": ["node-id"],
      "edge_ids": ["edge-id"],
      "title": "이슈 제목",
      "description": "상세 설명",
      "recommendation": "권고사항"
    }
  ],
  "summary": "전체 보안 현황 요약"
}

감지 항목:
- HIGH: 인터넷에서 DB로 직접 연결 (방화벽/LB 없음)
- HIGH: 암호화 없는 외부 연결
- MED: 단일 복제본 운영되는 중요 서비스
- MED: HTTP 연결 (암호화 없음)
- INFO: Spot Instance 기반 서비스
- INFO: 모니터링 연결 없는 서비스"""

        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"IR: {json.dumps(request.ir_json, ensure_ascii=False)}"},
            ],
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
