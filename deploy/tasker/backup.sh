#!/bin/sh
# Резервные копии прод-стека Tasker на сервере.
#
#   backup.sh db      # pg_dump -Fc → /opt/tasker/backups/db, хранится BACKUP_KEEP_DB (7) последних
#   backup.sh files   # tar тома MinIO → /opt/tasker/backups/files, хранится BACKUP_KEEP_FILES (2)
#
# Запускается systemd-таймерами под пользователем deploy (ставит deploy/bootstrap-server.sh)
# и workflow деплоя перед миграциями. Копии лежат на том же диске: защищают от ошибок
# и неудачных миграций, но не от потери сервера.
#
# Восстановление БД:
#   docker exec -i tasker-postgres-1 sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < dump-file
set -eu

KIND="${1:-}"
BACKUP_DIR="${BACKUP_DIR:-/opt/tasker/backups}"
KEEP_DB="${BACKUP_KEEP_DB:-7}"
KEEP_FILES="${BACKUP_KEEP_FILES:-2}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-tasker-postgres-1}"
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

backup_db() {
  dir="$BACKUP_DIR/db"
  mkdir -p "$dir"
  if ! docker inspect -f '{{.State.Running}}' "$POSTGRES_CONTAINER" 2> /dev/null | grep -q true; then
    log "db skip: container $POSTGRES_CONTAINER is not running"
    return 0
  fi
  file="$dir/tasker-$STAMP.dump"
  log "db start file=$file"
  # Переменные POSTGRES_* берутся из окружения контейнера, пароль не нужен (локальный сокет).
  if ! docker exec "$POSTGRES_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$file.tmp"; then
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
  # Образ postgres:17-alpine уже есть на сервере — отдельный образ для tar не тянем.
  if ! docker run --rm -v "$MINIO_VOLUME":/data:ro -v "$dir":/backup postgres:17-alpine \
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
