#!/bin/sh
# Напоминания о сроке задач: POST /api/cron/reminders изнутри контейнера приложения.
#
#   reminders.sh
#
# Запускается systemd-таймером tasker-reminders.timer под пользователем deploy (ставит
# deploy/bootstrap-server.sh); вручную — тем же пользователем. Секрет берётся из окружения
# контейнера (CRON_SECRET из /opt/tasker/.env) и не попадает в командную строку: её видно в ps.
# Повторный запуск в тот же день безопасен — уже отправленные напоминания не повторяются.
set -eu

APP_CONTAINER="${APP_CONTAINER:-tasker-app-1}"

log() {
  echo "[reminders] $*"
}

# fetch встроен в Node 24; ответ — JSON со счётчиками { dueSoon, overdue, skipped, failedBatches }.
# shellcheck disable=SC2016
docker exec "$APP_CONTAINER" node -e '
const secret = process.env.CRON_SECRET;
if (!secret) { console.error("CRON_SECRET is not set"); process.exit(2); }
fetch("http://127.0.0.1:3000/api/cron/reminders", {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(300000),
})
  .then(async (response) => {
    console.log(response.status, await response.text());
    process.exit(response.ok ? 0 : 1);
  })
  .catch((error) => { console.error(error.message); process.exit(1); });
'
log "done"
