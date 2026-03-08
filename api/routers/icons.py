"""아이콘 라우터"""
import json
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

ICONS_DIR = Path(os.getenv("ICONS_DIR", "/Volumes/OpenClawSSD/projects/archgen/icons"))
MANIFEST_PATH = ICONS_DIR / "manifest.json"


def load_manifest() -> dict:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text())
    return {}


@router.get("")
async def list_icons():
    """설치된 아이콘 목록"""
    manifest = load_manifest()
    return {"icons": manifest, "count": len(manifest)}


class IconSearchRequest(BaseModel):
    node_type: str
    context: str = ""


@router.post("/search")
async def search_icons(request: IconSearchRequest):
    """동적 아이콘 검색 (Iconify API)"""
    try:
        from core.icon_search import IconSearch
        searcher = IconSearch()
        results = await searcher.search(request.node_type, request.context)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class IconDownloadRequest(BaseModel):
    icon_url: str
    node_id: str
    icon_name: str


@router.post("/download")
async def download_icon(request: IconDownloadRequest):
    """아이콘 다운로드 → cache/ 저장"""
    try:
        from core.icon_search import IconSearch
        searcher = IconSearch()
        path = await searcher.download_and_cache(request.icon_url, request.node_id)
        return {"path": path, "cached": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
