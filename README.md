# ArchGen — AI 인프라 아키텍처 시각화 플랫폼

텍스트 설명, CLI 출력, Git URL을 입력하면 AI가 인프라 다이어그램을 생성합니다.

**라이브 데모**: [archgen.zzimong.com](https://archgen.zzimong.com)

## 주요 기능

- **3가지 입력 방식**: 텍스트 설명 / kubectl·azure·docker-compose CLI 출력 / Git URL
- **AI 파싱**: DeepSeek V3 (Gemini Flash 폴백)로 JSON IR 생성
- **Iconify 아이콘 자동 매핑**: AWS/Azure/GCP/K8s 100+ 서비스 아이콘 자동 할당
- **데이터 플로우 패널**: AI가 분석한 요청 흐름 단계별 표시
- **아이콘 검색 모달**: 아이콘 없는 노드 클릭 → Iconify 10만개+ 실시간 검색
- **인터랙티브 다이어그램**: React Flow 기반, 드래그/연결 편집 가능
- **AI 수정**: 자연어로 다이어그램 수정 ("RDS를 Aurora로 교체해줘")
- **보안 분석**: LLM이 인프라 구성 취약점 분석

## 기술 스택

| 구성 | 기술 |
|------|------|
| Backend | FastAPI, SQLite |
| Frontend | React 18, TypeScript, Vite, React Flow |
| LLM | DeepSeek V3 (primary), Gemini 2.5 Flash (fallback) |
| 아이콘 | Iconify CDN (logos/skill-icons/simple-icons/mdi) |
| 배포 | Cloudflare Tunnel → archgen.zzimong.com, port 8081 |

---

## 🔧 재시작 / 빌드 배포 절차

### 백엔드 재시작

```bash
pkill -f "api.main:app"
sleep 2
cd /Volumes/OpenClawSSD/projects/archgen
bash start.sh >> logs/archgen.log 2>&1 &
sleep 5 && curl -s http://localhost:8081/api/health
```

### 프론트엔드 빌드 & 배포

```bash
cd /Volumes/OpenClawSSD/projects/archgen/frontend
npm run build

# 해시 확인 (일치해야 정상)
echo "빌드:" && ls dist/assets/*.js | xargs basename
echo "서빙:" && curl -s http://localhost:8081/ | grep -o 'index-[A-Za-z0-9]*\.js'

# 불일치 시 백엔드 재시작
pkill -f "api.main:app" && sleep 2
cd /Volumes/OpenClawSSD/projects/archgen && bash start.sh >> logs/archgen.log 2>&1 &
```

### 정상 동작 확인

```bash
# 파싱 테스트
curl -s -X POST http://localhost:8081/api/parse/text \
  -H "Content-Type: application/json" \
  -d '{"text":"AWS EC2, RDS, S3 기반 웹 서비스"}' | python3 -c "
import json,sys; d=json.load(sys.stdin); ir=d.get('ir',{})
print('nodes:', len(ir.get('nodes',[])), '| data_flow:', len(ir.get('data_flow',[])), '단계')
"
```

### cloudflared 재시작

```bash
launchctl kickstart -k gui/$(id -u)/com.cloudflare.cloudflared
```

### 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| "파싱 실패" 토스트 | CF 터널 다운 or API_BASE 절대URL 문제 | `API_BASE = ''` 상대경로 고정 (수정 완료) |
| 새 코드 반영 안 됨 | 빌드 해시 불일치 | 백엔드 재시작 |
| 아이콘 색상 깨짐 | logos:에 ?color= 추가 | COLORED_PREFIXES Set 분리 (수정 완료) |
| logos:amazon-eks 404 | 잘못된 Iconify 이름 | simple-icons:amazoneks (수정 완료) |
| bad gateway | cloudflared 죽음 | 위 cloudflared 재시작 |

---

## API 엔드포인트

| 엔드포인트 | 설명 |
|-----------|------|
| `POST /api/parse/text` | 텍스트 → JSON IR |
| `POST /api/parse/cli` | CLI 출력 → JSON IR |
| `POST /api/parse/git` | Git URL → JSON IR |
| `POST /api/diagrams/modify` | 자연어 수정 |
| `POST /api/analyze/security` | 보안 분석 |
| `POST /api/icons/search` | Iconify 실시간 아이콘 검색 |

## 환경 변수

`/Volumes/OpenClawSSD/shared/.env.keys` 또는 `.env`:

```env
DEEPSEEK_API_KEY=
FALLBACK_API_KEY=
ARCHGEN_PORT=8081
```

## 중요 설계 결정

- **API_BASE = ''**: 모든 fetch는 상대경로 사용. CF 터널/로컬 모두 동작
- **COLORED_PREFIXES**: logos:/skill-icons: 팩은 자체 컬러 → ?color= 파라미터 금지
- **Iconify 이름**: 검증된 이름만 ICON_REFERENCE에 포함 (logos:amazon-eks X, simple-icons:amazoneks O)
