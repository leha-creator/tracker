#!/bin/sh
# Копия базы Tasker перед миграциями.
#
#   backup.sh db      # pg_dump -Fc общей базы → /opt/tasker/backups/db, хранится BACKUP_KEEP_DB (7)
#
# Запускает workflow деплоя перед миграциями. Ежедневный дамп общей базы делает infra
# (/opt/backups/dumps/tasker), файлы лежат в Yandex Object Storage. Копия лежит на том же
# диске: защищает от неудачных миграций, но не от потери сервера.
#
# База — общий Postgres из leha-creator/infra: хост postgres:5432 в сети db, роль и база tasker,
# пароль — TASKER_DB_PASSWORD из /opt/tasker/.env. Клиент — временный контейнер в сети db,
# пароль передаётся через окружение (PGPASSWORD), не через аргументы.
#
# Восстановление БД (поверх текущих данных, приложение остановлено) — docs/production.md,
# «Резервные копии»: pg_restore --clean под ролью tasker без записей EXTENSION (pg_trgm — infra).
set -eu

KIND="${1:-}"
BACKUP_DIR="${BACKUP_DIR:-/opt/tasker/backups}"
KEEP_DB="${BACKUP_KEEP_DB:-7}"
APP_ENV="${APP_ENV:-/opt/tasker/.env}"
DB_NETWORK="${DB_NETWORK:-db}"
# Тот же тег, что у общего Postgres в infra: pg_dump не старше сервера.
PG_IMAGE="${PG_IMAGE:-postgres:18.6-alpine}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

log() {
  echo "[backup] $*"
}

# Оставляет $2 самых свежих файлов по маске $1 в каталоге $3.
prune() {
  # Маска $1 намеренно без кавычек (glob); имена файлов наши, без пробелов.
  # shellcheck disable=SC2012,SC2086
  ls -1t "$3"/$1 2> /dev/null | tail -n +"$(($2 + 1))" | while read -r old; do
    rm -f "$old"
    log "prune removed=$old"
  done
}

# Клиент Postgres во временном контейнере в сети db. PGPASSWORD уходит в контейнер
# из окружения (`-e PGPASSWORD` без значения), в списке процессов его нет.
pg_client() {
  PGPASSWORD="$DB_PASSWORD" docker run --rm --network "$DB_NETWORK" -e PGPASSWORD "$PG_IMAGE" "$@"
}

backup_db() {
  dir="$BACKUP_DIR/db"
  mkdir -p "$dir"
  # Ошибки, а не skip: CI запускает копию перед миграциями и должен остановиться, если её нет.
  DB_PASSWORD="$(sed -n 's/^TASKER_DB_PASSWORD=//p' "$APP_ENV" 2> /dev/null || true)"
  if [ -z "$DB_PASSWORD" ]; then
    log "db fail: TASKER_DB_PASSWORD is not set in $APP_ENV"
    return 1
  fi
  if ! docker network inspect "$DB_NETWORK" > /dev/null 2>&1; then
    log "db fail: docker network $DB_NETWORK does not exist (shared Postgres is not set up)"
    return 1
  fi
  if ! tables="$(pg_client psql -h postgres -U tasker -d tasker -tAc \
    "select count(*) from information_schema.tables where table_schema = 'public'")"; then
    log "db fail: cannot connect to postgres:5432 as tasker"
    return 1
  fi
  # Первый деплой на новом сервере: схемы ещё нет, копировать нечего.
  if [ "$tables" = "0" ]; then
    log "db skip: database is empty"
    return 0
  fi
  file="$dir/tasker-$STAMP.dump"
  log "db start file=$file tables=$tables"
  if ! pg_client pg_dump -h postgres -U tasker -d tasker -Fc > "$file.tmp"; then
    rm -f "$file.tmp"
    log "db fail"
    return 1
  fi
  mv "$file.tmp" "$file"
  log "db done size=$(wc -c < "$file") file=$file"
  prune 'tasker-*.dump' "$KEEP_DB" "$dir"
}

case "$KIND" in
  db) backup_db ;;
  *)
    echo "usage: $0 db" >&2
    exit 2
    ;;
esac
