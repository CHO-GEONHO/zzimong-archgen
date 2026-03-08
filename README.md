# ArchGen — AI 인프라 아키텍처 시각화 플랫폼

텍스트 설명, CLI 출력, Git URL을 입력하면 AI가 인프라 다이어그램을 생성합니다.

**라이브 데모**: [archgen.zzimong.com](https://archgen.zzimong.com)

## 주요 기능

- **3가지 입력 방식**: 텍스트 설명 / kubectl·azure·docker-compose CLI 출력 / Git URL
- **AI 파싱**: DeepSeek V3 (Gemini Flash 폴백)로 JSON IR 생성
- **인터랙티브 다이어그램**: React Flow 기반, 드래그/연결 편집 가능
- **AI 수정**: 자연어로 다이어그램 수정 ("RDS를 Aurora로 교체해줘")
- **보안 분석**: LLM이 인프라 구성 취약점 분석
- **내보내기**: PNG, 포트폴리오 HTML

## 기술 스택

| 구성 | 기술 |
|------|------|
| Backend | FastAPI, SQLAlchemy async, SQLite |
| Frontend | React 18, TypeScript, Vite, React Flow |
| LLM | DeepSeek V3 (primary), Gemini 2.5 Flash (fallback) |
| 배포 | Cloudflare Tunnel, port 8081 |

## 로컬 실행

```bash
# 의존성 (로컬 venv 필요)
python3 -m venv ~/Library/Python/archgen-venv
~/Library/Python/archgen-venv/bin/pip install -r requirements.txt

# 시작
cd /Volumes/OpenClawSSD/projects/archgen
bash start.sh
```

## API 엔드포인트

| 엔드포인트 | 설명 |
|-----------|------|
| `POST /api/parse/text` | 텍스트 → JSON IR |
| `POST /api/parse/cli` | CLI 출력 → JSON IR |
| `POST /api/parse/git` | Git URL → JSON IR |
| `POST /api/diagrams/modify` | 자연어 수정 |
| `POST /api/analyze/security` | 보안 분석 |
| `GET /api/health` | 헬스체크 |

## 환경 변수

`.env` 파일에 설정 (`.env.example` 참고):

```env
DEEPSEEK_API_KEY=    # DeepSeek V3 API 키
FALLBACK_API_KEY=    # Gemini API 키 (폴백)
ARCHGEN_PORT=8081
```
