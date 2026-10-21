#!/bin/sh
# Резервные копии прод-стека Tasker на сервере.
#
#   backup.sh db      # pg_dump -Fc общей базы → /opt/tasker/backups/db, хранится BACKUP_KEEP_DB (7)
#   backup.sh files   # tar тома MinIO → /opt/tasker/backups/files, хранится BACKUP_KEEP_FILES (2)
#
# `db` запускает workflow деплоя перед миграциями (ежедневный дамп общей базы делает infra:
# /opt/backups/dumps/tasker), `files` — таймер под пользователем deploy (ставит
# deploy/bootstrap-app-server.sh). Копии лежат на том же диске: защищают от ошибок
# и неудачных миграций, но не от потери сервера.
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
KEEP_FILES="${BACKUP_KEEP_FILES:-2}"
APP_ENV="${APP_ENV:-/opt/tasker/.env}"
DB_NETWORK="${DB_NETWORK:-db}"
# Тот же тег, что у общего Postgres в infra: pg_dump не старше сервера.
PG_IMAGE="${PG_IMAGE:-postgres:18.6-alpine}"
MINIO_VOLUME="${MINIO_VOLUME:-tasker_minio-data}"
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

backup_files() {
  dir="$BACKUP_DIR/files"
  mkdir -p "$dir"
  if ! docker volume inspect "$MINIO_VOLUME" > /dev/null 2>&1; then
    log "files skip: volume $MINIO_VOLUME does not exist"
    return 0
  fi
  name="files-$STAMP.tar.gz"
  log "files start file=$dir/$name"
  # Образ клиента Postgres уже есть на сервере — отдельный образ для tar не тянем.
  if ! docker run --rm -v "$MINIO_VOLUME":/data:ro -v "$dir":/backup "$PG_IMAGE" \
    sh -c "tar czf /backup/$name.tmp -C /data . && chown $(id -u):$(id -g) /backup/$name.tmp"; then
    rm -f "$dir/$name.tmp"
    log "files fail"
    return 1
  fi
  mv "$dir/$name.tmp" "$dir/$name"
  log "files done size=$(wc -c < "$dir/$name") file=$dir/$name"
  prune 'files-*.tar.gz' "$KEEP_FILES" "$dir"
}

case "$KIND" in
  db) backup_db ;;
  files) backup_files ;;
  *)
    echo "usage: $0 db|files" >&2
    exit 2
    ;;
esac
