import { useState } from 'react'
import toast from 'react-hot-toast'
import type { ArchIR } from "../App"

const API_BASE = ''

type InputTab = 'text' | 'cli' | 'git' | 'guide'
type DiagramType = 'architecture' | 'sequence' | 'flowchart'

const DIAGRAM_TYPES: { value: DiagramType; label: string; hint: string }[] = [
  { value: 'architecture', label: '🏗 아키텍처', hint: '인프라 구성요소와 연결 관계' },
  { value: 'sequence',     label: '🔄 시퀀스',   hint: '시스템 간 메시지 흐름 순서' },
  { value: 'flowchart',    label: '🔀 플로우',   hint: '의사결정 흐름, 프로세스 단계' },
]

const CLI_HINTS: Record<string, string[]> = {
  azure: [
    'az resource list --output json',
    'az aks list --output json',
    'kubectl get all --all-namespaces -o json',
  ],
  gcp: [
    'gcloud container clusters list --format=json',
    'gcloud compute instances list --format=json',
    'kubectl get all --all-namespaces -o json',
  ],
  k8s: [
    'kubectl get all --all-namespaces -o json',
    'kubectl get nodes -o json',
    'kubectl get ingress --all-namespaces -o json',
  ],
  aws: [
    'aws ec2 describe-instances --output json',
    'aws eks list-clusters --output json',
  ],
}

// ══════════════════════════════════════════════════════════════════════════════
// 가이드 탭 데이터
// ══════════════════════════════════════════════════════════════════════════════

// ── 예시 프롬프트 ─────────────────────────────────────────────────────────────
interface GuideExample {
  title: string
  tag: string
  tagColor: string
  desc: string
  prompt: string
}

