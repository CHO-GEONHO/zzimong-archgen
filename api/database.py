"""SQLite DB 초기화 및 연결 관리"""
import os
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy import Column, String, Text, DateTime, Integer, text
from datetime import datetime

DB_PATH = os.getenv("DB_PATH", "/Volumes/OpenClawSSD/projects/archgen/db/archgen.db")
Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Diagram(Base):
    __tablename__ = "diagrams"
    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    ir_json = Column(Text, nullable=False)
    thumbnail_path = Column(String)
    source_type = Column(String)  # text | cli | git | manual
    source_ref = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DiagramVersion(Base):
    __tablename__ = "diagram_versions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    diagram_id = Column(String, nullable=False)
    ir_json = Column(Text, nullable=False)
    version_label = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class ModifyHistory(Base):
    __tablename__ = "modify_history"
    id = Column(Integer, primary_key=True, autoincrement=True)
    diagram_id = Column(String)
    instruction = Column(Text)
    ir_before = Column(Text)
    ir_after = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


async def init_db():
    """테이블 생성"""
    # aiosqlite 의존성 확인
    try:
        import aiosqlite  # noqa
    except ImportError:
        raise RuntimeError("aiosqlite 패키지 필요: pip install aiosqlite")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
