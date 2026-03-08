"""Git 레포 분석기: URL → JSON IR"""
import os
import shutil
import tempfile
import json
from pathlib import Path
from typing import Optional
from datetime import datetime

from core.llm import get_llm_client, get_model_name


# 분석 우선순위 파일 패턴
PRIORITY_PATTERNS = [
    # 1순위 - 배포 구조
    "**/k8s/**/*.yaml", "**/kubernetes/**/*.yaml",
    "**/deployment*.yaml", "**/service*.yaml",
    "**/helm/**/values.yaml", "**/Chart.yaml",
    "**/terraform/**/*.tf",
    "**/docker-compose*.yaml", "**/docker-compose*.yml",
    "**/Dockerfile",
    # 2순위 - 서비스 관계
    "**/config/*.yaml", "**/config/*.json",
    "**/.env.example",
    # 3순위 - 보조
    "README.md", "Makefile",
]

MAX_FILE_SIZE = 50_000  # 50KB per file
TOKEN_BUDGET = 40_000   # 약 40K 토큰 (DeepSeek 64K 한도 내 안전 마진)


class GitAnalyzer:
    def __init__(self, github_token: Optional[str] = None):
        self.github_token = github_token or os.getenv("GITHUB_PAT", "")
        self.client = get_llm_client()
        self.model = get_model_name()

    async def analyze(self, repo_url: str) -> dict:
        """Git 레포 URL → JSON IR"""
        tmp_dir = tempfile.mkdtemp(prefix="archgen_git_")
        try:
            # Shallow clone (depth=1)
            clone_url = self._build_clone_url(repo_url)
            import subprocess
            result = subprocess.run(
                ["git", "clone", "--depth=1", clone_url, tmp_dir],
                capture_output=True, text=True, timeout=120
            )
            if result.returncode != 0:
                raise RuntimeError(f"Git clone 실패: {result.stderr}")

            # 파일 수집
            content = self._collect_files(tmp_dir)

            # LLM 분석
            ir = await self._analyze_with_llm(repo_url, content)
            return ir

        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def _build_clone_url(self, url: str) -> str:
        """GitHub PAT 포함 clone URL 생성"""
        if self.github_token and "github.com" in url:
            url = url.replace("https://", f"https://{self.github_token}@")
        return url

    def _collect_files(self, repo_dir: str) -> str:
        """우선순위 파일 수집 → 토큰 예산 내에서"""
        collected = []
        total_chars = 0
        char_limit = TOKEN_BUDGET * 3  # 대략 3 chars/token

        base = Path(repo_dir)

        for pattern in PRIORITY_PATTERNS:
            if total_chars >= char_limit:
                break
            for f in base.glob(pattern):
                if total_chars >= char_limit:
                    break
                try:
                    content = f.read_text(errors="ignore")[:MAX_FILE_SIZE]
                    rel_path = str(f.relative_to(base))
                    collected.append(f"=== {rel_path} ===\n{content}\n")
                    total_chars += len(content)
                except Exception:
                    pass

        return "\n".join(collected)

    async def _analyze_with_llm(self, repo_url: str, file_content: str) -> dict:
        """수집된 파일 내용 → JSON IR"""
        from core.parser import SYSTEM_PROMPT

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"""다음 Git 레포({repo_url})의 파일들을 분석하여 인프라 아키텍처 JSON IR을 생성하세요.

파일 내용:
{file_content[:TOKEN_BUDGET * 3]}"""},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )

        from core.parser import TextParser
        parser = TextParser()
        ir = parser._validate_and_fix(response.choices[0].message.content)
        if ir:
            ir["meta"]["source_type"] = "git"
            ir["meta"]["source_ref"] = repo_url
        return ir or {
            "meta": {"title": repo_url, "version": "1.0", "created_at": datetime.utcnow().isoformat() + "Z", "source_type": "git", "source_ref": repo_url, "theme": "light"},
            "groups": [], "nodes": [], "edges": [], "legend": [],
        }