const GUIDE_EXAMPLES: GuideExample[] = [
  {
    title: 'AWS 3-Tier 웹 서비스',
    tag: 'AWS',
    tagColor: '#f59e0b',
    desc: '가장 일반적인 웹 서비스 구조',
    prompt: `AWS ap-northeast-2 리전 기반 웹 서비스 아키텍처

외부 접점:
- 사용자 브라우저 → Route53 DNS (도메인 라우팅)
- Route53 → CloudFront CDN (전 세계 캐싱, HTTPS 종료)

Public Subnet (VPC 내):
- CloudFront → ALB Application Load Balancer (HTTP→HTTPS 리다이렉트)

Private Subnet (VPC 내):
- ALB → EC2 Web Server 2대 (Auto Scaling Group, Node.js 앱)
- EC2 → ElastiCache Redis (세션 캐시, 클러스터 모드, 연결은 데이터 동기화)
- EC2 → RDS MySQL Primary (쓰기, 연결은 데이터 동기화)
- EC2 → RDS Read Replica (읽기 분산)
- EC2 → S3 (정적 파일 업로드, 직선 연결)

운영:
- CloudWatch → EC2, RDS, ALB 모니터링 (양방향 통신)
- NAT Gateway: Private Subnet → 인터넷 아웃바운드`,
  },
  {
    title: 'MSA on EKS',
    tag: 'AWS',
    tagColor: '#f59e0b',
    desc: '마이크로서비스 + Kubernetes 구조',
    prompt: `AWS EKS 기반 마이크로서비스 아키텍처 (ap-northeast-2)

외부 진입점:
- 사용자 → Route53 → ALB Ingress (Public Subnet)
- ALB Ingress → API Gateway Pod (EKS 클러스터 내)

EKS 클러스터 내 마이크로서비스 (각각 독립 Pod):
- API Gateway → User Service (JWT 검증 후 라우팅)
- API Gateway → Order Service (주문 요청)
- API Gateway → Product Service (상품 조회)
- User Service → PostgreSQL (users DB, 데이터 동기화 연결)
- Order Service → MongoDB (orders DB, 데이터 동기화 연결)
- Order Service → SQS 주문큐 (비동기 이벤트 발행, 데이터 동기화 연결)

비동기 처리:
- SQS 주문큐 → Payment Service (이벤트 소비, 보라색 애니메이션 연결)
- Payment Service → Stripe API (외부 결제, 경고 색상 연결)
- Payment Service → SNS → Notification Service (결제 결과 알림)

공유 인프라 (EKS 외부):
- ElastiCache Redis (세션 공유, 모든 서비스에서 접근)
- ECR (컨테이너 이미지 저장)
- Secrets Manager (API Key 관리, 경고 색상으로 연결)
- CloudWatch + X-Ray (분산 추적)`,
  },
  {
    title: 'Azure AKS + CosmosDB',
    tag: 'Azure',
    tagColor: '#0078d4',
    desc: 'Azure 클라우드 네이티브 구조',
    prompt: `Azure Korea Central 기반 클라우드 네이티브 아키텍처

외부 트래픽:
- 사용자 → Azure Front Door (글로벌 CDN + WAF, 경고 색상 연결)
- Front Door → Application Gateway (SSL 오프로딩, ALB 역할)

AKS 클러스터 (Virtual Network 내):
- Application Gateway → Nginx Ingress Controller
- Ingress → API Pod (Node.js, REST API)
- Ingress → Worker Pod (Python, 배치/비동기)
- API Pod ↔ Worker Pod (양방향 통신, Service Bus 경유)

데이터 레이어:
- API Pod → Cosmos DB (NoSQL, 멀티 리전 복제, 데이터 동기화 연결)
- API Pod → Azure SQL Database (관계형, 트랜잭션)
- API Pod → Azure Cache for Redis (세션 캐시, 데이터 동기화 연결)
- Worker Pod → Azure Blob Storage (파일 처리, 직선 연결)

메시징:
- API Pod → Azure Service Bus (이벤트 발행)
- Service Bus → Worker Pod (이벤트 소비, 비동기 처리)

보안 및 운영:
- Azure Key Vault → API Pod, Worker Pod (시크릿 주입, 경고 색상 연결)
- Azure Monitor + App Insights (양방향 모니터링)
- Azure Container Registry (이미지 저장)`,
  },
  {
    title: 'GCP 데이터 파이프라인',
    tag: 'GCP',
    tagColor: '#4285f4',
    desc: '실시간 빅데이터 처리 아키텍처',
    prompt: `GCP asia-northeast3 기반 실시간 데이터 파이프라인

수집 레이어:
- 모바일 앱 → Cloud Load Balancing → Cloud Run 수집 API
- 웹 클라이언트 → Cloud Load Balancing (동일 진입점 공유)
- Cloud Run → Pub/Sub 이벤트 토픽 (이벤트 스트리밍, 데이터 동기화 연결)

실시간 처리:
- Pub/Sub → Dataflow 스트리밍 잡 (Apache Beam, 데이터 동기화 연결)
- Dataflow → BigQuery 실시간 테이블 (데이터 동기화 연결)
- Dataflow → Cloud Storage 원본 버킷 (Parquet 백업, 직선 연결)

배치 처리 (야간):
- Cloud Scheduler → Cloud Functions 배치 트리거 (cron 실행)
- Cloud Functions → Dataproc 클러스터 (Spark 잡 제출)
- Dataproc → BigQuery 집계 테이블 (데이터 동기화 연결)

서빙 및 ML:
- BigQuery → Vertex AI (피처 데이터, 모델 학습)
- Vertex AI → Cloud Run 예측 API (모델 서빙)
- BigQuery → Looker Studio (BI 대시보드, 양방향)

보안/운영:
- Secret Manager → Cloud Run, Cloud Functions (API Key, 경고 색상 연결)
- Cloud Monitoring + Cloud Logging (전체 파이프라인 관찰)`,
  },
  {
    title: '온프레미스 + AWS 하이브리드',
    tag: '하이브리드',
    tagColor: '#10b981',
    desc: 'On-Prem ↔ 클라우드 연결 구조',
    prompt: `온프레미스 데이터센터와 AWS 하이브리드 아키텍처

온프레미스 데이터센터:
- 레거시 ERP Oracle DB (핵심 업무 데이터, 외부 접근 불가)
- 내부 API 서버 (레거시 시스템 연동)
- 직원 PC / 내부 네트워크

하이브리드 연결:
- 온프레미스 ↔ AWS VPC: AWS Direct Connect (전용선, 양방향 연결, 데이터 동기화)

AWS ap-northeast-2 (VPC 내):
- Transit Gateway (온프레미스 ↔ 클라우드 트래픽 허브)
- Transit Gateway → API Gateway (외부 API 노출)
- API Gateway → Lambda Functions (서버리스 비즈니스 로직)
- Lambda → RDS Aurora (클라우드 신규 데이터, 데이터 동기화 연결)
- Lambda → 온프레미스 내부 API (레거시 조회, 꺾인 선으로 연결)

마이그레이션 경로:
- Oracle DB → AWS Database Migration Service → RDS Aurora (단방향, 데이터 동기화)
- DMS 완료 후 Oracle DB → Archive S3 (백업, 직선 연결)

외부 접점:
- 사용자 → CloudFront → API Gateway (인터넷 트래픽)
- CloudWatch + CloudTrail (하이브리드 전체 감사 로그)`,
  },
  {
    title: 'JWT 로그인 시퀀스',
    tag: '시퀀스',
    tagColor: '#a78bfa',
    desc: '인증 흐름 시퀀스 다이어그램',
    prompt: `JWT 기반 사용자 로그인 시퀀스 다이어그램

참여자: 사용자 브라우저, Nginx Reverse Proxy, Auth API Server, User DB (PostgreSQL), Redis 세션 저장소

흐름:
1. 브라우저 → Nginx: POST /api/v1/auth/login (email, password)
2. Nginx → Auth API: 요청 포워딩 (rate limit 체크 완료)
3. Auth API → User DB: SELECT id, password_hash FROM users WHERE email = ?
4. User DB → Auth API: 사용자 레코드 반환 (또는 NOT FOUND)
5. Auth API: bcrypt.compare(password, hash) — 내부 검증
6. 검증 실패 시 Auth API → Nginx → 브라우저: 401 Unauthorized
7. 검증 성공 시 Auth API: accessToken(15분), refreshToken(7일) 생성
8. Auth API → Redis: SETEX refresh:{userId} 604800 {token} — 리프레시 토큰 저장
9. Auth API → Nginx: 200 OK + Set-Cookie (refreshToken, HttpOnly)
10. Nginx → 브라우저: 응답 전달 + accessToken (응답 바디)
11. 브라우저: localStorage에 accessToken 저장, 메인 페이지 이동`,
  },
  {
    title: '주문 처리 플로우차트',
    tag: '플로우',
    tagColor: '#f472b6',
    desc: '이커머스 주문 처리 의사결정 흐름',
    prompt: `이커머스 주문 처리 플로우차트

시작: 사용자가 결제하기 버튼 클릭

단계:
1. 입력값 검증 → 오류 있으면 "입력 오류" 알림 후 종료
2. 재고 확인 → 재고 없으면 "품절" 안내 후 종료, 재고 있으면 진행
3. 결제 승인 요청 (Stripe API 호출)
   - 성공: 주문 확정 단계로
   - 실패: 재시도 횟수 확인 → 3회 미만이면 재시도, 3회 초과면 "결제 실패" 후 종료
4. 주문 확정: DB에 주문 저장 + 재고 차감 (트랜잭션)
5. 비동기 후처리 병렬 실행:
   - 이메일 발송 (주문 확인서)
   - 배송 시스템에 출고 요청
   - 포인트 적립
6. 모든 후처리 완료 → "주문 완료" 화면 표시 → 종료`,
  },
]

