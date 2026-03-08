"""텍스트 파서: 마크다운/자연어 → JSON IR"""
import json
import uuid
from datetime import datetime
from typing import Optional

from core.llm import get_llm_client, get_model_name

SYSTEM_PROMPT = """당신은 인프라 아키텍처 전문가입니다.
사용자 텍스트에서 다음을 추출하여 JSON IR로 변환하세요:
1. 클라우드 그룹 (Azure/GCP/AWS/NHN/온프레미스)
2. 각 그룹 내 노드 (서비스, 컴포넌트, 인스턴스)
3. 노드 간 연결 (방향, 프로토콜, 포트)
4. 계층 구조 (그룹 안의 서브그룹)

매핑 규칙:
- "AKS", "쿠버네티스", "k8s", "kubernetes service" → type: "azure_aks"
- "파드", "pod" → type: "k8s_pod"
- "deployment", "deploy" → type: "k8s_deployment"
- "service", "svc" → type: "k8s_service"
- "ingress" → type: "k8s_ingress"
- "GKE", "Google Kubernetes Engine" → type: "gcp_gke"
- "EKS" → type: "aws_eks"
- "RDS", "SQL" → type: "k8s_pod" with type "database"
- "Redis", "cache" → type: "k8s_pod" with type "cache"
- "spot instance" → tags: ["spot_instance"]
- "인터넷", "internet", "외부" → type: "internet"
- IP 주소 → node.ip
- 포트 번호 → edge.label에 포함

노드 colors:
- azure: #0078D4
- gcp: #4285F4
- aws: #FF9900
- k8s: #326CE5
- database: #4CAF50
- cache: #FF5722

반드시 아래 JSON 스키마 형식으로만 출력하세요. JSON 외 텍스트 절대 금지.

JSON IR 스키마:
{
  "meta": {
    "title": "string",
    "version": "1.0",
    "created_at": "ISO datetime",
    "source_type": "text",
    "theme": "light"
  },
  "groups": [
    {
      "id": "grp-xxx",
      "label": "string",
      "cloud": "azure|gcp|aws|nhn|onprem",
      "region": "string (optional)",
      "color": "#hex",
      "bg_opacity": 0.08,
      "position": {"x": 0, "y": 0},
      "size": {"width": 800, "height": 600},
      "children": ["node-id or grp-id"]
    }
  ],
  "nodes": [
    {
      "id": "node-xxx",
      "label": "string",
      "sublabel": "string (optional)",
      "type": "string",
      "icon": "category/filename.svg",
      "parent": "grp-id (optional)",
      "position": {"x": 100, "y": 150},
      "tags": [],
      "ip": "string (optional)",
      "port": "string (optional)",
      "metadata": {}
    }
  ],
  "edges": [
    {
      "id": "edge-xxx",
      "from": "node-id",
      "to": "node-id",
      "label": "string (optional)",
      "style": "solid|dashed",
      "color": "#888888",
      "arrow": "forward|backward|both",
      "line_type": "data|general|alert|vpc|lb"
    }
  ],
  "legend": []
}"""


class TextParser:
    def __init__(self):
        self.client = get_llm_client()
        self.model = get_model_name()
        self.max_retries = 3

    async def parse(self, text: str) -> dict:
        """텍스트 → JSON IR. 실패 시 최대 3회 재시도"""
        last_error = None
        for attempt in range(self.max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": f"다음 인프라 설명을 JSON IR로 변환하세요:\n\n{text}"},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                )
                raw = response.choices[0].message.content
                ir = self._validate_and_fix(raw)
                if ir:
                    return ir
            except Exception as e:
                last_error = e
                if attempt < self.max_retries - 1:
                    continue

        raise RuntimeError(f"파싱 실패 ({self.max_retries}회 시도): {last_error}")

    def _validate_and_fix(self, raw: str) -> Optional[dict]:
        """JSON 파싱 + 스키마 검증. 누락 필드 자동 보완"""
        try:
            ir = json.loads(raw)
        except json.JSONDecodeError:
            # JSON 코드블록 제거 시도
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            elif "```" in raw:
                raw = raw.split("```")[1].split("```")[0].strip()
            try:
                ir = json.loads(raw)
            except json.JSONDecodeError:
                return None

        # 필수 필드 보완
        if "meta" not in ir:
            ir["meta"] = {}
        ir["meta"].setdefault("title", "Untitled Architecture")
        ir["meta"].setdefault("version", "1.0")
        ir["meta"].setdefault("created_at", datetime.utcnow().isoformat() + "Z")
        ir["meta"].setdefault("source_type", "text")
        ir["meta"].setdefault("theme", "light")

        if "groups" not in ir:
            ir["groups"] = []
        if "nodes" not in ir:
            ir["nodes"] = []
        if "edges" not in ir:
            ir["edges"] = []
        if "legend" not in ir:
            ir["legend"] = []

        # 노드 ID 보완
        for node in ir["nodes"]:
            if "id" not in node:
                node["id"] = f"node-{uuid.uuid4().hex[:8]}"
            node.setdefault("position", {"x": 0, "y": 0})
            node.setdefault("tags", [])
            node.setdefault("metadata", {})

        # 그룹 ID 보완
        for group in ir["groups"]:
            if "id" not in group:
                group["id"] = f"grp-{uuid.uuid4().hex[:8]}"
            group.setdefault("position", {"x": 0, "y": 0})
            group.setdefault("size", {"width": 800, "height": 600})
            group.setdefault("bg_opacity", 0.08)
            group.setdefault("children", [])

        # 엣지 ID 보완
        for edge in ir["edges"]:
            if "id" not in edge:
                edge["id"] = f"edge-{uuid.uuid4().hex[:8]}"
            edge.setdefault("style", "solid")
            edge.setdefault("color", "#888888")
            edge.setdefault("arrow", "forward")
            edge.setdefault("line_type", "general")

        return ir
