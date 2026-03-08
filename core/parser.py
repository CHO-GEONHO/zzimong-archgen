"""텍스트 파서: 마크다운/자연어 → JSON IR (v2 — Iconify + DataFlow)"""
import asyncio
import json
import os
import uuid
from datetime import datetime
from typing import Optional

from core.llm import get_llm_client, get_fallback_client, get_model_name, get_fallback_model_name

# Iconify CDN에서 바로 사용 가능한 아이콘 매핑 테이블
# 형식: "prefix:icon-name" (https://api.iconify.design/{prefix}/{icon-name}.svg)
ICON_REFERENCE = """
### Iconify 아이콘 참조 (icon 필드에 "prefix:name" 형식으로 사용)
※ 검증된 아이콘만 포함. logos: 팩은 컬러 자체 보유, skill-icons: 컬러 자체 보유, mdi:/carbon: 은 모노크롬.

#### AWS (검증됨)
- EC2, 서버, WAS, 앱서버 → "logos:aws-ec2"
- ECS, Fargate → "logos:aws-ecs"
- EKS, Kubernetes(AWS) → "simple-icons:amazoneks"
- Lambda, 서버리스, 함수 → "logos:aws-lambda"
- S3, 오브젝트 스토리지 → "logos:aws-s3"
- RDS, MySQL(AWS), PostgreSQL(AWS), 관계형DB → "logos:aws-rds"
- DynamoDB, NoSQL(AWS) → "logos:aws-dynamodb"
- ElastiCache, Redis(AWS), Memcached → "logos:aws-elasticache"
- SQS, 메시지 큐(AWS) → "simple-icons:amazonsqs"
- SNS, 알림, 토픽 → "simple-icons:amazonsns"
- CloudFront, CDN(AWS) → "logos:aws-cloudfront"
- ALB, NLB, ELB, 로드밸런서(AWS) → "skill-icons:aws-light"
- API Gateway(AWS) → "logos:aws-api-gateway"
- Route53, DNS(AWS) → "simple-icons:amazonroute53"
- CloudWatch, 모니터링(AWS) → "logos:aws-cloudwatch"
- IAM, 권한(AWS) → "logos:aws-iam"
- Cognito, 인증(AWS) → "logos:aws-cognito"
- Secrets Manager → "logos:aws-secrets-manager"
- ACM, 인증서(AWS) → "logos:aws-certificate-manager"
- WAF, 방화벽(AWS) → "logos:aws-waf"
- VPC, 네트워크(AWS) → "logos:aws-vpc"
- NAT Gateway → "logos:aws-nat-gateway"
- ECR, 컨테이너 레지스트리(AWS) → "simple-icons:amazonecr"
- CodePipeline, CI/CD(AWS) → "logos:aws-codepipeline"
- Kinesis, 스트리밍(AWS) → "logos:aws-kinesis"
- Glue, ETL(AWS) → "logos:aws-glue"
- Athena → "logos:aws-athena"
- Redshift, 데이터웨어하우스(AWS) → "logos:aws-redshift"
- Step Functions → "logos:aws-step-functions"
- CloudFormation, IaC(AWS) → "logos:aws-cloudformation"

#### Azure (검증됨)
- 모든 Azure 서비스 → "skill-icons:azure-light"
- AKS, Kubernetes(Azure) → "skill-icons:azure-light"
- Azure SQL, CosmosDB, Storage, Functions 등 → "skill-icons:azure-light"

#### GCP (검증됨)
- 모든 GCP 서비스 → "skill-icons:gcp-light"
- GKE, Cloud Run, BigQuery, Firestore, Pub/Sub 등 → "skill-icons:gcp-light"
- BigQuery 특별 → "simple-icons:googlebigquery"
- Firebase → "logos:firebase"

#### Kubernetes / 컨테이너 (검증됨)
- Pod, Deployment, Service, Namespace, 쿠버네티스 전반 → "skill-icons:kubernetes"
- Ingress(k8s), Nginx Ingress → "logos:nginx"
- Helm → "logos:helm"
- Istio, 서비스 메시 → "simple-icons:istio"
- Podman → "simple-icons:podman"
- Docker, 컨테이너 → "skill-icons:docker"

#### 데이터베이스 / 캐시 (검증됨)
- MySQL → "logos:mysql"
- PostgreSQL → "logos:postgresql"
- MongoDB → "logos:mongodb-icon"
- Redis → "logos:redis"
- Elasticsearch, OpenSearch → "logos:elasticsearch"
- Kafka → "skill-icons:kafka"
- RabbitMQ → "logos:rabbitmq-icon"
- Cassandra → "simple-icons:apachecassandra"

#### 인프라 / 도구 (검증됨)
- Nginx → "logos:nginx"
- Apache → "logos:apache"
- Prometheus → "skill-icons:prometheus"
- Grafana → "skill-icons:grafana-light"
- Jenkins → "logos:jenkins"
- GitHub → "logos:github-icon"
- GitLab → "logos:gitlab"
- Terraform → "skill-icons:terraform-light"
- Ansible → "logos:ansible"
- Vault → "logos:vault-icon"
- Traefik → "simple-icons:traefikproxy"

#### 일반 / 개념
- 사용자, 브라우저, 클라이언트, 외부 → "mdi:account-circle-outline"
- 인터넷, 외부망, 공인 → "mdi:web"
- 서버, 온프레미스 서버 → "mdi:server"
- API, 게이트웨이(일반) → "mdi:api"
- 마이크로서비스 → "mdi:puzzle-outline"
- 배치, 스케줄러 → "mdi:clock-outline"
- 모바일 → "mdi:cellphone"
- 모니터링(일반) → "mdi:chart-line"
- 알림, 메시지 → "mdi:bell-outline"
- CDN(일반) → "mdi:lightning-bolt"
- 로드밸런서(일반) → "mdi:scale-balance"
- 데이터베이스(일반) → "carbon:data-base"
- 캐시(일반) → "mdi:memory"
- 큐(일반) → "mdi:queue-first-in-last-out"
- 스토리지(일반) → "mdi:database"
- 파일시스템 → "mdi:folder-network"
"""

