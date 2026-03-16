"""텍스트 파서: 마크다운/자연어 → JSON IR (v2 — Iconify + DataFlow)"""
import asyncio
import json
import os
import uuid
from datetime import datetime
from typing import Optional

from core.llm import get_llm_client, get_fallback_client, get_model_name, get_parse_client, PARSE_MODEL
from core.usage_logger import CallTimer, log_response, log_error

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
- 계층 0 (사용자/인터넷): x=0
- 계층 1 (DNS/CDN/WAF): x=280
- 계층 2 (게이트웨이/LB/APIM): x=560
- 계층 3 (앱/마이크로서비스): x=840
- 계층 4 (캐시/큐/이벤트): x=1120
- 계층 5 (데이터베이스): x=1400
- 계층 6 (스토리지/백업): x=1680

**노드 겹침 방지:**
- 각 노드는 180x100 크기를 차지합니다
- 같은 계층(같은 x값)의 노드는 y간격을 **최소 220 이상** 확보
- 서로 다른 계층이라도 y좌표가 같고 x좌표 차이가 280 미만이면 겹칠 수 있으니 주의

**그룹 배치 규칙 (매우 중요!):**
- CloudWatch, CloudTrail, ECR, Secrets Manager, ElastiCache 등 공유 인프라도 반드시 AWS 리전 그룹의 자식으로 배치
- CloudFront, Route53 등 글로벌/엣지 서비스도 AWS 리전 그룹 안에 배치 (VPC 외부 서브그룹 활용)
- 노드의 parent 필드: 반드시 그룹 목록에 존재하는 id만 사용
- parent 없는 독립 노드 허용: "사용자/브라우저", "온프레미스 서버", "외부 인터넷", "외부 API(Stripe 등)" 만
- **EKS 외부 공유 인프라 배치**: EKS 클러스터 그룹 밖, AWS 리전 그룹 안에 별도 위치에 배치
  - 예: EKS 클러스터가 x=300~1200, y=100~900 → 공유 인프라는 y=950 이하에 배치
  - ElastiCache는 EKS 클러스터 우측에, ECR/CloudWatch/Secrets Manager는 클러스터 하단에 배치

**그룹 크기 설정** (시스템이 자동 보정하므로 대략적으로):
- width: max(child_x) - min(child_x) + 300
- height: max(child_y) - min(child_y) + 200
- position: min(child_x) - 60, min(child_y) - 60
- 자식이 1~2개인 그룹: width=350, height=250

기능 도메인이 다른 서비스 그룹(예: 주문/결제/알림)은 y 좌표를 충분히 벌려서 시각적 구분:
- 1번째 서비스 그룹: y=80~400
- 2번째 서비스 그룹: y=500~800
- 3번째 서비스 그룹: y=900~1200

### 5. 연결 (엣지) 규칙
**방향 원칙 — from은 요청을 보내는 쪽, to는 요청을 받는 쪽:**
- 사용자 → CDN → LB → 앱서비스 → DB (요청 흐름 방향)
- from: "node-user", to: "node-cdn" (사용자가 CDN에 요청)
- from: "node-app", to: "node-db" (앱이 DB에 쿼리)
- arrow 기본값은 "forward" (from→to 방향 화살표)

**스타일:**
- HTTP/HTTPS 요청: line_type="general", arrow="forward"
- 데이터 동기화: line_type="data", arrow="forward" (보라색 애니메이션)
- 비동기/이벤트: line_type="data", style="dashed", arrow="forward"
- 보안/인증: line_type="alert", arrow="forward"
- 양방향 통신 (WebSocket, gRPC 스트리밍 등): arrow="both"

**라우팅 (routing_mode):**
- **routing_mode를 절대 지정하지 말 것** — 항상 생략. 시스템이 자동으로 직각 라우팅 처리.
- routing_mode 필드 자체를 JSON에 포함하지 마세요.


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
      "arrow": "forward",
      "line_type": "general"
    }}
  ],
  "legend": []
}}"""


SEQUENCE_SYSTEM_PROMPT = """당신은 시퀀스 다이어그램 전문가입니다.
사용자의 텍스트를 분석하여 시스템 간 메시지 흐름을 JSON IR로 변환하세요.

## JSON 스키마

