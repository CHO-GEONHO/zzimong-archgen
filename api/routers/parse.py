"""파싱 라우터: text / cli / git → JSON IR"""
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class TextParseRequest(BaseModel):
    text: str
    title: Optional[str] = None


class CLIParseRequest(BaseModel):
    output: str
    cloud_hint: Optional[str] = None  # azure | gcp | aws | k8s


class GitParseRequest(BaseModel):
    url: str
    github_token: Optional[str] = None


@router.post("/text")
async def parse_text(request: TextParseRequest):
    """마크다운/자연어 텍스트 → JSON IR"""
    try:
        from core.parser import TextParser
        parser = TextParser()
        ir = await parser.parse(request.text)
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