// ── 기능 활용법 데이터 ────────────────────────────────────────────────────────
interface FeatureRow {
  want: string      // 원하는 결과
  how: string       // 이렇게 말하세요
  result: string    // 렌더링 결과 힌트
}

interface FeatureSection {
  title: string
  icon: string
  color: string
  rows: FeatureRow[]
  tip?: string
}

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    title: '연결선 색상 · 스타일',
    icon: '🎨',
    color: '#a78bfa',
    tip: '연결의 성격을 텍스트로 명시하면 AI가 자동으로 색상을 선택합니다.',
    rows: [
      { want: '일반 HTTP 통신 (회색)', how: '"A → B (HTTPS 요청)" 또는 그냥 연결 표시', result: '회색 실선' },
      { want: '데이터 흐름 (보라 애니메이션)', how: '"데이터 동기화", "실시간 스트리밍", "데이터 동기화 연결"', result: '보라색 점선 애니메이션' },
      { want: '경고·보안 강조 (빨간색)', how: '"보안 인증 경유", "WAF 필터링", "경고 색상으로 연결"', result: '빨간색 실선' },
      { want: '파란색 강조선', how: '"파란색 연결", "주요 데이터 경로"', result: '파란색 실선' },
      { want: '로드밸런서 점선', how: '"ALB 분산", "로드밸런서 연결" (lb 타입)', result: '회색 점선' },
      { want: 'VPC 내부 연결 (옅은 점선)', how: '"VPC 내부 통신만", "서브넷 간 연결"', result: '옅은 회색 점선' },
    ],
  },
  {
    title: '화살표 방향',
    icon: '↔',
    color: '#60a5fa',
    tip: '요청을 보내는 쪽 → 받는 쪽 방향으로 명시하면 가장 정확합니다.',
    rows: [
      { want: '단방향 →', how: '"A에서 B로 요청", "A → B (HTTPS)"', result: 'A→B 화살표' },
      { want: '양방향 ↔', how: '"서로 통신", "양방향 연결", "WebSocket", "gRPC 스트리밍"', result: 'A↔B 양방향' },
      { want: '역방향 ←', how: '"B가 A를 호출", "콜백 방식으로 B → A"', result: 'B→A 화살표' },
      { want: '화살표 없음 (연결만)', how: '"단순 연결", "같은 네트워크 내 배치", "논리적 그룹"', result: '방향 없는 실선' },
    ],
  },
  {
    title: '연결선 경로 (라우팅)',
    icon: '📐',
    color: '#34d399',
    tip: '기본은 자동 곡선. 선이 겹치거나 복잡한 경로가 필요할 때 명시하세요.',
    rows: [
      { want: '자동 곡선 (기본)', how: '특별히 명시 안 해도 됨', result: '베지어 S자 곡선' },
      { want: '직선으로 연결', how: '"직선으로 연결", "짧은 직선 연결"', result: '직선' },
      { want: '꺾인 선 (우회 경로)', how: '"선이 겹치지 않도록 우회", "그룹을 가로지르는 연결", "꺾인 선으로"', result: '꺾임 경로 (수동 편집 가능)' },
      { want: '꺾임선 편집', how: '생성 후 → 화살표 클릭 → 툴바 "꺾임" → 선 위 연보라 점 드래그', result: '클릭 드래그로 경유점 추가' },
    ],
  },
  {
    title: '그룹 · 존 (VPC, 클러스터)',
    icon: '🗂',
    color: '#fb923c',
    tip: '그룹 이름과 포함 서비스를 명확히 묶어서 표현하세요.',
    rows: [
      { want: 'AWS VPC 그룹', how: '"VPC 내부에 EC2, RDS 배치", "VPC ap-northeast-2 내"', result: 'AWS 오렌지 테두리 그룹' },
      { want: 'Azure Virtual Network', how: '"Virtual Network 내부", "VNet 격리"', result: 'Azure 파란 테두리 그룹' },
      { want: 'Kubernetes 클러스터', how: '"EKS 클러스터 내 Pod들:", "AKS 클러스터 안에"', result: 'K8s 파란 그룹' },
      { want: '중첩 그룹', how: '"AWS ap-northeast-2 VPC 안에 EKS 클러스터가 있고, 클러스터 안에 Pod들이..."', result: 'VPC 안에 EKS 그룹 중첩' },
      { want: '그룹 색상 지정', how: '"주황색 VPC 존", "파란색 테두리로 표시"', result: '지정 색상 테두리' },
    ],
  },
  {
    title: '노드 상세 표현',
    icon: '🧩',
    color: '#f472b6',
    tip: '서비스명을 정확히 쓸수록 공식 아이콘이 자동 매핑됩니다.',
    rows: [
      { want: 'AWS 공식 아이콘', how: '"EC2 Web Server", "RDS MySQL", "S3 버킷", "Lambda", "CloudFront"', result: 'AWS 공식 아이콘 자동 매핑' },
      { want: 'Azure 공식 아이콘', how: '"Azure AKS", "Cosmos DB", "Azure SQL Database", "Key Vault"', result: 'Azure 아이콘 자동 매핑' },
      { want: 'GCP 공식 아이콘', how: '"Cloud Run", "BigQuery", "Pub/Sub", "GKE", "Vertex AI"', result: 'GCP 아이콘 자동 매핑' },
      { want: 'K8s 아이콘', how: '"Ingress Controller", "Deployment", "Pod", "ConfigMap", "HPA"', result: 'K8s 공식 아이콘' },
      { want: '역할 설명 (sublabel)', how: '"EC2 Web Server (Auto Scaling, t3.medium)"', result: '아이콘 아래 작은 설명 텍스트' },
      { want: '아이콘 없음 노드', how: '"사용자 브라우저", "외부 사용자", "인터넷"', result: '범용 아이콘 (브라우저/지구)' },
    ],
  },
  {
    title: '다이어그램 타입별 팁',
    icon: '📋',
    color: '#94a3b8',
    rows: [
      { want: '아키텍처 (기본)', how: '클라우드 서비스, 노드 간 연결 중심 설명', result: '인프라 다이어그램' },
      { want: '시퀀스 다이어그램', how: '"시퀀스 다이어그램으로", 참여자 나열 + 번호 순 메시지', result: '수직 시간축 흐름도' },
      { want: '플로우차트', how: '"플로우차트로", 조건(YES/NO)과 단계 나열', result: '의사결정 흐름도' },
      { want: '시퀀스 팁', how: '"1. A → B: 메시지" 형식으로 순서 명확히', result: '순서 번호 자동 배치' },
      { want: '플로우차트 팁', how: '"조건 확인 → 있으면 X, 없으면 Y" 형식', result: '마름모 분기 자동 생성' },
    ],
  },
]