SYSTEM_PROMPT = f"""당신은 인프라 아키텍처 다이어그램 전문가입니다.
사용자의 텍스트를 분석하여 완성도 높은 JSON IR로 변환하세요.

## 출력 요구사항

### 1. 데이터 플로우 분석
실제 데이터/요청이 흐르는 순서를 data_flow 배열에 한국어로 작성:
- 사용자 진입점부터 최종 데이터 저장까지 번호순
- 각 단계마다 "출발점 → 목적지 (프로토콜/역할 설명)" 형식
- 비동기 경로는 별도 항목으로 분리

### 2. 노드 추론 (명시되지 않아도 추가)
- AWS인데 EC2가 있으면 → VPC, Security Group 포함 고려
- 외부 트래픽 있으면 → Internet Gateway 또는 사용자 브라우저 노드 추가
- 데이터베이스 있으면 → 읽기 복제본 또는 Replica 언급 있으면 추가
- 비동기 처리 있으면 → Worker/Consumer 노드 추가
- 쿠버네티스 있으면 → Ingress Controller 포함

### 3. 아이콘 (중요!)
모든 노드의 icon 필드를 반드시 채우세요.
아래 Iconify 매핑표를 참고하여 "prefix:icon-name" 형식으로 설정.
{ICON_REFERENCE}

### 4. 레이아웃 (계층별 X 좌표)
노드를 기능 계층에 따라 배치하세요:
- 계층 0 (사용자/인터넷): x=0, y는 100부터 150 간격
- 계층 1 (DNS/CDN): x=220
- 계층 2 (게이트웨이/LB): x=440
- 계층 3 (앱/서비스): x=660, y는 100부터 120 간격
- 계층 4 (캐시/큐): x=880
- 계층 5 (데이터베이스): x=1100
- 계층 6 (스토리지/백업): x=1320
같은 계층의 노드는 y축으로 분산

그룹 노드는 자식 노드 범위를 기준으로 여유있게 size 설정:
- width: max(child_nodes_x) - min(child_nodes_x) + 200
- height: max(child_nodes_y) - min(child_nodes_y) + 200
- position: min(child_nodes_x) - 100, min(child_nodes_y) - 80

### 5. 연결 스타일
- HTTP/HTTPS 요청: line_type="general", style="solid"
- 데이터 동기화/스트리밍: line_type="data", animated=true 효과
- 비동기/이벤트: line_type="data", style="dashed"
- 보안/인증: line_type="alert"
- VPC 경계: line_type="vpc"

## JSON 스키마 (이 형식 외 텍스트 절대 금지)

{{
  "meta": {{
    "title": "아키텍처 제목 (서비스 특성 반영)",
    "version": "1.0",
    "created_at": "ISO datetime",
    "source_type": "text",
    "theme": "dark"
  }},
  "data_flow": [
    "1. 사용자 브라우저 → CloudFront CDN (HTTPS 요청)",
    "2. CloudFront → ALB (캐시 미스 시 오리진 전달)",
    "3. ALB → Web Server EC2 (라운드 로빈 분산)",
    "4. Web Server → ElastiCache Redis (세션 캐시 조회, <1ms)",
    "5. Web Server → RDS MySQL Primary (읽기/쓰기 쿼리)",
    "6. Web Server → S3 (정적 파일 업로드)",
    "7. 배치 서버 → SQS → Lambda (비동기 주문 처리)"
  ],
  "groups": [
    {{
      "id": "grp-xxx",
      "label": "AWS ap-northeast-2",
      "cloud": "aws",
      "region": "ap-northeast-2",
      "color": "#FF9900",
      "bg_opacity": 0.06,
      "position": {{"x": 100, "y": 50}},
      "size": {{"width": 1000, "height": 600}},
      "children": ["node-id"]
    }}
  ],
  "nodes": [
    {{
      "id": "node-xxx",
      "label": "서비스 이름",
      "sublabel": "역할 설명 (짧게, 예: Auto Scaling, Primary/Replica)",
      "type": "aws_ec2",
      "icon": "logos:aws-ec2",
      "parent": "grp-id (있는 경우만)",
      "position": {{"x": 660, "y": 100}},
      "tags": [],
      "ip": "null or 실제 IP",
      "port": "null or 포트번호",
      "metadata": {{}}
    }}
  ],
  "edges": [
    {{
      "id": "edge-xxx",
      "from": "node-id",
      "to": "node-id",
      "label": "HTTPS / 포트 / 프로토콜",
      "style": "solid",
      "color": "#888888",
      "arrow": "forward",
      "line_type": "general"
    }}
  ],
  "legend": []
}}"""


