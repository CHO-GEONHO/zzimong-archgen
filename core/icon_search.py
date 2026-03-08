"""동적 아이콘 검색/다운로드 (Iconify + Simple Icons)"""
import httpx
import json
import os
from pathlib import Path
from typing import Optional

ICONS_DIR = Path(os.getenv("ICONS_DIR", "/Volumes/OpenClawSSD/projects/archgen/icons"))
MANIFEST_PATH = ICONS_DIR / "manifest.json"


class IconSearch:
    async def search(self, node_type: str, context: str = "") -> list:
        """Iconify API + Simple Icons 병렬 검색"""
        # 검색어 생성 (node_type에서 직접)
        keywords = self._generate_keywords(node_type)
        results = []

        async with httpx.AsyncClient(timeout=10.0) as client:
            for keyword in keywords[:3]:
                try:
                    resp = await client.get(
                        f"https://api.iconify.design/search",
                        params={"query": keyword, "limit": 6},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        for icon_name in data.get("icons", [])[:4]:
                            parts = icon_name.split(":")
                            if len(parts) == 2:
                                prefix, name = parts
                                results.append({
                                    "id": icon_name,
                                    "name": name,
                                    "source": "iconify",
                                    "preview_url": f"https://api.iconify.design/{prefix}/{name}.svg",
                                    "download_url": f"https://api.iconify.design/{prefix}/{name}.svg",
                                })
                except Exception:
                    pass

        # 중복 제거
        seen = set()
        unique = []
        for r in results:
            if r["id"] not in seen:
                seen.add(r["id"])
                unique.append(r)

        return unique[:12]

    def _generate_keywords(self, node_type: str) -> list:
        """node_type에서 검색어 생성"""
        mapping = {
            "azure_aks": ["kubernetes", "docker", "cluster"],
            "k8s_pod": ["kubernetes", "docker", "container"],
            "k8s_deployment": ["deploy", "kubernetes", "app"],
            "k8s_service": ["service", "network", "connection"],
            "k8s_ingress": ["nginx", "proxy", "routing"],
            "azure_sql": ["database", "sql", "azure"],
            "azure_storage": ["storage", "cloud", "azure"],
            "azure_lb": ["load balancer", "balance", "proxy"],
            "gcp_gke": ["kubernetes", "google cloud", "cluster"],
            "aws_eks": ["kubernetes", "aws", "cluster"],
            "internet": ["internet", "globe", "network"],
            "docker_container": ["docker", "container", "whale"],
        }

        if node_type in mapping:
            return mapping[node_type]

        # 기본: 언더스코어 제거 후 단어 분리
        words = node_type.replace("_", " ").replace("-", " ").split()
        return [node_type.replace("_", "-")] + words[:2]

    async def download_and_cache(self, icon_url: str, node_id: str) -> str:
        """선택된 아이콘 다운로드 → cache/ 저장"""
        cache_dir = ICONS_DIR / "cache"
        cache_dir.mkdir(exist_ok=True)

        filename = f"{node_id}.svg"
        cache_path = cache_dir / filename

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(icon_url)
            if resp.status_code == 200:
                cache_path.write_bytes(resp.content)

        return f"cache/{filename}"
