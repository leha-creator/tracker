#!/bin/sh
# Smoke-проверка запущенного приложения: ждёт, пока GET $APP_URL/api/health
# не ответит 200 со статусом "ok".
#
#   sh scripts/smoke-health.sh                                 # http://localhost:3000
#   APP_URL=http://localhost:3001 SMOKE_TIMEOUT=120 sh scripts/smoke-health.sh
#
# Переменные: APP_URL (по умолчанию http://localhost:3000), SMOKE_TIMEOUT — общий таймаут
# в секундах (60), SMOKE_INTERVAL — пауза между попытками в секундах (2).
# Код выхода: 0 — приложение здорово, 1 — таймаут (печатается последний ответ).
set -u

APP_URL="${APP_URL:-http://localhost:3000}"
TIMEOUT="${SMOKE_TIMEOUT:-60}"
INTERVAL="${SMOKE_INTERVAL:-2}"
URL="${APP_URL%/}/api/health"

if ! command -v curl > /dev/null 2>&1; then
  echo "[smoke] failed: curl is not installed"
  exit 1
fi

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

attempt=0
started="$(date +%s)"
status="000"

while :; do
  attempt=$((attempt + 1))
  echo "[smoke] waiting for $URL (attempt $attempt)"

  # 000 — соединение не установлено (приложение ещё не слушает порт).
  status="$(curl -sS -o "$body_file" -w '%{http_code}' --max-time 5 "$URL" 2> /dev/null)" || status="000"

  if [ "$status" = "200" ] && grep -q '"status":"ok"' "$body_file"; then
    echo "[smoke] ok"
    exit 0
  fi

  elapsed=$(($(date +%s) - started))
  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    break
  fi
  sleep "$INTERVAL"
done

echo "[smoke] failed: $status $(cat "$body_file" 2> /dev/null)"
exit 1
