#!/bin/sh
# Разовая подготовка сервера под Tasker (идемпотентно, можно запускать повторно).
# Запускается под root из копии каталога deploy/ на сервере:
#
#   scp -r deploy root@<host>:/tmp/tasker-deploy
#   ssh root@<host> "TASKER_DEPLOY_PUBKEY='ssh-ed25519 AAAA... tasker-ci' ADMIN_EMAILS='me@example.com' \
#     sh /tmp/tasker-deploy/bootstrap-server.sh"
#
# Что делает:
#   - каталоги /opt/edge (+ sites/) и /opt/tasker (+ backups/) с правами для пользователя deploy;
#   - копирует конфиг edge-прокси (deploy/edge) в /opt/edge — сам прокси НЕ запускает;
#   - создаёт docker-сеть edge;
#   - добавляет ключ деплоя Tasker в authorized_keys пользователя deploy;
#   - создаёт /opt/tasker/.env со сгенерированными секретами, если его ещё нет (существующий не трогает);
#   - ставит backup.sh и systemd-таймеры резервных копий, reminders.sh и таймер напоминаний о сроке;
#   - включает MSS clamping для трафика контейнеров (deploy/host/docker-mss-clamp.service).
# Секреты в вывод не печатаются.
set -eu

SRC="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
EDGE_DIR=/opt/edge
APP_DIR=/opt/tasker

log() {
  echo "[bootstrap] $*"
}

if [ "$(id -u)" -ne 0 ]; then
  log "fail: run as root"
  exit 1
fi
if ! id "$DEPLOY_USER" > /dev/null 2>&1; then
  log "fail: user $DEPLOY_USER does not exist"
  exit 1
fi
for f in edge/compose.yml edge/Caddyfile tasker/.env.example tasker/backup.sh; do
  if [ ! -f "$SRC/$f" ]; then
    log "fail: $SRC/$f not found (copy the whole deploy/ directory)"
    exit 1
  fi
done

# --- edge-прокси -----------------------------------------------------------------
install -d -o root -g "$DEPLOY_USER" -m 750 "$EDGE_DIR"
# setgid: файлы сайтов, которые пишет deploy, остаются в группе deploy.
install -d -o root -g "$DEPLOY_USER" -m 2775 "$EDGE_DIR/sites"
install -o root -g "$DEPLOY_USER" -m 644 "$SRC/edge/compose.yml" "$SRC/edge/Caddyfile" "$EDGE_DIR/"
[ -f "$SRC/edge/README.md" ] && install -o root -g "$DEPLOY_USER" -m 644 "$SRC/edge/README.md" "$EDGE_DIR/"
log "edge config: ok ($EDGE_DIR)"

if docker network inspect edge > /dev/null 2>&1; then
  log "docker network edge: skip (exists)"
else
  docker network create edge > /dev/null
  log "docker network edge: ok (created)"
fi

# --- каталог приложения ----------------------------------------------------------
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 750 "$APP_DIR" "$APP_DIR/backups"
install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "$SRC/tasker/backup.sh" "$APP_DIR/backup.sh"
install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "$SRC/tasker/reminders.sh" "$APP_DIR/reminders.sh"
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
  systemctl enable --now tasker-reminders.timer > /dev/null
  log "reminders timer: ok"
else
  log "backup timers: skip (no systemd units or systemctl)"
fi

# --- MSS clamping для контейнеров (MTU сервера меньше, чем у сетей Docker) -------------
if [ -f "$SRC/host/docker-mss-clamp.service" ] && command -v systemctl > /dev/null 2>&1; then
  install -o root -g root -m 644 "$SRC/host/docker-mss-clamp.service" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable docker-mss-clamp.service > /dev/null
  systemctl restart docker-mss-clamp.service
  log "docker MSS clamping: ok ($(iptables -t mangle -S FORWARD | grep -c TCPMSS) rule)"
else
  log "docker MSS clamping: skip (no unit file or systemctl)"
fi

# --- проверки SSH ----------------------------------------------------------------
sshd_conf="$(sshd -T 2> /dev/null || true)"
if echo "$sshd_conf" | grep -qi '^passwordauthentication no'; then
  log "sshd PasswordAuthentication: ok (no)"
else
  log "sshd PasswordAuthentication: WARN (enabled) — disable it"
fi
if echo "$sshd_conf" | grep -Eqi '^permitrootlogin (prohibit-password|without-password|no)'; then
  log "sshd PermitRootLogin: ok"
else
  log "sshd PermitRootLogin: WARN (password login allowed) — set prohibit-password"
fi

log "done. Next: start edge proxy (see $EDGE_DIR/README.md, section about moving from maxim)"
