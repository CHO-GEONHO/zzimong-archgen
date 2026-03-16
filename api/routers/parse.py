"""파싱 라우터: text / cli / git → JSON IR"""
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class TextParseRequest(BaseModel):
    text: str
    title: Optional[str] = None
    diagram_type: Optional[str] = None  # 'architecture' | 'sequence' | 'flowchart'


class ClarifyRequest(BaseModel):
    text: str
    diagram_type: Optional[str] = None


class CLIParseRequest(BaseModel):
    output: str
    cloud_hint: Optional[str] = None  # azure | gcp | aws | k8s


class GitParseRequest(BaseModel):
    url: str
    github_token: Optional[str] = None


@router.post("/clarify")
async def clarify_parse(request: ClarifyRequest):
    """텍스트의 모호한 부분 파악 → 사용자 선택 질문 생성 (없으면 questions=[])"""
    # 아키텍처 다이어그램만 명확화 적용
    if request.diagram_type and request.diagram_type != 'architecture':
        return {"questions": []}
    try:
        from core.llm import get_llm_client, get_model_name
        client = get_llm_client()
        model = get_model_name()

        system_prompt = """당신은 인프라 아키텍처 다이어그램 생성 전문가입니다.
사용자의 설명에서 다이어그램 품질에 영향을 줄 수 있는 모호한 부분을 파악하세요.

규칙:
- 모호한 부분이 있으면 최대 3개의 질문을 생성하세요.
- 모호한 부분이 없거나 설명이 이미 충분히 구체적이면 questions를 빈 배열로 반환하세요.
- 질문은 구체적이고 실용적이어야 합니다. 레이아웃/색상 관련 질문은 하지 마세요.
- 각 선택지는 실제 아키텍처 결정에 의미 있는 차이를 만들어야 합니다.

반환 형식 (JSON만, 다른 텍스트 절대 금지):
{
  "questions": [
    {
      "id": "q1",
      "question": "로드밸런서 타입을 어떻게 설정할까요?",
      "options": ["ALB (HTTP/HTTPS 기반)", "NLB (TCP/UDP 기반)", "결정하지 않음"],
      "default": 0
    }
  ]
}"""

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"다음 인프라 설명의 모호한 부분을 파악하세요:\n\n{request.text}"},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=1000,
        )
        import json
        result = json.loads(response.choices[0].message.content)
        questions = result.get("questions", [])
        # id 없으면 자동 생성
        for i, q in enumerate(questions):
            if "id" not in q:
                q["id"] = f"q{i+1}"
            q.setdefault("default", 0)
        return {"questions": questions}
    except Exception:
        # clarify 실패해도 생성 흐름은 막지 않음
        return {"questions": []}


@router.post("/text")
async def parse_text(request: TextParseRequest):
    """마크다운/자연어 텍스트 → JSON IR"""
    try:
        from core.parser import TextParser
        parser = TextParser()
        ir = await parser.parse(request.text, diagram_type=request.diagram_type)
        if request.title:
            ir["meta"]["title"] = request.title
        return {"ir": ir}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cli")
async def parse_cli(request: CLIParseRequest):
    """CLI 출력 → JSON IR"""
    try:
        from core.cli_parser import CLIParser
        parser = CLIParser()
        ir = await parser.parse(request.output)
        return {"ir": ir}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/git")
async def parse_git(request: GitParseRequest):
    """Git 레포 URL → JSON IR"""
    try:
        from core.git_analyzer import GitAnalyzer
        analyzer = GitAnalyzer(github_token=request.github_token)
        ir = await analyzer.analyze(request.url)
        return {"ir": ir}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