class TextParser:
    def __init__(self):
        self.client = get_llm_client()
        self.model = get_model_name()
        # Fallback은 DeepSeek 사용 시에만 의미있음
        if os.getenv("DEEPSEEK_API_KEY"):
            self.fallback_client = get_fallback_client()
            self.fallback_model = get_fallback_model_name()
        else:
            self.fallback_client = None
            self.fallback_model = None

    def _call_llm(self, client, model: str, text: str) -> Optional[dict]:
        """LLM 호출 → IR dict 반환. 실패 시 None"""
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": (
                    f"다음 인프라 설명을 분석하여 JSON IR로 변환하세요.\n"
                    f"모든 노드에 icon 필드를 채우고, data_flow를 상세히 작성하세요.\n\n"
                    f"---\n{text}\n---"
                )},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=4000,
        )
        raw = response.choices[0].message.content
        return self._validate_and_fix(raw)

    async def parse(self, text: str) -> dict:
        """텍스트 → JSON IR. 동기 LLM 호출을 thread pool에서 실행 (이벤트 루프 블로킹 방지)."""
        # 1차: primary (DeepSeek) — 스레드풀에서 실행
        primary_err = None
        try:
            ir = await asyncio.to_thread(self._call_llm, self.client, self.model, text)
            if ir:
                return ir
        except Exception as e:
            primary_err = e

        # fallback (Gemini) 시도
        if self.fallback_client:
            try:
                ir = await asyncio.to_thread(
                    self._call_llm, self.fallback_client, self.fallback_model, text
                )
                if ir:
                    return ir
                raise RuntimeError("fallback JSON 변환 불가")
            except Exception as fallback_err:
                if primary_err:
                    raise RuntimeError(
                        f"파싱 실패 — primary: {primary_err}, fallback: {fallback_err}"
                    )
                raise RuntimeError(f"파싱 실패 (fallback): {fallback_err}")

        if primary_err:
            raise RuntimeError(f"파싱 실패: {primary_err}")
        raise RuntimeError("파싱 실패: JSON 변환 불가")

    def _validate_and_fix(self, raw: str) -> Optional[dict]:
        """JSON 파싱 + 스키마 검증. 누락 필드 자동 보완"""
        try:
            ir = json.loads(raw)
        except json.JSONDecodeError:
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            elif "```" in raw:
                raw = raw.split("```")[1].split("```")[0].strip()
            try:
                ir = json.loads(raw)
            except json.JSONDecodeError:
                return None

        if "meta" not in ir:
            ir["meta"] = {}
        ir["meta"].setdefault("title", "Untitled Architecture")
        ir["meta"].setdefault("version", "1.0")
        ir["meta"].setdefault("created_at", datetime.utcnow().isoformat() + "Z")
        ir["meta"].setdefault("source_type", "text")
        ir["meta"].setdefault("theme", "dark")

        ir.setdefault("data_flow", [])
        ir.setdefault("groups", [])
        ir.setdefault("nodes", [])
        ir.setdefault("edges", [])
        ir.setdefault("legend", [])

        for node in ir["nodes"]:
            if "id" not in node:
                node["id"] = f"node-{uuid.uuid4().hex[:8]}"
            node.setdefault("position", {"x": 0, "y": 0})
            node.setdefault("tags", [])
            node.setdefault("metadata", {})
            # icon이 빈 문자열이면 None으로
            if node.get("icon") == "":
                node["icon"] = None

        for group in ir["groups"]:
            if "id" not in group:
                group["id"] = f"grp-{uuid.uuid4().hex[:8]}"
            group.setdefault("position", {"x": 0, "y": 0})
            group.setdefault("size", {"width": 800, "height": 600})
            group.setdefault("bg_opacity", 0.06)
            group.setdefault("children", [])

        for edge in ir["edges"]:
            if "id" not in edge:
                edge["id"] = f"edge-{uuid.uuid4().hex[:8]}"
            edge.setdefault("style", "solid")
            edge.setdefault("color", "#888888")
            edge.setdefault("arrow", "forward")
            edge.setdefault("line_type", "general")

        return ir
