#!/bin/bash
# ArchGen 서비스 시작 스크립트

ARCHGEN_ROOT="/Volumes/OpenClawSSD/projects/archgen"
LOCAL_VENV="$HOME/Library/Python/archgen-venv"
LOG_FILE="$ARCHGEN_ROOT/logs/archgen.log"

mkdir -p "$ARCHGEN_ROOT/logs"

# 환경변수 로드 (.env)
if [ -f "$ARCHGEN_ROOT/.env" ]; then
  set -a; source "$ARCHGEN_ROOT/.env"; set +a
fi

# API 키 로드 (우선순위 높음)
if [ -f "/Volumes/OpenClawSSD/shared/.env.keys" ]; then
  set -a; source /Volumes/OpenClawSSD/shared/.env.keys; set +a
fi

cd "$ARCHGEN_ROOT"
echo "$(date) - ArchGen starting on port ${ARCHGEN_PORT:-8081}" | tee -a "$LOG_FILE"

exec "$LOCAL_VENV/bin/python" -m uvicorn api.main:app \
  --host "${ARCHGEN_HOST:-0.0.0.0}" \
  --port "${ARCHGEN_PORT:-8081}" \
  --loop asyncio \
  2>&1 | tee -a "$LOG_FILE"
