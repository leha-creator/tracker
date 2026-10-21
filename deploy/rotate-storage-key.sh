#!/bin/sh
# Статический ключ S3 сервисного аккаунта tasker-attachments (бакет tasker-attachments в Yandex
# Object Storage, готовит leha-creator/infra: storage/tasker-attachments.md). Создаёт новый ключ
# и сразу записывает его в /opt/tasker/.env на сервере. Повторный запуск — ротация тем же путём.
# Запускается с рабочей машины с профилем yc и ключом деплоя:
#
#   sh deploy/rotate-storage-key.sh
#
# Секрет не попадает ни на экран, ни в аргументы команд, ни в локальные файлы: он живёт только
# в переменной и уходит на сервер через stdin ssh. Рядом с .env остаётся копия .env.bak-<дата>
# со старым ключом — удалить после проверки. Старый ключ скрипт не удаляет: это отдельный шаг
# после пересоздания app и проверки загрузки и скачивания (docs/production.md).
# Переопределяемые переменные: YC_PROFILE, APP_HOST, SSH_KEY.
set -eu

YC_PROFILE=${YC_PROFILE:-aandreev}
SA_NAME=tasker-attachments
APP_HOST=${APP_HOST:-deploy@95.163.229.132}
SSH_KEY=${SSH_KEY:-$HOME/.ssh/tasker_deploy}
APP_ENV=/opt/tasker/.env
STAMP=$(date +%Y%m%d)
DESCRIPTION="tasker prod app $(date +%Y-%m-%d)"

export YC_CLI_INITIALIZATION_SILENCE=true

log() { printf '[keys] %s\n' "$*"; }
fail() {
  printf '[keys] fail: %s\n' "$*" >&2
  exit 1
}

# Печатает одно поле JSON со stdin; путь через точку (access_key.key_id).
json_field() {
  node -e '
    let s = "";
    process.stdin.on("data", (c) => (s += c)).on("end", () => {
      let v = JSON.parse(s);
      for (const p of process.argv[1].split(".")) v = v?.[p];
      if (typeof v !== "string" || !v) process.exit(3);
      process.stdout.write(v);
    });
  ' "$1"
}

# Команда yc create с повтором только при «error dialing endpoint»: соединение не установлено,
# ничего не создано, и повтор не создаст второй ключ.
yc_create() {
  attempt=1
  while :; do
    err=$(mktemp)
    if out=$(yc --profile "$YC_PROFILE" "$@" 2> "$err"); then
      rm -f "$err"
      printf '%s' "$out"
      return 0
    fi
    if [ "$attempt" -lt 4 ] && grep -q 'error dialing endpoint' "$err"; then
      rm -f "$err"
      log "yc could not connect (attempt $attempt), retrying in 10 s" >&2
      attempt=$((attempt + 1))
      sleep 10
      continue
    fi
    cat "$err" >&2
    rm -f "$err"
    return 1
  done
}

command -v yc > /dev/null || fail "yc not found"
command -v node > /dev/null || fail "node not found"
[ -f "$SSH_KEY" ] || fail "ssh key $SSH_KEY not found"

log "checking ssh to $APP_HOST"
ssh -i "$SSH_KEY" -o ConnectTimeout=15 "$APP_HOST" "test -w $APP_ENV" \
  || fail "$APP_ENV is not writable for deploy"
log "ssh: ok"

log "creating static access key for service account $SA_NAME"
KEY_JSON=$(yc_create iam access-key create \
  --service-account-name "$SA_NAME" --description "$DESCRIPTION" --format json) \
  || fail "yc iam access-key create"
KEY_ID=$(printf '%s' "$KEY_JSON" | json_field access_key.id) || fail "parse access_key.id"
S3_KEY_ID=$(printf '%s' "$KEY_JSON" | json_field access_key.key_id) || fail "parse access_key.key_id"
S3_SECRET=$(printf '%s' "$KEY_JSON" | json_field secret) || fail "parse secret"
unset KEY_JSON
log "static key: ok (id=$KEY_ID key_id=$(printf '%s' "$S3_KEY_ID" | cut -c1-7)…)"

log "writing key to $APP_HOST:$APP_ENV"
# Удалённая программа — фиксированный текст, значения приходят только через stdin.
printf 'S3_ACCESS_KEY_ID=%s\nS3_SECRET_ACCESS_KEY=%s\n' "$S3_KEY_ID" "$S3_SECRET" \
  | ssh -i "$SSH_KEY" -o ConnectTimeout=15 "$APP_HOST" "
      set -eu
      umask 077
      cd $(dirname "$APP_ENV")
      cp -p .env .env.bak-$STAMP
      chmod 600 .env.bak-$STAMP
      cat > .env.keys
      awk 'NR == FNR { k = substr(\$0, 1, index(\$0, \"=\") - 1); v[k] = \$0; next }
           { k = substr(\$0, 1, index(\$0, \"=\") - 1)
             if (k in v) { print v[k]; seen[k] = 1 } else print }
           END { for (k in v) if (!(k in seen)) print v[k] }' .env.keys .env > .env.new
      rm -f .env.keys
      chmod 600 .env.new
      mv .env.new .env
      echo \"[keys] remote: S3_ACCESS_KEY_ID now \$(grep '^S3_ACCESS_KEY_ID=' .env | cut -c18-24)…\"
    " \
  || fail "writing $APP_ENV (new key $KEY_ID exists: rerun or delete it with 'yc iam access-key delete $KEY_ID')"
unset S3_SECRET
log "$APP_ENV: ok (backup $APP_ENV.bak-$STAMP)"

log "done: static key id=$KEY_ID"
log "next: recreate app and check uploads and downloads, then delete the previous key:"
log "  yc --profile $YC_PROFILE iam access-key list --service-account-name $SA_NAME"
log "  yc --profile $YC_PROFILE iam access-key delete <old key id>"
