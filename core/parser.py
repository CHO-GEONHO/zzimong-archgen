"""텍스트 파서: 마크다운/자연어 → JSON IR (v2 — Iconify + DataFlow)"""
import asyncio
import json
import os
import uuid
from datetime import datetime
from typing import Optional

from core.llm import get_llm_client, get_fallback_client, get_model_name, get_parse_client, PARSE_MODEL

# 로컬 공식 아이콘 + Iconify CDN 혼합 참조
# 로컬: "aws-official/ec2.svg" 형식 → /icons/ 경로로 서빙
# Iconify: "prefix:icon-name" 형식 → CDN URL
ICON_REFERENCE = """
### 아이콘 참조 (icon 필드 값 - 로컬 공식 아이콘 우선 사용!)
※ 로컬 경로("dir/file.svg") 형식을 우선 사용. Iconify("prefix:name") 형식은 로컬에 없는 경우에만.

#### AWS (공식 아키텍처 아이콘)
- EC2, 서버, WAS, 앱서버 → "aws-official/ec2.svg"
- ECS, Fargate 컨테이너 → "aws-official/ecs.svg"
- EKS, Kubernetes(AWS) → "aws-official/eks.svg"
- Fargate → "aws-official/fargate.svg"
- Lambda, 서버리스 → "aws-official/lambda.svg"
- S3, 오브젝트 스토리지 → "aws-official/s3.svg"
- S3 Glacier → "aws-official/s3-glacier.svg"
- EBS → "aws-official/ebs.svg"
- EFS → "aws-official/efs.svg"
- RDS, 관계형DB → "aws-official/rds.svg"
- Aurora → "aws-official/aurora.svg"
- DynamoDB, NoSQL(AWS) → "aws-official/dynamodb.svg"
- ElastiCache, Redis(AWS) → "aws-official/elasticache.svg"
- Redshift → "aws-official/redshift.svg"
- Neptune → "aws-official/neptune.svg"
- DocumentDB → "aws-official/documentdb.svg"
- OpenSearch → "aws-official/opensearch.svg"
- SQS, 메시지 큐 → "aws-official/sqs.svg"
- SNS, 알림 → "aws-official/sns.svg"
- EventBridge → "aws-official/eventbridge.svg"
- Step Functions → "aws-official/step-functions.svg"
- CloudFront, CDN → "aws-official/cloudfront.svg"
- ELB, ALB, NLB → "aws-official/elb.svg"
- API Gateway → "aws-official/api-gateway.svg"
- Route53, DNS → "aws-official/route53.svg"
- VPC, 네트워크 → "aws-official/vpc.svg"
- Transit Gateway → "aws-official/transit-gateway.svg"
- CloudWatch, 모니터링 → "aws-official/cloudwatch.svg"
- CloudFormation, IaC → "aws-official/cloudformation.svg"
- CloudTrail → "aws-official/cloudtrail.svg"
- IAM, 권한 → "aws-official/iam.svg"
- Cognito, 인증 → "aws-official/cognito.svg"
- WAF → "aws-official/waf.svg"
- Shield → "aws-official/shield.svg"
- Secrets Manager → "aws-official/secrets-manager.svg"
- KMS → "aws-official/kms.svg"
- Certificate Manager → "aws-official/certificate-manager.svg"
- GuardDuty → "aws-official/guardduty.svg"
- ECR → "aws-official/ecr.svg"
- CodePipeline → "aws-official/codepipeline.svg"
- CodeBuild → "aws-official/codebuild.svg"
- Kinesis → "aws-official/kinesis.svg"
- Glue → "aws-official/glue.svg"
- Athena → "aws-official/athena.svg"
- EMR → "aws-official/emr.svg"
- MSK, Kafka(AWS) → "aws-official/msk.svg"
- SageMaker → "aws-official/sagemaker.svg"
- Bedrock → "aws-official/bedrock.svg"
- Amplify → "aws-official/amplify.svg"
- Batch → "aws-official/batch.svg"

#### Azure (공식 서비스 아이콘 — 반드시 서비스별 구분!)
※ 절대로 모든 Azure 서비스에 같은 아이콘 쓰지 말 것. 각 서비스마다 고유 아이콘 있음.
- AKS, Kubernetes(Azure) → "azure-official/aks.svg"
- Virtual Machine, VM → "azure-official/virtual-machine.svg"
- Functions, 서버리스 → "azure-official/functions.svg"
- App Service → "azure-official/app-service.svg"
- Container Instances → "azure-official/container-instances.svg"
- Container Registry(ACR) → "azure-official/container-registry.svg"
- Cosmos DB → "azure-official/cosmos-db.svg"
- SQL Database → "azure-official/sql-database.svg"
- MySQL(Azure) → "azure-official/mysql.svg"
- PostgreSQL(Azure) → "azure-official/postgresql.svg"
- Cache for Redis → "azure-official/cache-redis.svg"
- Storage Account → "azure-official/storage-accounts.svg"
- Blob Storage → "azure-official/blob-storage.svg"
- Virtual Network, VNet → "azure-official/virtual-network.svg"
- Load Balancer → "azure-official/load-balancer.svg"
- Application Gateway → "azure-official/application-gateway.svg"
- Front Door, CDN → "azure-official/front-door.svg"
- Firewall → "azure-official/firewall.svg"
- WAF → "azure-official/waf.svg"
- DNS → "azure-official/dns-zones.svg"
- Key Vault → "azure-official/key-vault.svg"
- Sentinel → "azure-official/sentinel.svg"
- Active Directory, Entra ID → "azure-official/entra-id.svg"
- Service Bus → "azure-official/service-bus.svg"
- Event Hub → "azure-official/event-hub.svg"
- Event Grid → "azure-official/event-grid.svg"
- Logic Apps → "azure-official/logic-apps.svg"
- API Management, APIM → "azure-official/api-management.svg"
- DevOps → "azure-official/devops.svg"
- Monitor, Application Insights → "azure-official/monitor.svg"
- Log Analytics → "azure-official/log-analytics.svg"
- Synapse → "azure-official/synapse.svg"
- Databricks → "azure-official/databricks.svg"
- SignalR → "azure-official/signalr.svg"
- IoT Hub → "azure-official/iot-hub.svg"
- Bastion → "azure-official/bastion.svg"
- Service Fabric → "azure-official/service-fabric.svg"
- Cognitive Services → "azure-official/cognitive-services.svg"
- Machine Learning → "azure-official/machine-learning.svg"

#### GCP (공식 아키텍처 아이콘)
- GKE, Kubernetes(GCP) → "gcp-official/gke.svg"
- Compute Engine → "gcp-official/compute-engine.svg"
- Cloud Run → "gcp-official/cloud-run.svg"
- Cloud Functions → "gcp-official/cloud-functions.svg"
- App Engine → "gcp-official/app-engine.svg"
- Cloud SQL → "gcp-official/cloud-sql.svg"
- Cloud Spanner → "gcp-official/cloud-spanner.svg"
- Cloud Storage, GCS → "gcp-official/cloud-storage.svg"
- BigQuery → "gcp-official/bigquery.svg"
- Pub/Sub → "gcp-official/pubsub.svg"
- Firestore → "gcp-official/firestore.svg"
- Memorystore, Redis(GCP) → "gcp-official/memorystore.svg"
- VPC → "gcp-official/vpc.svg"
- Cloud Load Balancing → "gcp-official/load-balancing.svg"
- Cloud CDN → "gcp-official/cloud-cdn.svg"
- Cloud DNS → "gcp-official/cloud-dns.svg"
- Cloud Armor, WAF(GCP) → "gcp-official/cloud-armor.svg"
- IAM(GCP) → "gcp-official/identity-and-access-management.svg"
- Secret Manager(GCP) → "gcp-official/secret-manager.svg"
- KMS(GCP) → "gcp-official/key-management-service.svg"
- Cloud Build → "gcp-official/cloud-build.svg"
- Artifact Registry → "gcp-official/artifact-registry.svg"
- Cloud Monitoring → "gcp-official/cloud-monitoring.svg"
- Cloud Logging → "gcp-official/cloud-logging.svg"
- Dataflow → "gcp-official/dataflow.svg"
- Dataproc → "gcp-official/dataproc.svg"
- Vertex AI → "gcp-official/vertex-ai.svg"
- Apigee → "gcp-official/apigee.svg"
- Cloud Tasks → "gcp-official/cloud-tasks.svg"
- Cloud Scheduler → "gcp-official/cloud-scheduler.svg"
- Eventarc → "gcp-official/eventarc.svg"

#### Kubernetes (공식 커뮤니티 아이콘)
- Pod → "k8s-official/pod.svg"
- Deployment → "k8s-official/deployment.svg"
- Service(K8s) → "k8s-official/service.svg"
- Ingress → "k8s-official/ingress.svg"
- ConfigMap → "k8s-official/configmap.svg"
- Secret(K8s) → "k8s-official/secret.svg"
- HPA → "k8s-official/hpa.svg"
- DaemonSet → "k8s-official/daemonset.svg"
- StatefulSet → "k8s-official/statefulset.svg"
- ReplicaSet → "k8s-official/replicaset.svg"
- Job → "k8s-official/job.svg"
- CronJob → "k8s-official/cronjob.svg"
- Node → "k8s-official/node.svg"
- Namespace → "k8s-official/namespace.svg"
- PV, PVC → "k8s-official/pv.svg"
- etcd → "k8s-official/etcd.svg"
- Control Plane → "k8s-official/control-plane.svg"
- Helm → "logos:helm"
- Istio → "simple-icons:istio"
- Docker, 컨테이너 → "skill-icons:docker"
- ArgoCD → "logos:argo"

#### 데이터베이스 / 캐시 (Iconify CDN)
- MySQL → "logos:mysql"
- PostgreSQL → "logos:postgresql"
- MongoDB → "logos:mongodb-icon"
- Redis → "logos:redis"
- Elasticsearch, OpenSearch → "logos:elasticsearch"
- Kafka → "skill-icons:kafka"
- RabbitMQ → "logos:rabbitmq-icon"
- Cassandra → "simple-icons:apachecassandra"

#### 인프라 / 도구 (Iconify CDN)
- Nginx → "logos:nginx"
- Prometheus → "skill-icons:prometheus"
- Grafana → "skill-icons:grafana-light"
- Jenkins → "logos:jenkins"
- GitHub → "logos:github-icon"
- GitLab → "logos:gitlab"
- Terraform → "skill-icons:terraform-light"
- Ansible → "logos:ansible"
- Vault → "logos:vault-icon"
- Traefik → "simple-icons:traefikproxy"

#### 마이크로서비스 타입별 (각 서비스마다 다른 아이콘!)
- 인증/Auth → "generic/auth.svg"
- 사용자/User → "generic/user.svg"
- 주문/Order → "generic/order.svg"
- 결제/Payment → "generic/payment.svg"
- 상품/Product → "generic/product.svg"
- 테넌트/Tenant → "generic/tenant.svg"
- 워크플로우 → "generic/workflow.svg"
- 리포트 → "generic/report.svg"
- 파일 → "generic/file.svg"
- 알림/Notification → "generic/notification.svg"
- 검색/Search → "generic/search.svg"
- 이메일 → "generic/email.svg"
- 채팅 → "generic/chat.svg"
- 분석 → "generic/analytics.svg"
- 재고 → "generic/inventory.svg"
- 배송 → "generic/shipping.svg"

#### 일반 / 개념
- 사용자, 브라우저 → "generic/user.svg"
- 인터넷, 외부망 → "generic/internet.svg"
- 서버 → "generic/server.svg"
- API → "generic/api.svg"
- 마이크로서비스 → "generic/microservice.svg"
- 데이터베이스(일반) → "generic/database.svg"
- 캐시 → "generic/cache.svg"
- 큐 → "generic/queue.svg"
- 로드밸런서 → "generic/lb.svg"
- CDN → "generic/cdn.svg"
- 모니터링 → "generic/monitor.svg"
- 방화벽 → "generic/firewall.svg"
- 게이트웨이 → "generic/gateway.svg"
- 스토리지 → "generic/storage.svg"
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

### 4. 레이아웃 (계층별 X 좌표, 충분한 Y 간격 필수)
노드를 기능 계층에 따라 배치하세요:
- 계층 0 (사용자/인터넷): x=0, y는 200부터 180 간격
- 계층 1 (DNS/CDN/WAF): x=240
- 계층 2 (게이트웨이/LB/APIM): x=480
- 계층 3 (앱/마이크로서비스): x=720, y는 100부터 **180 간격** (서비스가 많으면 더 벌릴 것)
- 계층 4 (캐시/큐/이벤트): x=960
- 계층 5 (데이터베이스): x=1200
- 계층 6 (스토리지/백업): x=1440
같은 계층의 노드는 y축으로 분산. **노드가 겹치지 않도록 y간격은 최소 160 이상.**

기능 도메인이 다른 서비스 그룹(예: 주문/결제/알림)은 y 좌표를 충분히 벌려서 시각적 구분:
- 1번째 서비스 그룹: y=80~400
- 2번째 서비스 그룹: y=500~800
- 3번째 서비스 그룹: y=900~1200

그룹(VPC/VNet/AKS Cluster 등) 노드는 자식 노드 범위 기준으로 여유있게 size 설정:
- width: max(child_nodes_x) - min(child_nodes_x) + 240
- height: max(child_nodes_y) - min(child_nodes_y) + 240
- position: min(child_nodes_x) - 120, min(child_nodes_y) - 100
AKS/EKS 클러스터처럼 내부 서비스가 많으면 height를 충분히 크게(최소 600).

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
        # 초기 다이어그램 생성: Gemini Pro 우선 (빠르고 복잡한 JSON 생성에 적합)
        self.client = get_parse_client()
        self.model = PARSE_MODEL
        # Fallback: DeepSeek (Gemini Pro 실패 시)
        if os.getenv("DEEPSEEK_API_KEY"):
            self.fallback_client = get_llm_client()
            self.fallback_model = get_model_name()
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
            max_tokens=16000,  # Gemini 2.5 Pro는 thinking 토큰 포함 (최대 ~4000 thinking + ~4000 JSON)
        )
        raw = response.choices[0].message.content
        if raw is None:
            return None
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
