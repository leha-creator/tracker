#!/bin/sh
# Разовая подготовка сервера приложения под Tasker (идемпотентно, можно запускать повторно).
# Сервер уже подготовлен репозиторием leha-creator/infra (infra/host/bootstrap-server.sh):
# Docker, пользователь deploy, ufw, swap, общий edge-прокси (/opt/edge, сеть edge), MSS clamping,
# а общий Postgres (сеть db, роль и база tasker) — infra/postgres/install.sh.
# Этот скрипт общие сервисы не меняет и без них останавливается.
# Запускается под root из копии каталога deploy/ на сервере:
#
#   scp -r deploy root@<host>:/tmp/tasker-deploy
#   ssh root@<host> "TASKER_DEPLOY_PUBKEY='ssh-ed25519 AAAA... tasker-ci' ADMIN_EMAILS='me@example.com' \
#     sh /tmp/tasker-deploy/bootstrap-app-server.sh"
#
# Что делает:
#   - проверяет пользователя deploy, Docker, сети edge и db, каталог /opt/edge/sites;
#   - каталоги /opt/tasker и /opt/tasker/backups для deploy, копирует backup.sh, reminders.sh, cleanup.sh;
#   - добавляет ключ деплоя Tasker в authorized_keys пользователя deploy;
#   - создаёт /opt/tasker/.env со сгенерированными секретами и паролем БД из /opt/postgres/.env,
#     если его ещё нет (существующий не трогает);
#   - ставит systemd-таймеры напоминаний о сроке и очистки журнала. Ежедневный дамп БД делает infra,
#     файлы лежат в Object Storage — прежние таймеры tasker-backup-db и tasker-backup-files выключаются.
# Ключ Object Storage (S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY) скрипт не создаёт: его пишет в .env
# deploy/rotate-storage-key.sh с рабочей машины.
# Секреты в вывод не печатаются.
set -eu

SRC="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
EDGE_DIR=/opt/edge
APP_DIR=/opt/tasker
POSTGRES_ENV=/opt/postgres/.env
INFRA_HINT="run infra/host/bootstrap-server.sh from leha-creator/infra first"

log() {
  echo "[bootstrap] $*"
}

if [ "$(id -u)" -ne 0 ]; then
  log "fail: run as root"
  exit 1
fi
if ! id "$DEPLOY_USER" > /dev/null 2>&1; then
  log "fail: user $DEPLOY_USER does not exist ($INFRA_HINT)"
  exit 1
fi
for f in tasker/.env.example tasker/backup.sh tasker/reminders.sh tasker/cleanup.sh tasker/systemd/tasker-reminders.timer; do
  if [ ! -f "$SRC/$f" ]; then
    log "fail: $SRC/$f not found (copy the whole deploy/ directory)"
    exit 1
  fi
done

# --- общий edge-прокси (только проверка) -------------------------------------------
if ! command -v docker > /dev/null 2>&1; then
  log "fail: docker is not installed ($INFRA_HINT)"
  exit 1
fi
if ! docker network inspect edge > /dev/null 2>&1; then
  log "fail: docker network edge does not exist (edge proxy is not set up: $INFRA_HINT)"
  exit 1
fi
if [ ! -d "$EDGE_DIR/sites" ]; then
  log "fail: $EDGE_DIR/sites does not exist (edge proxy is not set up: $INFRA_HINT)"
  exit 1
fi
log "edge proxy: ok (network edge, $EDGE_DIR/sites)"

# --- общий Postgres (только проверка) ---------------------------------------------
if ! docker network inspect db > /dev/null 2>&1; then
  log "fail: docker network db does not exist (shared Postgres is not set up: run infra/postgres/install.sh from leha-creator/infra)"
  exit 1
fi
log "db network: ok"

# --- каталог приложения ----------------------------------------------------------
# backups/db не трогаем: его читает вывоз дампов infra.
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 750 "$APP_DIR" "$APP_DIR/backups"
install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "$SRC/tasker/backup.sh" "$APP_DIR/backup.sh"
install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "$SRC/tasker/reminders.sh" "$APP_DIR/reminders.sh"
install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "$SRC/tasker/cleanup.sh" "$APP_DIR/cleanup.sh"
log "app dir: ok ($APP_DIR)"

