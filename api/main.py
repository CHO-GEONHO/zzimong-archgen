"""
ArchGen FastAPI Backend
포트: 8081 (monitor dashboard: 8080, archgen: 8081)
"""
import os
import sys
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# 프로젝트 루트를 sys.path에 추가
sys.path.insert(0, str(Path(__file__).parent.parent))

from api.database import init_db
from api.routers import parse, diagrams, icons, export, analyze

ARCHGEN_ROOT = Path(os.getenv("ARCHGEN_ROOT", "/Volumes/OpenClawSSD/projects/archgen"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작 시 DB 초기화
    await init_db()
    yield


app = FastAPI(
    title="ArchGen API",
    description="AI 인프라 아키텍처 생성기",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS (프론트엔드 개발 시 필요)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 정적 파일 서빙 (아이콘)
icons_dir = ARCHGEN_ROOT / "icons"
if icons_dir.exists():
    app.mount("/icons", StaticFiles(directory=str(icons_dir)), name="icons")

# 라우터 등록
app.include_router(parse.router, prefix="/api/parse", tags=["parse"])
app.include_router(diagrams.router, prefix="/api/diagrams", tags=["diagrams"])
app.include_router(icons.router, prefix="/api/icons", tags=["icons"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
app.include_router(analyze.router, prefix="/api/analyze", tags=["analyze"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


# 프론트엔드 정적 파일 서빙 (SPA)
frontend_dist = ARCHGEN_ROOT / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    @app.get("/favicon.png")
    async def serve_favicon():
        return FileResponse(str(frontend_dist / "favicon.png"), media_type="image/png")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """SPA catch-all: API 경로가 아닌 모든 요청은 index.html로"""
        index = frontend_dist / "index.html"
        return FileResponse(str(index))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("ARCHGEN_PORT", 8081))
    uvicorn.run("api.main:app", host="0.0.0.0", port=port, reload=True)