{
  "meta": {
    "title": "시퀀스 다이어그램 제목",
    "version": "1.0",
    "created_at": "ISO datetime",
    "source_type": "text",
    "theme": "dark",
    "diagram_type": "sequence"
  },
  "data_flow": ["1. 설명..."],
  "groups": [],
  "nodes": [
    { "id": "user", "label": "사용자", "type": "actor", "icon": "generic/user.svg" },
    { "id": "api", "label": "API 서버", "type": "actor", "icon": "generic/api.svg" }
  ],
  "edges": [
    { "id": "e1", "from": "user", "to": "api", "label": "1. POST /login", "sequence": 1, "arrow": "forward", "line_type": "general" }
  ],
  "legend": []
}

## 규칙
- nodes는 액터(참여자)만. type은 "actor".
- edges는 메시지 순서대로. sequence 필드에 순서 번호(1부터).
- label에 "순서번호. 메시지내용" 형식 사용.
- 반드시 JSON만 출력."""


FLOWCHART_SYSTEM_PROMPT = """당신은 플로우차트 전문가입니다.
사용자의 텍스트를 분석하여 프로세스 흐름을 JSON IR로 변환하세요.

## JSON 스키마

{
  "meta": {
    "title": "플로우차트 제목",
    "version": "1.0",
    "created_at": "ISO datetime",
    "source_type": "text",
    "theme": "dark",
    "diagram_type": "flowchart"
  },
  "data_flow": [],
  "groups": [],
  "nodes": [
    { "id": "start", "label": "시작", "type": "terminal" },
    { "id": "check", "label": "조건 확인", "type": "decision" },
    { "id": "process", "label": "처리", "type": "process" },
    { "id": "end", "label": "종료", "type": "terminal" }
  ],
  "edges": [
    { "id": "e1", "from": "start", "to": "check", "arrow": "forward", "line_type": "general" },
    { "id": "e2", "from": "check", "to": "process", "label": "YES", "arrow": "forward", "line_type": "general" },
    { "id": "e3", "from": "check", "to": "end", "label": "NO", "arrow": "forward", "line_type": "alert" }
  ],
  "legend": []
}

## 노드 타입
- "terminal": 시작/종료 (타원형)
- "decision": 분기 조건 (마름모)
- "process": 일반 처리 단계 (직사각형)

## 규칙
- 위상 정렬이 가능한 방향 그래프로 구성 (순환 없음).
- 반드시 JSON만 출력."""


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

    def _call_llm(self, client, model: str, text: str, system_prompt: str = None) -> Optional[dict]:
        """LLM 호출 → IR dict 반환. 실패 시 None"""
        prompt = system_prompt or SYSTEM_PROMPT
        try:
            with CallTimer(model) as t:
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": (
                            f"다음 인프라 설명을 분석하여 JSON IR로 변환하세요.\n"
                            f"모든 노드에 icon 필드를 채우고, data_flow를 상세히 작성하세요.\n\n"
                            f"---\n{text}\n---"
                        )},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                    max_tokens=16000,
                )
            log_response(model, response, t.elapsed)
        except Exception:
            log_error(model)
            raise
        raw = response.choices[0].message.content
        if raw is None:
            return None
        return self._validate_and_fix(raw)

    async def parse(self, text: str, diagram_type: Optional[str] = None) -> dict:
        """텍스트 → JSON IR. 동기 LLM 호출을 thread pool에서 실행 (이벤트 루프 블로킹 방지)."""
        if diagram_type == 'sequence':
            system_prompt = SEQUENCE_SYSTEM_PROMPT
        elif diagram_type == 'flowchart':
            system_prompt = FLOWCHART_SYSTEM_PROMPT
        else:
            system_prompt = SYSTEM_PROMPT

        # 1차: primary (DeepSeek) — 스레드풀에서 실행
        primary_err = None
        try:
            ir = await asyncio.to_thread(self._call_llm, self.client, self.model, text, system_prompt)
            if ir:
                return ir
        except Exception as e:
            primary_err = e

        # fallback (Gemini) 시도
        if self.fallback_client:
            try:
                ir = await asyncio.to_thread(
                    self._call_llm, self.fallback_client, self.fallback_model, text, system_prompt
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