// ── AI 수정 명령어 ────────────────────────────────────────────────────────────
interface ModifyCommand {
  category: string
  commands: { cmd: string; desc: string }[]
}

const MODIFY_COMMANDS: ModifyCommand[] = [
  {
    category: '노드 추가 · 삭제',
    commands: [
      { cmd: 'Redis 캐시 노드 추가하고 Web Server와 연결해줘', desc: '노드 추가 + 자동 연결' },
      { cmd: 'WAF 노드를 CloudFront와 ALB 사이에 추가해줘', desc: '기존 연결 사이에 삽입' },
      { cmd: 'Read Replica 노드를 RDS Primary 옆에 추가해줘', desc: '복제 노드 추가' },
      { cmd: 'Monitoring 노드 삭제해줘', desc: '노드 제거' },
    ],
  },
  {
    category: '연결선 수정',
    commands: [
      { cmd: 'EC2와 RDS 사이 화살표를 양방향으로 바꿔줘', desc: '화살표 방향 변경' },
      { cmd: 'Order Service → Payment Service 연결을 보라색 데이터 흐름 선으로 바꿔줘', desc: '선 색상/스타일 변경' },
      { cmd: 'API Gateway와 Lambda 사이에 "HTTPS/443" 라벨 추가해줘', desc: '연결선 라벨 추가' },
      { cmd: '겹치는 선들을 꺾인 선으로 바꿔줘', desc: '라우팅 모드 일괄 변경' },
    ],
  },
  {
    category: '레이아웃 · 그룹',
    commands: [
      { cmd: 'Payment Service를 Order Service 아래로 이동해줘', desc: '노드 위치 조정' },
      { cmd: 'Lambda와 DynamoDB를 "서버리스 레이어" 그룹으로 묶어줘', desc: '새 그룹 생성' },
      { cmd: 'VPC 그룹에 Elasticache도 포함시켜줘', desc: '그룹 멤버 추가' },
      { cmd: '전체 레이아웃을 왼쪽에서 오른쪽으로 흐르도록 재배치해줘', desc: '전체 레이아웃 재생성' },
    ],
  },
  {
    category: '스타일 · 정보 수정',
    commands: [
      { cmd: 'EC2 노드 이름을 "Web Server (t3.medium)" 으로 변경해줘', desc: '노드 라벨 변경' },
      { cmd: 'Internet 노드를 빨간색 경고 스타일로 바꿔줘', desc: '연결 색상 변경' },
      { cmd: 'RDS Primary에 "Multi-AZ" sublabel 추가해줘', desc: '설명 텍스트 추가' },
      { cmd: '데이터 흐름 설명을 보안 관점으로 다시 작성해줘', desc: 'data_flow 텍스트 재생성' },
    ],
  },
]

