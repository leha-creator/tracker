#!/bin/sh
# Перенос файлов Tasker из MinIO в Yandex Object Storage (бакет из leha-creator/infra).
# Разовый инструмент переезда и отката, удаляется после него (docs/production.md,
# «Переезд файлов в Object Storage»). Запускается на сервере под deploy из /opt/tasker:
#
#   sh /opt/tasker/files-sync.sh sync             # MinIO → Yandex: зеркало, лишнее в Yandex удаляется
#   sh /opt/tasker/files-sync.sh check            # сравнить MinIO и Yandex (хеши), код 1 при расхождениях
#   sh /opt/tasker/files-sync.sh sync --reverse   # откат: Yandex → MinIO, только докопировать новое
#   sh /opt/tasker/files-sync.sh check --reverse  # сравнить в обратную сторону
#
# rclone работает во временном контейнере в сети стека (видит minio:9000) с выходом в интернет.
# Учётки берутся из /opt/tasker/.env: MinIO — MINIO_ROOT_USER/MINIO_ROOT_PASSWORD, Yandex —
# S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY (пишет deploy/rotate-storage-key.sh). В контейнер они
# попадают через временный env-файл (600, удаляется при выходе), не через аргументы.
# Пути объектов не меняются: бакет S3_BUCKET с обеих сторон.
set -eu

MODE="${1:-}"
DIRECTION="${2:-}"
APP_ENV="${APP_ENV:-/opt/tasker/.env}"
MINIO_NETWORK="${MINIO_NETWORK:-tasker_tasker}"
MINIO_URL="${MINIO_URL:-http://minio:9000}"
YANDEX_URL="${YANDEX_URL:-https://storage.yandexcloud.net}"
RCLONE_IMAGE="${RCLONE_IMAGE:-rclone/rclone:1.71.2}"

log() {
  echo "[files-sync] $*"
}

case "$MODE" in
  sync | check) ;;
  *)
    echo "usage: $0 sync|check [--reverse]" >&2
    exit 2
    ;;
esac
case "$DIRECTION" in
  '' | --reverse) ;;
  *)
    echo "usage: $0 sync|check [--reverse]" >&2
    exit 2
    ;;
esac

# Значение ключа из .env без вывода; кавычки вокруг значения снимаются.
env_value() {
  sed -n "s/^$1=//p" "$APP_ENV" | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

[ -r "$APP_ENV" ] || {
  log "fail: $APP_ENV is not readable"
  exit 1
}
bucket="$(env_value S3_BUCKET)"
src_bucket="${SRC_BUCKET:-$bucket}"
dst_bucket="${DST_BUCKET:-$bucket}"
for key in MINIO_ROOT_USER MINIO_ROOT_PASSWORD S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do
  if [ -z "$(env_value "$key")" ]; then
    log "fail: $key is not set in $APP_ENV"
    exit 1
  fi
done
if [ -z "$src_bucket" ] || [ -z "$dst_bucket" ]; then
  log "fail: S3_BUCKET is not set in $APP_ENV"
  exit 1
fi
if ! docker network inspect "$MINIO_NETWORK" > /dev/null 2>&1; then
  log "fail: docker network $MINIO_NETWORK does not exist (is MinIO still running?)"
  exit 1
fi

envfile="$(umask 077 && mktemp)"
trap 'rm -f "$envfile"' EXIT INT TERM
# no_check_bucket: у ключа Yandex нет прав создавать бакеты, проверять их rclone не должен.
{
  echo "RCLONE_CONFIG_MINIO_TYPE=s3"
  echo "RCLONE_CONFIG_MINIO_PROVIDER=Minio"
  echo "RCLONE_CONFIG_MINIO_ENDPOINT=$MINIO_URL"
  echo "RCLONE_CONFIG_MINIO_REGION=us-east-1"
  echo "RCLONE_CONFIG_MINIO_FORCE_PATH_STYLE=true"
  echo "RCLONE_CONFIG_MINIO_ACCESS_KEY_ID=$(env_value MINIO_ROOT_USER)"
  echo "RCLONE_CONFIG_MINIO_SECRET_ACCESS_KEY=$(env_value MINIO_ROOT_PASSWORD)"
  echo "RCLONE_CONFIG_YANDEX_TYPE=s3"
  echo "RCLONE_CONFIG_YANDEX_PROVIDER=Other"
  echo "RCLONE_CONFIG_YANDEX_ENDPOINT=$YANDEX_URL"
  echo "RCLONE_CONFIG_YANDEX_REGION=ru-central1"
  echo "RCLONE_CONFIG_YANDEX_FORCE_PATH_STYLE=true"
  echo "RCLONE_CONFIG_YANDEX_NO_CHECK_BUCKET=true"
  echo "RCLONE_CONFIG_YANDEX_ACCESS_KEY_ID=$(env_value S3_ACCESS_KEY_ID)"
  echo "RCLONE_CONFIG_YANDEX_SECRET_ACCESS_KEY=$(env_value S3_SECRET_ACCESS_KEY)"
} > "$envfile"

if [ "$DIRECTION" = --reverse ]; then
  src="yandex:$dst_bucket"
  dst="minio:$src_bucket"
  # Откат только докопирует файлы, загруженные после переезда: удаления не повторяются.
  verb=copy
else
  src="minio:$src_bucket"
  dst="yandex:$dst_bucket"
  verb=sync
fi

rclone() {
  docker run --rm --network "$MINIO_NETWORK" --env-file "$envfile" "$RCLONE_IMAGE" "$@"
}

if [ "$MODE" = sync ]; then
  log "$verb start $src -> $dst"
  if ! rclone "$verb" "$src" "$dst" --stats-one-line --stats 1m --stats-log-level NOTICE; then
    log "$verb fail ($src -> $dst)"
    exit 1
  fi
  log "$verb done $src -> $dst"
else
  log "check start $src -> $dst"
  # --one-way в обратную сторону: в MinIO могут остаться файлы, удалённые после переезда.
  one_way=""
  [ "$DIRECTION" = --reverse ] && one_way="--one-way"
  out="$(mktemp)"
  # shellcheck disable=SC2086 # one_way — пусто или один флаг
  if rclone check "$src" "$dst" $one_way 2> "$out"; then
    log "check: ok ($(grep -o '[0-9]* matching files' "$out" | tail -n 1 || echo 'no files'))"
    rm -f "$out"
  else
    log "check: fail ($(grep -o '[0-9]* differences found' "$out" | tail -n 1 || echo 'see rclone output'))"
    grep -E 'ERROR|NOTICE' "$out" | head -20
    rm -f "$out"
    exit 1
  fi
fi
