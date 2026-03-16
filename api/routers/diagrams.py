"""다이어그램 CRUD + 수정 라우터"""
import uuid
import json
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from api.database import get_db, Diagram, DiagramVersion, ModifyHistory
from core.usage_logger import CallTimer, log_response, log_error

router = APIRouter()


class SaveDiagramRequest(BaseModel):
    title: str
    ir_json: dict
    source_type: Optional[str] = "manual"
    source_ref: Optional[str] = None


class ModifyRequest(BaseModel):
    diagram_id: str
    instruction: str
    ir_json: dict  # 현재 IR (프론트에서 전달)


class QueryRequest(BaseModel):
    ir_json: dict
    query: str


@router.get("")
async def list_diagrams(db: AsyncSession = Depends(get_db)):
    """저장된 다이어그램 목록"""
    result = await db.execute(
        select(Diagram).order_by(Diagram.updated_at.desc())
    )
    diagrams = result.scalars().all()
    return [
        {
            "id": d.id,
            "title": d.title,
            "source_type": d.source_type,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        }
        for d in diagrams
    ]


@router.post("")
async def save_diagram(request: SaveDiagramRequest, db: AsyncSession = Depends(get_db)):
    """다이어그램 저장"""
    diagram_id = str(uuid.uuid4())
    diagram = Diagram(
        id=diagram_id,
        title=request.title,
        ir_json=json.dumps(request.ir_json, ensure_ascii=False),
        source_type=request.source_type,
        source_ref=request.source_ref,
    )
    db.add(diagram)
    # 최초 버전 저장
    version = DiagramVersion(
        diagram_id=diagram_id,
        ir_json=json.dumps(request.ir_json, ensure_ascii=False),
        version_label="v1",
    )
    db.add(version)
    await db.commit()
    return {"id": diagram_id, "title": request.title}


@router.get("/{diagram_id}")
async def get_diagram(diagram_id: str, db: AsyncSession = Depends(get_db)):
    """다이어그램 조회"""
    result = await db.execute(select(Diagram).where(Diagram.id == diagram_id))
    diagram = result.scalar_one_or_none()
    if not diagram:
        raise HTTPException(status_code=404, detail="Diagram not found")
    return {
        "id": diagram.id,
        "title": diagram.title,
        "ir_json": json.loads(diagram.ir_json),
        "source_type": diagram.source_type,
        "created_at": diagram.created_at.isoformat() if diagram.created_at else None,
    }


@router.put("/{diagram_id}")
async def update_diagram(
    diagram_id: str,
    request: SaveDiagramRequest,
    db: AsyncSession = Depends(get_db),
):
    """다이어그램 업데이트"""
    result = await db.execute(select(Diagram).where(Diagram.id == diagram_id))
    diagram = result.scalar_one_or_none()
    if not diagram:
        raise HTTPException(status_code=404, detail="Diagram not found")

    # 버전 스냅샷 저장
    versions_result = await db.execute(
        select(DiagramVersion).where(DiagramVersion.diagram_id == diagram_id)
    )
    version_count = len(versions_result.scalars().all())
    version = DiagramVersion(
        diagram_id=diagram_id,
        ir_json=json.dumps(request.ir_json, ensure_ascii=False),
        version_label=f"v{version_count + 1}",
    )
    db.add(version)

    diagram.title = request.title
    diagram.ir_json = json.dumps(request.ir_json, ensure_ascii=False)
    diagram.updated_at = datetime.utcnow()
    await db.commit()
    return {"id": diagram_id, "message": "updated"}


@router.delete("/{diagram_id}")
async def delete_diagram(diagram_id: str, db: AsyncSession = Depends(get_db)):
    """다이어그램 삭제"""
    result = await db.execute(select(Diagram).where(Diagram.id == diagram_id))
    diagram = result.scalar_one_or_none()
    if not diagram:
        raise HTTPException(status_code=404, detail="Diagram not found")
    await db.delete(diagram)
    await db.commit()
    return {"message": "deleted"}


@router.post("/modify")
async def modify_diagram(request: ModifyRequest, db: AsyncSession = Depends(get_db)):
    """자연어 수정 지시 → 수정된 JSON IR"""
    try:
        from core.llm import get_llm_client
        client = get_llm_client()

        system_prompt = """당신은 인프라 아키텍처 JSON IR 수정 전문가입니다.
사용자의 수정 지시에 따라 JSON IR을 정확히 수정하세요.

규칙:
- 수정 지시에 해당하는 부분만 변경하고, 나머지는 절대 변경하지 마세요.
- 반드시 유효한 JSON만 출력하세요. JSON 외 텍스트는 절대 금지.
- 노드/엣지 ID는 변경하지 마세요.

엣지 routing_mode 활용:
- "auto": 자동 (기본값)
- "bezier": 부드러운 곡선
- "straight": 직선
- "polyline": 꺾인 선 (waypoints와 함께)

엣지 arrow 값:
- "forward": from→to 방향
- "backward": to→from 방향
- "both": 양방향
- "none": 화살표 없음

엣지 line_type:
- "general": 일반 (회색)
- "data": 데이터 흐름 (보라색, 애니메이션)
- "alert": 경고/보안 (빨간색)
- "blue": 파란색
- "lb": 로드밸런서 (점선)
- "vpc": VPC 연결 (점선, 옅은 색)"""

        user_prompt = f"""현재 JSON IR:
{json.dumps(request.ir_json, ensure_ascii=False, indent=2)}

수정 지시: {request.instruction}

수정된 전체 JSON IR을 출력하세요:"""

        _model = "deepseek-chat"
        try:
            with CallTimer(_model) as t:
                response = client.chat.completions.create(
                    model=_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    response_format={"type": "json_object"},
                )
            log_response(_model, response, t.elapsed)
        except Exception:
            log_error(_model)
            raise

        modified_ir = json.loads(response.choices[0].message.content)

        # 수정 이력 저장 (실패해도 수정 결과는 반환)
        try:
            history = ModifyHistory(
                diagram_id=request.diagram_id,
                instruction=request.instruction,
                ir_before=json.dumps(request.ir_json, ensure_ascii=False),
                ir_after=json.dumps(modified_ir, ensure_ascii=False),
            )
            db.add(history)
            await db.commit()
        except Exception:
            pass

        return {"ir": modified_ir}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query")
async def query_diagram(request: QueryRequest):
    """자연어 쿼리 → 하이라이트 노드/엣지 목록 + 설명"""
    try:
        from core.llm import get_llm_client
        client = get_llm_client()

        system_prompt = """당신은 인프라 아키텍처 분석 전문가입니다.
사용자의 쿼리에 따라 JSON IR을 분석하고 결과를 반환하세요.

반환 형식:
{
  "highlight_nodes": ["node-id-1", "node-id-2"],
  "highlight_edges": ["edge-id-1"],
  "explanation": "한국어로 설명",
  "answer": "직접 답변 (예: DB가 3개 있습니다)"
}"""

        _model = "deepseek-chat"
        try:
            with CallTimer(_model) as t:
                response = client.chat.completions.create(
                    model=_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"IR: {json.dumps(request.ir_json, ensure_ascii=False)}\n\n쿼리: {request.query}"},
                    ],
                    response_format={"type": "json_object"},
                )
            log_response(_model, response, t.elapsed)
        except Exception:
            log_error(_model)
            raise

        result = json.loads(response.choices[0].message.content)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