// ── AI 프롬프트 템플릿 ────────────────────────────────────────────────────────
const AI_PROMPT_TEMPLATE = `내 시스템을 ArchGen 다이어그램 생성용 텍스트로 정리해줘.

내 시스템:
(여기에 내 시스템 설명 입력)

출력 형식 규칙:
1. 노드는 "서비스명 (역할 설명)" 형식으로 나열
2. 연결은 "A → B (프로토콜/용도)" 형식 사용
3. 양방향이면 "A ↔ B", 비동기면 "A --비동기--> B"
4. 클라우드 제공자 + 리전 명시 (예: AWS ap-northeast-2)
5. 그룹화: "서비스명 클러스터/VPC 내:" 헤더 아래에 포함 서비스 들여쓰기
6. 데이터 동기화/스트리밍은 "데이터 동기화 연결"로 명시
7. 보안 관련 연결은 "보안/인증 처리"로 명시
8. 복잡한 레이아웃에서 선 겹침 우회가 필요한 곳은 "꺾인 선으로 연결"로 명시`

// ── 명확화 질문 컴포넌트 ─────────────────────────────────────────────────────
interface ClarifyQuestion {
  id: string
  question: string
  options: string[]
  default: number
}

interface ClarifyPanelProps {
  questions: ClarifyQuestion[]
  answers: Record<string, number>
  onAnswer: (id: string, idx: number) => void
  onProceed: () => void
  onCancel: () => void
  isLoading: boolean
}