# --- ключ деплоя -----------------------------------------------------------------
if [ -n "${TASKER_DEPLOY_PUBKEY:-}" ]; then
  home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
  keys="$home/.ssh/authorized_keys"
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 700 "$home/.ssh"
  touch "$keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$keys"
  chmod 600 "$keys"
  if grep -qxF "$TASKER_DEPLOY_PUBKEY" "$keys"; then
    log "deploy key: skip (already authorized)"
  else
    printf '%s\n' "$TASKER_DEPLOY_PUBKEY" >> "$keys"
    log "deploy key: ok (added)"
  fi
else
  log "deploy key: skip (TASKER_DEPLOY_PUBKEY is not set)"
fi

# --- .env с секретами ------------------------------------------------------------
if [ -f "$APP_DIR/.env" ]; then
  log ".env: skip (exists, not modified)"
else
  if [ -z "${ADMIN_EMAILS:-}" ]; then
    log "fail: ADMIN_EMAILS is required to create $APP_DIR/.env"
    exit 1
  fi
  umask 077
  # Пароль роли tasker создаёт infra; значение не выводится. Нет файла — переносится позже вручную.
  db_password=""
  if [ -r "$POSTGRES_ENV" ]; then
    db_password="$(sed -n 's/^TASKER_DB_PASSWORD=//p' "$POSTGRES_ENV")"
  fi
  # hex — без символов, которые пришлось бы экранировать в sed и .env (пароль infra — тоже hex).
  sed \
    -e "s|^TASKER_DB_PASSWORD=.*|TASKER_DB_PASSWORD=$db_password|" \
\
    -e "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -hex 32)|" \
    -e "s|^CRON_SECRET=.*|CRON_SECRET=$(openssl rand -hex 32)|" \
    -e "s|^ADMIN_EMAILS=.*|ADMIN_EMAILS=$ADMIN_EMAILS|" \
    "$SRC/tasker/.env.example" > "$APP_DIR/.env"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  if [ -n "$db_password" ]; then
    log ".env: ok (created with generated secrets, TASKER_DB_PASSWORD from $POSTGRES_ENV)"
  else
    log ".env: ok (created with generated secrets; TASKER_DB_PASSWORD is empty: copy it from $POSTGRES_ENV, see docs/production.md)"
  fi
  unset db_password
fi
if grep -q '^S3_ACCESS_KEY_ID=..*' "$APP_DIR/.env"; then
  log "storage key: ok (S3_ACCESS_KEY_ID is set)"
else
  log "storage key: missing (run deploy/rotate-storage-key.sh from a workstation before deploying)"
fi

# --- таймеры ----------------------------------------------------------------------
if [ -d "$SRC/tasker/systemd" ] && command -v systemctl > /dev/null 2>&1; then
  # Ежедневный дамп общей базы делает infra (/opt/backups/dumps/tasker), копию перед миграциями —
  # CI (backup.sh db); файлы — в Object Storage. Прежние таймеры копий выключаем и удаляем.
  for unit in tasker-backup-db.timer tasker-backup-files.timer tasker-backup@.service; do
    if [ -f "/etc/systemd/system/$unit" ]; then
      systemctl disable --now "$unit" > /dev/null 2>&1 || true
      rm -f "/etc/systemd/system/$unit"
      log "$unit: removed (backups are made by infra, files live in Object Storage)"
    fi
  done
  install -o root -g root -m 644 "$SRC"/tasker/systemd/* /etc/systemd/system/
  systemctl daemon-reload
  # Без CRON_SECRET в .env эндпоинт отвечает 404 — таймер включаем всё равно, он просто не шлёт.
  systemctl enable --now tasker-reminders.timer tasker-cleanup.timer > /dev/null
  log "reminders and cleanup timers: ok"
else
  log "timers: skip (no systemd units or systemctl)"
fi

log "done. Next: run the deploy workflow (see docs/production.md)"
