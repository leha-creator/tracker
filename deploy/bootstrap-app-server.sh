#!/bin/sh
# Разовая подготовка сервера приложения под Tasker (идемпотентно, можно запускать повторно).
# Сервер уже подготовлен репозиторием leha-creator/infra (infra/host/bootstrap-server.sh):
# Docker, пользователь deploy, ufw, swap, общий edge-прокси (/opt/edge, сеть edge), MSS clamping.
# Этот скрипт общий edge не меняет и без него останавливается.
# Запускается под root из копии каталога deploy/ на сервере:
#
#   scp -r deploy root@<host>:/tmp/tasker-deploy
#   ssh root@<host> "TASKER_DEPLOY_PUBKEY='ssh-ed25519 AAAA... tasker-ci' ADMIN_EMAILS='me@example.com' \
#     sh /tmp/tasker-deploy/bootstrap-app-server.sh"
#
# Что делает:
#   - проверяет пользователя deploy, Docker, сеть edge и каталог /opt/edge/sites;
#   - каталоги /opt/tasker и /opt/tasker/backups для deploy, копирует backup.sh, reminders.sh, cleanup.sh;
#   - добавляет ключ деплоя Tasker в authorized_keys пользователя deploy;
#   - создаёт /opt/tasker/.env со сгенерированными секретами, если его ещё нет (существующий не трогает);
#   - ставит systemd-таймеры резервных копий, напоминаний о сроке и очистки журнала.
# Секреты в вывод не печатаются.
set -eu

SRC="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
EDGE_DIR=/opt/edge
APP_DIR=/opt/tasker
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
for f in tasker/.env.example tasker/backup.sh tasker/reminders.sh tasker/cleanup.sh tasker/systemd/tasker-backup@.service; do
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
  # hex — без символов, которые пришлось бы экранировать в sed и .env.
  sed \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" \
    -e "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=$(openssl rand -hex 24)|" \
    -e "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -hex 32)|" \
    -e "s|^CRON_SECRET=.*|CRON_SECRET=$(openssl rand -hex 32)|" \
    -e "s|^ADMIN_EMAILS=.*|ADMIN_EMAILS=$ADMIN_EMAILS|" \
    "$SRC/tasker/.env.example" > "$APP_DIR/.env"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  log ".env: ok (created with generated secrets)"
fi

# --- резервные копии -------------------------------------------------------------
if [ -d "$SRC/tasker/systemd" ] && command -v systemctl > /dev/null 2>&1; then
  install -o root -g root -m 644 "$SRC"/tasker/systemd/* /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now tasker-backup-db.timer tasker-backup-files.timer > /dev/null
  log "backup timers: ok ($(systemctl list-timers 'tasker-backup-*' --no-legend | wc -l) active)"
  # Без CRON_SECRET в .env эндпоинт отвечает 404 — таймер включаем всё равно, он просто не шлёт.
  systemctl enable --now tasker-reminders.timer tasker-cleanup.timer > /dev/null
  log "reminders and cleanup timers: ok"
else
  log "backup timers: skip (no systemd units or systemctl)"
fi

log "done. Next: run the deploy workflow (see docs/production.md)"