function ClarifyPanel({ questions, answers, onAnswer, onProceed, onCancel, isLoading }: ClarifyPanelProps) {
  return (
    <div className="clarify-panel">
      <div className="clarify-header">
        <span className="clarify-icon">🤔</span>
        <span className="clarify-title">조금 더 알려주세요</span>
      </div>
      <p className="clarify-desc">다이어그램 품질을 높이기 위해 아래 항목을 선택해주세요</p>
      <div className="clarify-questions">
        {questions.map((q) => (
          <div key={q.id} className="clarify-question">
            <p className="clarify-q-text">{q.question}</p>
            <div className="clarify-options">
              {q.options.map((opt, i) => (
                <button
                  key={i}
                  className={`clarify-option${(answers[q.id] ?? q.default) === i ? ' selected' : ''}`}
                  onClick={() => onAnswer(q.id, i)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="clarify-actions">
        <button className="btn-secondary" onClick={onCancel} style={{ flex: 1 }}>
          취소
        </button>
        <button
          className="btn-generate"
          onClick={onProceed}
          disabled={isLoading}
          style={{ flex: 2 }}
        >
          {isLoading ? '생성 중...' : '이대로 생성'}
        </button>
      </div>
    </div>
  )
}

// ── 공용 CopyButton ────────────────────────────────────────────────────────────
function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button className="guide-copy-btn" onClick={handleCopy}>
      {copied ? '✓ 복사됨' : (label ?? '복사')}
    </button>
  )
}

// ── 가이드 탭 서브탭 ──────────────────────────────────────────────────────────
type GuideSubTab = 'examples' | 'features' | 'modify'

function GuideTab() {
  const [sub, setSub] = useState<GuideSubTab>('examples')
  const [openExIdx, setOpenExIdx] = useState<number | null>(null)
  const [openFeatIdx, setOpenFeatIdx] = useState<number | null>(null)
  const [openModIdx, setOpenModIdx] = useState<number | null>(null)

  return (
    <div className="guide-tab">
      {/* 서브탭 */}
      <div className="guide-subtab-bar">
        <button className={`guide-subtab-btn${sub === 'examples' ? ' active' : ''}`} onClick={() => setSub('examples')}>
          예시 프롬프트
        </button>
        <button className={`guide-subtab-btn${sub === 'features' ? ' active' : ''}`} onClick={() => setSub('features')}>
          기능 활용법
        </button>
        <button className={`guide-subtab-btn${sub === 'modify' ? ' active' : ''}`} onClick={() => setSub('modify')}>
          AI 수정 명령
        </button>
      </div>

      {/* ── 예시 프롬프트 탭 ── */}
      {sub === 'examples' && (
        <div className="guide-scroll">
          <p className="guide-section-hint">
            아래 예시를 <b>텍스트 탭</b>에 그대로 붙여넣어 생성하거나,<br />
            ChatGPT/Claude에 아래 <b>AI 프롬프트 템플릿</b>을 참고해서 내 시스템을 정리하세요.
          </p>

          <div className="guide-examples">
            {GUIDE_EXAMPLES.map((ex, i) => (
              <div key={i} className={`guide-item${openExIdx === i ? ' open' : ''}`}>
                <button
                  className="guide-item-header"
                  onClick={() => setOpenExIdx(openExIdx === i ? null : i)}
                >
                  <span className="guide-item-tag" style={{ background: `${ex.tagColor}22`, color: ex.tagColor, border: `1px solid ${ex.tagColor}44` }}>
                    {ex.tag}
                  </span>
                  <span className="guide-item-title">{ex.title}</span>
                  <span className="guide-item-desc">{ex.desc}</span>
                  <span className="guide-item-chevron">{openExIdx === i ? '▲' : '▼'}</span>
                </button>
                {openExIdx === i && (
                  <div className="guide-item-body">
                    <pre className="guide-prompt">{ex.prompt}</pre>
                    <CopyButton text={ex.prompt} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="guide-ai-template">
            <div className="guide-ai-header">
              <span className="guide-ai-icon">🤖</span>
              <span className="guide-ai-title">ChatGPT / Claude용 정리 템플릿</span>
              <CopyButton text={AI_PROMPT_TEMPLATE} />
            </div>
            <pre className="guide-prompt guide-prompt-sm">{AI_PROMPT_TEMPLATE}</pre>
          </div>
        </div>
      )}

      {/* ── 기능 활용법 탭 ── */}
      {sub === 'features' && (
        <div className="guide-scroll">
          <p className="guide-section-hint">
            텍스트에 아래 키워드를 포함하면 AI가 해당 기능을 자동 적용합니다.
          </p>
          {FEATURE_SECTIONS.map((sec, i) => (
            <div key={i} className={`guide-item${openFeatIdx === i ? ' open' : ''}`}>
              <button
                className="guide-item-header"
                onClick={() => setOpenFeatIdx(openFeatIdx === i ? null : i)}
              >
                <span className="guide-feat-icon">{sec.icon}</span>
                <span className="guide-item-title" style={{ color: sec.color }}>{sec.title}</span>
                <span className="guide-item-chevron">{openFeatIdx === i ? '▲' : '▼'}</span>
              </button>
              {openFeatIdx === i && (
                <div className="guide-item-body guide-feat-body">
                  {sec.tip && <p className="guide-feat-tip">{sec.tip}</p>}
                  <div className="guide-feat-table">
                    <div className="guide-feat-row guide-feat-header">
                      <span>원하는 결과</span>
                      <span>이렇게 말하세요</span>
                      <span>렌더링</span>
                    </div>
                    {sec.rows.map((row, j) => (
                      <div key={j} className="guide-feat-row">
                        <span className="guide-feat-want">{row.want}</span>
                        <span className="guide-feat-how">
                          <code>{row.how}</code>
                        </span>
                        <span className="guide-feat-result">{row.result}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── AI 수정 명령 탭 ── */}
      {sub === 'modify' && (
        <div className="guide-scroll">
          <p className="guide-section-hint">
            다이어그램 생성 후 <b>우측 AI 패널 → 자연어 수정</b>에 아래 명령어를 사용하세요.
          </p>
          {MODIFY_COMMANDS.map((cat, i) => (
            <div key={i} className={`guide-item${openModIdx === i ? ' open' : ''}`}>
              <button
                className="guide-item-header"
                onClick={() => setOpenModIdx(openModIdx === i ? null : i)}
              >
                <span className="guide-item-title">{cat.category}</span>
                <span className="guide-item-count">{cat.commands.length}개</span>
                <span className="guide-item-chevron">{openModIdx === i ? '▲' : '▼'}</span>
              </button>
              {openModIdx === i && (
                <div className="guide-item-body">
                  {cat.commands.map((cmd, j) => (
                    <div key={j} className="guide-cmd-row">
                      <div className="guide-cmd-text">
                        <code className="guide-cmd-code">{cmd.cmd}</code>
                        <span className="guide-cmd-desc">{cmd.desc}</span>
                      </div>
                      <CopyButton text={cmd.cmd} label="복사" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="guide-modify-tip">
            <span className="guide-modify-tip-icon">💡</span>
            <div>
              <strong>팁:</strong> 수정 명령은 구체적일수록 정확합니다.<br />
              노드 이름은 현재 다이어그램에 표시된 이름 그대로 사용하세요.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
interface Props {
  onParsed: (ir: ArchIR, id?: string) => void
  isLoading: boolean
  setIsLoading: (v: boolean) => void
}

export default function InputPanel({ onParsed, isLoading, setIsLoading }: Props) {
  const [tab, setTab] = useState<InputTab>('text')
  const [diagramType, setDiagramType] = useState<DiagramType>('architecture')
  const [textInput, setTextInput] = useState('')
  const [cliOutput, setCliOutput] = useState('')
  const [gitUrl, setGitUrl] = useState('')
  const [gitToken, setGitToken] = useState('')
  const [cloudHint, setCloudHint] = useState<keyof typeof CLI_HINTS>('k8s')

  // 명확화 상태
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQuestion[] | null>(null)
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, number>>({})
  const [isClarifying, setIsClarifying] = useState(false)

  const buildEnrichedText = (text: string, questions: ClarifyQuestion[], answers: Record<string, number>) => {
    if (!questions.length) return text
    const answerLines = questions.map(q => {
      const idx = answers[q.id] ?? q.default
      return `- ${q.question}: ${q.options[idx]}`
    }).join('\n')
    return `${text}\n\n[추가 정보]\n${answerLines}`
  }

  const doGenerate = async (text: string) => {
    setIsLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/parse/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, diagram_type: diagramType }),
      })
      const data = await resp.json()
      if (data.ir) {
        onParsed(data.ir)
        toast.success('다이어그램 생성 완료!')
      } else {
        toast.error('생성 실패 — 다시 시도해주세요')
      }
    } catch {
      toast.error('파싱 실패')
    } finally {
      setIsLoading(false)
    }
  }

  const handleParseText = async () => {
    if (!textInput.trim()) return

    // 명확화 단계 (아키텍처 타입만, 텍스트가 너무 짧으면 skip)
    if (diagramType === 'architecture' && textInput.trim().length > 30) {
      setIsClarifying(true)
      try {
        const resp = await fetch(`${API_BASE}/api/parse/clarify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textInput, diagram_type: diagramType }),
        })
        if (resp.ok) {
          const data = await resp.json()
          const questions: ClarifyQuestion[] = data.questions || []
          if (questions.length > 0) {
            // 기본값으로 초기화
            const defaults: Record<string, number> = {}
            questions.forEach(q => { defaults[q.id] = q.default })
            setClarifyAnswers(defaults)
            setClarifyQuestions(questions)
            setIsClarifying(false)
            return // 사용자 선택 대기
          }
        }
      } catch {
        // clarify 실패해도 그냥 생성으로 진행
      }
      setIsClarifying(false)
    }

    await doGenerate(textInput)
  }

  const handleClarifyProceed = async () => {
    if (!clarifyQuestions) return
    const enriched = buildEnrichedText(textInput, clarifyQuestions, clarifyAnswers)
    setClarifyQuestions(null)
    setClarifyAnswers({})
    await doGenerate(enriched)
  }

  const handleClarifyCancel = () => {
    setClarifyQuestions(null)
    setClarifyAnswers({})
  }

  const handleParseCli = async () => {
    if (!cliOutput.trim()) return
    setIsLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/parse/cli`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output: cliOutput, cloud_hint: cloudHint }),
      })
      const data = await resp.json()
      if (data.ir) {
        onParsed(data.ir)
        toast.success('CLI 출력 분석 완료!')
      }
    } catch {
      toast.error('분석 실패')
    } finally {
      setIsLoading(false)
    }
  }

  const handleParseGit = async () => {
    if (!gitUrl.trim()) return
    setIsLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/parse/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: gitUrl, github_token: gitToken || undefined }),
      })
      const data = await resp.json()
      if (data.ir) {
        onParsed(data.ir)
        toast.success('Git 레포 분석 완료!')
      }
    } catch {
      toast.error('Git 분석 실패')
    } finally {
      setIsLoading(false)
    }
  }

  const TAB_LABELS: Record<InputTab, string> = {
    text: '텍스트', cli: 'CLI 출력', git: 'Git URL', guide: '💡 가이드',
  }

  return (
    <div className="input-panel">
      {/* 탭 */}
      <div className="tab-bar">
        {(['text', 'cli', 'git', 'guide'] as InputTab[]).map(t => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* 텍스트 탭 */}
      {tab === 'text' && (
        <div className="tab-content">
          <div className="diagram-type-selector">
            {DIAGRAM_TYPES.map(dt => (
              <button
                key={dt.value}
                className={`diagram-type-btn${diagramType === dt.value ? ' active' : ''}`}
                onClick={() => setDiagramType(dt.value)}
                title={dt.hint}
              >
                {dt.label}
              </button>
            ))}
          </div>
          <p className="hint">
            {DIAGRAM_TYPES.find(d => d.value === diagramType)?.hint}
          </p>

          {/* 명확화 패널 (질문 있을 때만 표시) */}
          {clarifyQuestions ? (
            <ClarifyPanel
              questions={clarifyQuestions}
              answers={clarifyAnswers}
              onAnswer={(id, idx) => setClarifyAnswers(prev => ({ ...prev, [id]: idx }))}
              onProceed={handleClarifyProceed}
              onCancel={handleClarifyCancel}
              isLoading={isLoading}
            />
          ) : (
            <>
              <textarea
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                placeholder="예: Azure AKS 클러스터 위에 3개의 Pod가 있고, Azure SQL과 Redis Cache로 연결됩니다..."
                rows={10}
                className="input-textarea"
              />
              <button
                onClick={handleParseText}
                disabled={isLoading || isClarifying || !textInput.trim()}
                className="btn-generate"
              >
                {isClarifying ? '분석 중...' : isLoading ? '생성 중...' : '다이어그램 생성'}
              </button>
            </>
          )}
        </div>
      )}

      {/* CLI 탭 */}
      {tab === 'cli' && (
        <div className="tab-content">
          <div className="cloud-selector">
            {Object.keys(CLI_HINTS).map(c => (
              <button
                key={c}
                className={`cloud-btn ${cloudHint === c ? 'active' : ''}`}
                onClick={() => setCloudHint(c as any)}
              >
                {c.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="cli-hints">
            <p className="hint">터미널에서 아래 명령어를 실행 후 결과를 붙여넣으세요:</p>
            {CLI_HINTS[cloudHint].map(cmd => (
              <code key={cmd} className="cli-cmd">{cmd}</code>
            ))}
          </div>
          <textarea
            value={cliOutput}
            onChange={e => setCliOutput(e.target.value)}
            placeholder="CLI 출력 결과를 여기에 붙여넣기..."
            rows={10}
            className="input-textarea"
          />
          <button
            onClick={handleParseCli}
            disabled={isLoading || !cliOutput.trim()}
            className="btn-generate"
          >
            {isLoading ? '분석 중...' : '분석하기'}
          </button>
        </div>
      )}

      {/* Git 탭 */}
      {tab === 'git' && (
        <div className="tab-content">
          <p className="hint">Git 레포 URL을 입력하면 K8s YAML, Dockerfile 등을 자동 분석합니다</p>
          <input
            type="url"
            value={gitUrl}
            onChange={e => setGitUrl(e.target.value)}
            placeholder="https://github.com/username/repo"
            className="input-text"
          />
          <input
            type="password"
            value={gitToken}
            onChange={e => setGitToken(e.target.value)}
            placeholder="Private 레포: GitHub PAT (선택사항)"
            className="input-text"
          />
          <button
            onClick={handleParseGit}
            disabled={isLoading || !gitUrl.trim()}
            className="btn-generate"
          >
            {isLoading ? '분석 중...' : 'Git 레포 분석'}
          </button>
        </div>
      )}

      {/* 가이드 탭 */}
      {tab === 'guide' && <GuideTab />}
    </div>
  )
}
