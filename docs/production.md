[← Docker-образ и CI](deployment.md) · [Back to README](../README.md) · [Интеграция с GitHub →](github.md)

# Продакшен

Tasker работает на `https://tracker.plwedding.ru`, сервер `95.163.229.132` (Ubuntu 26.04, 1 vCPU, 2 GB RAM + 2 GB swap). На том же сервере работают meet и стенд maxim (`dev.plwedding.ru`). Общие сервисы — подготовка хоста, edge-прокси, общий PostgreSQL 18, вывоз дампов БД за пределы сервера и бакет Yandex Object Storage для файлов — живут в [`leha-creator/infra`](https://github.com/leha-creator/infra), здесь только стек Tasker. Каждый пуш в `main` после зелёных проверок публикует образы в GHCR и деплоит их на сервер.

```
push в main ──► CI: check, migrations, docker ──► publish (GHCR) ──► deploy (SSH → docker compose)

интернет ──► edge-caddy-1 :80/:443 ──► сеть edge ──► tasker-app:3000      (tracker.plwedding.ru)
                                                 └─► maxim-mockapi:8080   (dev.plwedding.ru)
                         tasker-app ──► сеть db   ──► postgres:5432          (общий PostgreSQL 18, infra)
                         tasker-app ──► сеть edge ──► storage.yandexcloud.net (бакет tasker-attachments)
браузер ──► storage.yandexcloud.net/tasker-attachments/<key>?X-Amz-...     (presigned POST/GET)
```

## Что где лежит

| Путь на сервере | Что это | Кто меняет |
|-----------------|---------|------------|
| `/opt/edge/` | Общий edge-прокси: `compose.yml`, `Caddyfile`, `sites/` — см. [`infra/edge/README.md`](https://github.com/leha-creator/infra/blob/main/edge/README.md) | Вручную из infra (`edge/`), сайты — CI проектов |
| `/opt/edge/sites/tracker.caddy` | Сайт Tasker (из `deploy/tasker/tracker.caddy`, домен подставлен) | CI при каждом деплое |
| `/opt/tasker/compose.yml` | Прод-стек (из `deploy/tasker/compose.yml`) | CI при каждом деплое |
| `/opt/tasker/.env` | Секреты и настройки стека (`600`, владелец `deploy`) | Один раз `bootstrap-app-server.sh`, дальше вручную |
| `/opt/tasker/release.env` | `TASKER_TAG=sha-xxxxxxx` — текущий релиз | CI при каждом деплое |
| `/opt/tasker/backup.sh`, `/opt/tasker/backups/` | Скрипт и копии БД перед миграциями | CI |
| `/opt/tasker/files-sync.sh` | Перенос файлов MinIO ⇄ Object Storage (разовый, удаляется после переезда) | CI при каждом деплое |
| `/opt/postgres/` | Общий PostgreSQL 18: роль и база `tasker`, пароль — `TASKER_DB_PASSWORD` в `/opt/postgres/.env`, см. [`infra/postgres/README.md`](https://github.com/leha-creator/infra/blob/main/postgres/README.md) | infra (`postgres/install.sh`) |
| `/opt/backups/dumps/tasker/` | Ежедневные дампы общей базы Tasker (7 копий), вывоз в Object Storage | infra (`backups/`) |
| `/opt/tasker/reminders.sh` | Запуск напоминаний о сроке | CI при каждом деплое |
| `/opt/tasker/cleanup.sh` | Очистка журнала действий и счётчиков лимитов | CI при каждом деплое |
| `/etc/systemd/system/tasker-reminders.*` | Таймер напоминаний о сроке | `bootstrap-app-server.sh` |
| `/etc/systemd/system/tasker-cleanup.*` | Таймер очистки журнала | `bootstrap-app-server.sh` |
| `/etc/systemd/system/docker-mss-clamp.service` | MSS clamping для контейнеров (см. «Почта») | `host/bootstrap-server.sh` из infra |

Файлы, которые копирует CI, руками не правятся: следующий деплой их перезапишет.

### Что CI Tasker ждёт от infra

Деплой опирается на контракты общего edge-прокси (раздел «Неизменяемые контракты» в [`infra/edge/README.md`](https://github.com/leha-creator/infra/blob/main/edge/README.md)) и общего Postgres (раздел «Контракты» в [`infra/docs/postgres-handoff.md`](https://github.com/leha-creator/infra/blob/main/docs/postgres-handoff.md)) и бакета ([`infra/docs/storage-handoff.md`](https://github.com/leha-creator/infra/blob/main/docs/storage-handoff.md)). Меняются они только вместе с CI проектов:

- файл сайта `/opt/edge/sites/tracker.caddy` пишет пользователь `deploy` (каталог `root:deploy`, `2775`);
- `cd /opt/edge && docker compose exec -T caddy caddy validate|reload --config /etc/caddy/Caddyfile --adapter caddyfile` — проект `edge`, сервис `caddy`;
- внешняя docker-сеть `edge`, алиас `tasker-app`; через неё же приложение выходит в интернет (Object Storage, SMTP, GitHub, IdP `auth.plwedding.ru`);
- сниппет `(access_log)` в `/opt/edge/Caddyfile`: `tracker.caddy` делает `import access_log`, и деплой останавливается до загрузки файлов, если сниппета нет;
- внешняя docker-сеть `db` (internal), хост `postgres:5432`, роль и база `tasker`, пароль роли — ключ `TASKER_DB_PASSWORD` в `/opt/postgres/.env` (переносится в `/opt/tasker/.env`);
- бакет `tasker-attachments` в Yandex Object Storage (`ru-central1`, path-style), сервисный аккаунт `tasker-attachments` с ACL бакета, CORS только для `https://tracker.plwedding.ru` — см. [`infra/storage/tasker-attachments.md`](https://github.com/leha-creator/infra/blob/main/storage/tasker-attachments.md). Смена домена — через infra (правило CORS);
- дампы `tasker-*.dump` в `/opt/tasker/backups/db` (владелец `deploy`) — их забирает вывоз бэкапов infra, пока его источник не переключён на `/opt/backups/dumps/tasker` (после переезда на общий Postgres).

Шаг `Preflight` деплоя проверяет это до любых изменений на сервере: сеть `db`, непустой `TASKER_DB_PASSWORD` в `.env` и — пока на сервере есть старый том `tasker_postgres-data` — что в общей базе уже есть схема (`_prisma_migrations`); непустой `S3_ACCESS_KEY_ID` и `S3_ENDPOINT=https://…` в `.env`; непустой `OIDC_CLIENT_SECRET` в `.env` (см. [«Вход через plwedding ID»](#вход-через-plwedding-id)). Так коммит переключения, запушенный раньше переноса данных, не поднимет приложение на пустой базе или без ключа хранилища.

## Прод-стек

`deploy/tasker/compose.yml`, проект `tasker`:

| Сервис | Образ | Лимит памяти | Назначение |
|--------|-------|--------------|------------|
| `migrate` | `ghcr.io/leha-creator/tracker-migrate:<tag>` | 384m | Разово применяет миграции; `app` стартует только после успеха |
| `app` | `ghcr.io/leha-creator/tracker:<tag>` | 512m | Next.js, `NODE_OPTIONS=--max-old-space-size=384` |

Портов на хост стек не публикует. `app` подключён к внешней сети `edge` с алиасом `tasker-app`. Логи docker ротируются: 3 файла по 10 MB на контейнер.

Своего Postgres в стеке нет: `migrate` и `app` подключены к внешней сети `db` и ходят в общий PostgreSQL 18 из infra (`postgres:5432`, роль и база `tasker`, `DATABASE_URL` собирается в `compose.yml` из `TASKER_DB_PASSWORD`). У роли `CONNECTION LIMIT 20`: пул `pg` приложения (до 10 соединений) и `migrate` в него укладываются. Расширения (`pg_trgm`) ставит infra, миграции делают только `CREATE EXTENSION IF NOT EXISTS`.

### Файлы — Yandex Object Storage

Вложения, файлы документов и фото профилей лежат в бакете `tasker-attachments` (приватный, без версионирования; незавершённые multipart-загрузки lifecycle удаляет через день). Бакет, сервисный аккаунт, CORS и lifecycle создаёт infra ([`infra/storage/tasker-attachments.md`](https://github.com/leha-creator/infra/blob/main/storage/tasker-attachments.md)).

Браузер загружает и скачивает файлы напрямую с `storage.yandexcloud.net` по presigned-ссылкам, через `tracker.caddy` они не проходят. Сервер и браузер ходят по одному адресу: `S3_ENDPOINT` и `S3_PUBLIC_ENDPOINT` — `https://storage.yandexcloud.net`, `S3_REGION=ru-central1`, path-style. Загрузка из браузера кросс-доменная: CORS бакета разрешает только `https://tracker.plwedding.ru`. У presigned GET нет `X-Frame-Options` и CSP, поэтому PDF показывается во `<iframe>`. Срок политики presigned POST (10 минут) Yandex проверяет в начале запроса — долгая загрузка большого файла не обрывается.

Ключ — статический ключ сервисного аккаунта `tasker-attachments` (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` в `/opt/tasker/.env`). Его создаёт и записывает на сервер `deploy/rotate-storage-key.sh` с рабочей машины (нужны `yc` с профилем `aandreev` и ключ `~/.ssh/tasker_deploy`); секрет не печатается и не попадает в аргументы команд. Повторный запуск — ротация:

```bash
sh deploy/rotate-storage-key.sh       # новый ключ → /opt/tasker/.env (копия .env.bak-<дата>)
$C up -d --wait app                   # на сервере: приложение с новым ключом
# проверить загрузку и скачивание файла, затем удалить старый ключ командой из вывода скрипта:
yc iam access-key delete <id>
```

## CD

Джобы `publish` и `deploy` в `.github/workflows/ci.yml`:

| Джоб | Когда | Что делает |
|------|-------|------------|
| `publish` | push в `main` после `check`, `migrations`, `docker` | Собирает `runner` и `migrate` из кеша `docker` и пушит в GHCR с тегами `sha-<7>` и `main` |
| `deploy` | после `publish` или Run workflow с `tag` | SSH под `deploy` → копирует `compose.yml`, `backup.sh`, `reminders.sh`, `cleanup.sh`, `release.env`, `tracker.caddy` → `backup.sh db` → `docker login` (временный `GITHUB_TOKEN`) → `pull` → `up -d --wait app` → `docker logout` → `caddy validate` + `reload` → smoke `https://tracker.plwedding.ru/api/health` → удаление старых образов `tracker` и `tracker-migrate` (остаётся текущий тег) и предупреждение, если `/` занят на 85% и больше |

Деплои идут по очереди (`concurrency: deploy-production`), новый пуш в `main` не прерывает идущий деплой. Если миграция упала, `app` не пересоздаётся и продолжает работать предыдущая версия: в логе джоба будет ошибка `migrate`, а копия БД до миграции лежит в `/opt/tasker/backups/db/`.

`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` передаётся в сборку как BuildKit-секрет. Ключ один на все релизы, поэтому вкладки, открытые до деплоя, не получают `Failed to find Server Action`.

### Настройки GitHub

| Имя | Где | Значение |
|-----|-----|----------|
| `DEPLOY_HOST` | variable, environment `production` | `95.163.229.132` |
| `DEPLOY_USER` | variable, environment `production` | `deploy` |
| `DEPLOY_DOMAIN` | variable, environment `production` | `tracker.plwedding.ru` |
| `DEPLOY_SSH_KEY` | secret, environment `production` | приватный ключ `~/.ssh/tasker_deploy` (комментарий `tasker-ci`) |
| `DEPLOY_KNOWN_HOSTS` | secret, environment `production` | `ssh-keyscan -t ed25519 95.163.229.132`, отпечаток `SHA256:piIGaB26Hj6jkU0XXDkyx5UGBQeZMZt8V3Oezrpiufk` |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | secret репозитория | `openssl rand -base64 32`; смена ключа сбрасывает открытые вкладки |

Environment `production` разрешён только для ветки `main`.

### Откат

```bash
gh workflow run CI --ref main -f tag=sha-xxxxxxx
```

Деплой берёт уже опубликованный образ без сборки и проверок. Миграции вниз не откатываются: если новая версия поменяла схему, восстановите БД из копии (см. ниже) или выпустите исправление.

## Частые действия

```bash
ssh deploy@95.163.229.132          # ключ ~/.ssh/tasker_deploy
cd /opt/tasker
C="docker compose --env-file .env --env-file release.env"

$C ps -a                           # состояние
$C logs -f --tail=100 app          # логи приложения (JSON pino)
$C up -d app                       # применить изменения .env (например, SMTP)
docker stats --no-stream           # память
```

`LOG_LEVEL` меняется в `/opt/tasker/.env`, затем `$C up -d app`.

### Место на диске

Корневой диск сервера — 19 ГБ, его делят все проекты. Файлы Tasker на нём не лежат (они в Object Storage), но когда место кончается, останавливаются общий Postgres и остальные сервисы. Больше всего места занимают Docker-образы прошлых релизов: деплой Tasker удаляет свои, а образы других проектов (meet, maxim) копятся, пока их не удалит их собственный CI.

```bash
df -h /                                       # свободное место
docker system df                              # образы, тома, кеш
docker image prune -af --filter "until=1h"    # удалить образы без контейнеров (откат скачает тег из GHCR заново)
```

## Резервные копии

| Что | Кто и когда | Где | Хранится |
|-----|-------------|-----|----------|
| Дамп общей базы | infra, ежедневно 04:30 UTC (`infra-backup-dump`), вывоз в Object Storage и еженедельная проверка восстановления | `/opt/backups/dumps/tasker/` | 7 последних |
| Копия БД перед миграциями | CI, шаг `Backup database` (`backup.sh db`) | `/opt/tasker/backups/db/tasker-<UTC>.dump` | 7 последних |

`backup.sh db` снимает дамп временным клиентом `postgres:18.6-alpine` в сети `db` под ролью `tasker`; пароль берётся из `/opt/tasker/.env` и передаётся через окружение. Без пароля, сети `db` или соединения скрипт завершается ошибкой, и деплой не запускает миграции. Пустую базу (первый деплой на новом сервере) он пропускает. Вручную: `sh /opt/tasker/backup.sh db`.

Копии в `/opt/tasker/backups/db` лежат на том же диске: они защищают от неудачных миграций, но не от потери сервера; за пределы сервера уходят дампы infra. **Файлы не бэкапятся:** бакет без версионирования, удалённое приложением не восстановить. Решение (версионирование бакета или вывоз restic) — за infra, см. «Что остаётся на tasker» в [`infra/docs/storage-handoff.md`](https://github.com/leha-creator/infra/blob/main/docs/storage-handoff.md).

Восстановление БД (поверх текущих данных; на время восстановления остановить `app`):

```bash
$C stop app
PGPASSWORD="$(sed -n 's/^TASKER_DB_PASSWORD=//p' /opt/tasker/.env)" \
  docker run --rm --network db -e PGPASSWORD -v /opt/tasker/backups/db:/backups:ro postgres:18.6-alpine \
  sh -c 'pg_restore -l "/backups/$0" | grep -v " EXTENSION " > /tmp/restore.list &&
    pg_restore -h postgres -U tasker -d tasker --no-owner --role=tasker --clean --if-exists \
      --exit-on-error -L /tmp/restore.list "/backups/$0"' \
  tasker-<UTC>.dump
$C up -d --wait app
```

Записи `EXTENSION` исключены списком (`-L`): `pg_trgm` принадлежит infra, и `DROP`/`COMMENT ON EXTENSION` от имени `tasker` падают с `must be owner of extension`. Ежедневный дамп infra восстанавливается так же — с `-v /opt/backups/dumps/tasker:/backups:ro`.

## Переезд на общий Postgres

Разовый переезд со своего `tasker-postgres-1` (PG 17, том `tasker_postgres-data`) в общий PostgreSQL 18 из infra. Источник — [`infra/docs/postgres-handoff.md`](https://github.com/leha-creator/infra/blob/main/docs/postgres-handoff.md). Простой — 10–15 минут. `pg_restore` 18 читает дампы 17.

**До окна.** Коммит с новым `compose.yml` запушен, `publish` прошёл, а `deploy` остановился на шаге `Preflight` с `TASKER_DB_PASSWORD is not set` — так и задумано: на сервере ещё ничего не менялось, работает прежняя версия. Запомнить тег релиза `sha-xxxxxxx` (в выводе `publish`).

**Окно** (под `deploy` на сервере, `C` — как в «Частых действиях»):

```bash
# 1. Общая база пуста → 0
docker exec postgres-postgres-1 psql -U postgres -d tasker -tAc \
  "select count(*) from information_schema.tables where table_schema='public'"
# 2. Счётчики старой базы — для сверки в шаге 7
docker exec tasker-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  "select (select count(*) from \"User\"), (select count(*) from \"Task\"), (select count(*) from \"TaskComment\")"'
# 3. Остановить приложение и снять свежий дамп. backup.sh на сервере ещё прежний
#    (Preflight остановил деплой до загрузки файлов) — он дампит старый контейнер.
$C stop app
sh /opt/tasker/backup.sh db
# 4. Восстановить в общий Postgres от имени роли tasker, без записей EXTENSION
dump=$(ls -1t /opt/tasker/backups/db/tasker-*.dump | head -1)
docker cp "$dump" postgres-postgres-1:/tmp/move.dump
docker exec postgres-postgres-1 sh -c '
  pg_restore -l /tmp/move.dump | grep -v " EXTENSION " > /tmp/move.list &&
  pg_restore -U postgres -d tasker --no-owner --role=tasker --exit-on-error -L /tmp/move.list /tmp/move.dump'
docker exec postgres-postgres-1 rm -f /tmp/move.dump /tmp/move.list
# 5. Перенести пароль роли (значение не выводится)
pw="$(sed -n 's/^TASKER_DB_PASSWORD=//p' /opt/postgres/.env)"
grep -q '^TASKER_DB_PASSWORD=' /opt/tasker/.env \
  && sed -i "s|^TASKER_DB_PASSWORD=.*|TASKER_DB_PASSWORD=$pw|" /opt/tasker/.env \
  || echo "TASKER_DB_PASSWORD=$pw" >> /opt/tasker/.env
unset pw
```

6. С рабочей машины — деплой того же тега: `gh workflow run CI --ref main -f tag=sha-xxxxxxx`. Ожидается: `Preflight` — `shared database: ok`, `backup.sh db` дампит уже общую базу, `migrate` — «No pending migrations», `app` healthy, smoke 200. Старый `tasker-postgres-1` удаляется (`--remove-orphans`), том `tasker_postgres-data` остаётся.
7. Проверки: `https://tracker.plwedding.ru/api/health` — `status: ok`, `checks.db.ok: true`; вход, список задач, поиск (`pg_trgm`), создание задачи и комментария; счётчики из шага 2 совпадают:

   ```bash
   docker exec postgres-postgres-1 psql -U postgres -d tasker -tAc \
     "select (select count(*) from \"User\"), (select count(*) from \"Task\"), (select count(*) from \"TaskComment\")"
   ```

8. Выключить прежний таймер дампа (теперь его делает infra) — под root: `systemctl disable --now tasker-backup-db.timer && rm /etc/systemd/system/tasker-backup-db.timer && systemctl daemon-reload` или повторный запуск `bootstrap-app-server.sh` из свежего `deploy/`.
9. Владельцу infra: в `/opt/backups/.env` переключить источник `tasker` в `BACKUP_SOURCES` на `/opt/backups/dumps/tasker` и прогнать `infra-backup-restore-check` (ожидается `pg_restore source=tasker tables=<n>`). См. «После переезда — в infra» в handoff.

**Откат** (пока жив том `tasker_postgres-data`, неделю): `git revert` коммита переключения и пуш — деплой вернёт свой `postgres` на старом томе. `Preflight` при этом не мешает: `TASKER_DB_PASSWORD` задан, схема в общей базе есть. Данные, записанные после переезда, переносятся дампом в обратную сторону. Деплой старого тега через `workflow_dispatch` не откатывает: он берёт `compose.yml` из текущего `main`.

**Через неделю** после зелёной проверки восстановления: `docker volume rm tasker_postgres-data`, из `/opt/tasker/.env` убрать `POSTGRES_*`, `docker rmi postgres:17-alpine`.

## Переезд файлов в Object Storage

Разовый переезд вложений из своего MinIO (том `tasker_minio-data`) в бакет `tasker-attachments`. Источник — [`infra/docs/storage-handoff.md`](https://github.com/leha-creator/infra/blob/main/docs/storage-handoff.md). Пути объектов не меняются, поэтому записи в БД не трогаются. Простой — время финальной синхронизации (минуты).

**До окна.** Коммит переключения (`compose.yml` без MinIO) запушен, `publish` прошёл, `deploy` остановился на `Preflight` с `S3_ACCESS_KEY_ID is not set` — ожидаемо. На сервере уже есть `/opt/tasker/files-sync.sh` (его копирует предыдущий релиз). Запомнить тег `sha-xxxxxxx`.

1. С рабочей машины: `sh deploy/rotate-storage-key.sh` — ключ в `/opt/tasker/.env`. Пока работает старый `compose.yml`, приложение эти ключи не читает.
2. На сервере дописать в `/opt/tasker/.env` остальные `S3_*` из `deploy/tasker/.env.example` (`S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE`; `S3_BUCKET` уже `tasker-attachments`). `MINIO_*` не удалять — они нужны `files-sync.sh` и откату.
3. Предварительная копия без простоя (может идти долго, повторять можно):

   ```bash
   sh /opt/tasker/files-sync.sh sync
   sh /opt/tasker/files-sync.sh check     # check: ok (N matching files)
   ```

**Окно:**

4. `$C stop app`, затем финальные `files-sync.sh sync` и `check` — 0 расхождений.
5. С рабочей машины — деплой того же тега: `gh workflow run CI --ref main -f tag=sha-xxxxxxx`. Ожидается: `Preflight` — `object storage: ok`, `minio` и `minio-init` удаляются (`--remove-orphans`), `app` healthy, `caddy validate`/`reload` зелёные, smoke 200. Том `tasker_minio-data` остаётся.
6. Проверки на `https://tracker.plwedding.ru`: `/api/health` — `checks.storage.ok: true`; загрузка вложения с прогрессом, скачивание, превью картинки, PDF во `<iframe>`, удаление вложения; файл документа и квота пространства; фото профиля; загрузка через MCP (presigned POST и `curl`).
7. Под root выключить таймер копий MinIO: повторный запуск `bootstrap-app-server.sh` из свежего `deploy/` или `systemctl disable --now tasker-backup-files.timer` и удаление `tasker-backup-files.timer` и `tasker-backup@.service` из `/etc/systemd/system`.

**Откат** (пока жив том `tasker_minio-data`, неделю): `git revert` коммита переключения и пуш — деплой вернёт `minio` на старом томе (`MINIO_*` в `.env` остались). Затем докопировать файлы, загруженные после переезда: `sh /opt/tasker/files-sync.sh sync --reverse` и `check --reverse`. Удаления в обратную сторону не повторяются.

**Через неделю:** `docker volume rm tasker_minio-data`, из `.env` убрать `MINIO_*`, удалить `/opt/tasker/backups/files` и `files-sync.sh` (и из репозитория), `docker rmi` образов `pgsty/minio` и `pgsty/mc`.

## Напоминания о сроке

`tasker-reminders.timer` раз в день в 09:00 по Москве (пояс указан в `OnCalendar`, от пояса сервера не зависит; `Persistent=true` — пропущенный запуск выполнится после загрузки) запускает `/opt/tasker/reminders.sh` под `deploy`. Скрипт вызывает `POST /api/cron/reminders` изнутри контейнера `tasker-app-1`. `CRON_SECRET` берётся из окружения контейнера и в командную строку не попадает (её видно в `ps`).

| Напоминание | Кому | Когда |
|-------------|------|-------|
| «Завтра срок задачи» | Ответственному | Срок — завтра по `REMINDERS_TIMEZONE` |
| «Срок задачи прошёл» | Ответственному и наблюдателям | Срок раньше сегодняшнего; один раз на каждое значение срока |

Пропускаются задачи в архиве и в архивных пространствах, без ответственного и выполненные (во всех проектах статус «Готово»). Каналы (в приложении, письмом) пользователь настраивает в профиле. Повторный запуск в тот же день ничего не шлёт: отправленные напоминания отмечены в `TaskDueReminder`.

Вручную и проверка:

```bash
sh /opt/tasker/reminders.sh            # 200 {"result":{"dueSoon":…,"overdue":…,"skipped":…,"failedBatches":0}}
journalctl -u tasker-reminders         # журнал запусков
systemctl list-timers 'tasker-*'       # расписание
```

`404` — в `/opt/tasker/.env` нет `CRON_SECRET`. `failedBatches > 0` — часть задач не обработана из-за ошибки БД (подробности в логах приложения, `[reminders] batch failed`); следующий запуск их догонит.

**Сервер, настроенный до появления напоминаний.** `bootstrap-app-server.sh` генерирует `CRON_SECRET` только для нового `.env`, а CI не ставит таймеры. Один раз под root:

```bash
echo "CRON_SECRET=$(openssl rand -hex 32)" >> /opt/tasker/.env
sudo -u deploy sh -c 'cd /opt/tasker && docker compose --env-file .env --env-file release.env up -d --wait app'
# с копией каталога deploy/ на сервере — или просто повторный запуск bootstrap-app-server.sh:
install -m 644 /tmp/tasker-deploy/tasker/systemd/tasker-reminders.* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tasker-reminders.timer
```

## Очистка журнала

`tasker-cleanup.timer` раз в день в 04:30 по Москве запускает `/opt/tasker/cleanup.sh` под `deploy`. Скрипт вызывает `POST /api/cron/cleanup` изнутри контейнера: удаляются события журнала действий старше `AUDIT_RETENTION_DAYS` (по умолчанию 180 дней) и истёкшие счётчики лимитов. Секрет — тот же `CRON_SECRET`.

```bash
sh /opt/tasker/cleanup.sh              # 200 {"result":{"auditDeleted":…,"auditCutoff":"…","rateLimitDeleted":…}}
journalctl -u tasker-cleanup           # журнал запусков
```

**Сервер, настроенный до появления очистки.** CI копирует `cleanup.sh`, но таймеры не ставит. Один раз под root (или повторный запуск `bootstrap-app-server.sh`):

```bash
install -m 644 /tmp/tasker-deploy/tasker/systemd/tasker-cleanup.* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tasker-cleanup.timer
```

## Вход через plwedding ID

Вход в Tasker — только через IdP «plwedding ID» (`https://auth.plwedding.ru`, репозиторий [`leha-creator/auth`](https://github.com/leha-creator/auth)). Регистрация, подтверждение email, пароли и 2FA — там; письма о них отправляет IdP. Без секрета клиента приложение не стартует (`OIDC_CLIENT_SECRET` обязателен в `deploy/tasker/compose.yml`), а `Preflight` деплоя останавливается с ошибкой `OIDC_CLIENT_SECRET is not set`.

Настройка (один раз, затем — при смене домена или ротации секрета):

1. **Клиент `tasker` в IdP.** В env IdP (`/opt/auth/.env`, см. `docs/configuration.md` в `leha-creator/auth`; в шаблоне origin уже заполнен) задать `OIDC_TASKER_ORIGIN=https://<DOMAIN>` (сейчас `https://tracker.plwedding.ru`) и `OIDC_TASKER_CLIENT_SECRET` — новый секрет не короче 32 символов (`openssl rand -base64 32`). Перезапустить IdP. Клиент разрешает:
   - callback `https://<DOMAIN>/api/auth/callback/plwedding`;
   - возврат после выхода `https://<DOMAIN>/login`.
2. **Tasker.** В `/opt/tasker/.env`:

   ```
   OIDC_ISSUER=https://auth.plwedding.ru
   OIDC_CLIENT_SECRET='<тот же секрет>'
   ```

   `OIDC_ISSUER` — origin IdP без пути (по умолчанию в `compose.yml` — `https://auth.plwedding.ru`), `OIDC_CLIENT_ID` — `tasker` по умолчанию. Затем `$C up -d app`.
3. **Проверка.** Открыть `https://<DOMAIN>/login` → «Войти через plwedding ID» → войти в IdP → вернуться в Tasker. «Выйти» в меню пользователя выходит и из IdP и возвращает на `/login`.

Если IdP недоступен, Tasker работает, но `/login` показывает «Вход через plwedding ID временно недоступен»: приложение повторяет discovery (`<OIDC_ISSUER>/.well-known/openid-configuration`) каждые 30 секунд и подключает вход без перезапуска. Уже вошедшие пользователи продолжают работать. В логах — `WARN` `[oidc.discovery]` о недоступности и `[oidc.discovery] ready`, когда IdP ответил.

**Существующие пользователи.** Учётная запись Tasker, созданная до IdP, связывается с IdP при первом входе по совпадению email, если email подтверждён и в IdP, и в Tasker. Иначе вход отклоняется с `account_not_linked`; тогда администратор проверяет адрес и ставит `User.emailVerified = true` в БД. Миграция `drop_local_auth` удаляет пароли (`credential`-аккаунты), 2FA и загруженные фото: пароль и фото пользователь заводит в IdP. `ADMIN_EMAILS` даёт роль `admin` при первом входе нового пользователя.

Back-channel logout пока не реализован: блокировка пользователя в IdP не завершает уже открытую сессию Tasker — при необходимости заблокируйте его и в админке Tasker.

## Почта

Письма Tasker — это приглашения в пространства, уведомления и тестовое письмо из админки. Письма регистрации, подтверждения email и сброса пароля отправляет IdP. Без настроенного SMTP Tasker работает: приглашение всё равно создаётся, письмо не уходит (в логах `[invitation] email failed`), а владелец получает ссылку и передаёт её вручную. Сбои фоновой отправки — в логах `[mail.background] send failed`.

Почта домена — у reg.ru (ящик `no-reply@plwedding.ru`). DNS уже настроен через reg.ru: MX `mxs1.reg.ru` / `mxs2.reg.ru`, SPF (`include:_spf.hosting.reg.ru`), DKIM (селектор `dkim`), DMARC `p=none`. A-запись `plwedding.ru` не трогать.

Настройки в `/opt/tasker/.env` (логин — полный адрес ящика, пароль — от ящика):

```
SMTP_HOST=mail.hosting.reg.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@plwedding.ru
SMTP_PASSWORD='<пароль ящика>'
MAIL_FROM="Tasker <no-reply@plwedding.ru>"
```

Пароль — в одинарных кавычках, чтобы `$`, `#` и пробелы не ломали файл. Затем `$C up -d app`, отправить тестовое приглашение и проверить в заголовках письма `spf=pass`, `dkim=pass`, `dmarc=pass`.

### Таймауты SMTP из контейнера (MTU)

У внешнего интерфейса сервера MTU 1450 (облако OpenStack), у сетей Docker — 1500. Без MSS clamping удалённый сервер шлёт контейнеру слишком большие TCP-сегменты, и TLS-рукопожатие зависает. Симптом: первое подключение к SMTP после паузы падает с `Connection timeout` (в UI — «Письмо отправить не удалось»), следующие проходят. С самого сервера (`openssl s_client`) всё работает, потому что его MSS уже правильный.

Лечится правилом `iptables -t mangle ... -j TCPMSS --clamp-mss-to-pmtu` для трафика контейнеров. Его ставит подготовка хоста из infra (`host/bootstrap-server.sh`) как юнит `docker-mss-clamp.service`, подробнее — раздел «MSS clamping» в [`infra/host/README.md`](https://github.com/leha-creator/infra/blob/main/host/README.md). Проверка: `iptables -t mangle -S FORWARD | grep TCPMSS`.

## Новый сервер

Сначала bootstrap infra, потом bootstrap Tasker: скрипт Tasker общие edge-прокси и Postgres не создаёт и без них останавливается.

1. Подготовка хоста из [`leha-creator/infra`](https://github.com/leha-creator/infra): Docker с плагином compose, пользователь `deploy` в группе `docker`, ufw (22/80/443), swap, `/opt/edge` и `sites/`, сети `edge` и `db`, MSS clamping, проверки sshd — `host/bootstrap-server.sh` (см. [`infra/host/README.md`](https://github.com/leha-creator/infra/blob/main/host/README.md)). Затем запустить edge-прокси по [`infra/edge/README.md`](https://github.com/leha-creator/infra/blob/main/edge/README.md) и общий Postgres — `postgres/install.sh` (роль и база `tasker` с `pg_trgm`, пароль в `/opt/postgres/.env`, см. [`infra/postgres/README.md`](https://github.com/leha-creator/infra/blob/main/postgres/README.md)).
2. Подготовка под Tasker (повторный запуск безопасен, существующий `.env` не меняется):

   ```bash
   scp -r deploy root@<host>:/tmp/tasker-deploy
   ssh root@<host> "TASKER_DEPLOY_PUBKEY='$(cat ~/.ssh/tasker_deploy.pub)' ADMIN_EMAILS='<email>' \
     sh /tmp/tasker-deploy/bootstrap-app-server.sh"
   ```

   Скрипт проверяет пользователя `deploy`, Docker, сети `edge` и `db` и `/opt/edge/sites` и при их отсутствии останавливается с `fail: …` до любых изменений. Затем создаёт `/opt/tasker`, добавляет ключ деплоя, генерирует секреты в `/opt/tasker/.env` (включая `CRON_SECRET`), подставляет `TASKER_DB_PASSWORD` из `/opt/postgres/.env` и ставит таймеры напоминаний и очистки. В `/opt/edge` и `/opt/postgres` он ничего не пишет.
3. С рабочей машины записать ключ хранилища: `APP_HOST=deploy@<host> sh deploy/rotate-storage-key.sh` (бакет и сервисный аккаунт к серверу не привязаны).
4. Задать `OIDC_CLIENT_SECRET` (и при другом IdP — `OIDC_ISSUER`) в `/opt/tasker/.env` по разделу [«Вход через plwedding ID»](#вход-через-plwedding-id): bootstrap его не генерирует, он общий с IdP.
5. Обновить `DEPLOY_HOST` и `DEPLOY_KNOWN_HOSTS` в GitHub и запустить workflow. На пустой общей базе `backup.sh db` пропускает копию, `migrate` создаёт схему с нуля.

Перенос данных: `backup.sh db` на старом сервере, дамп — на новый, восстановление командой из «Резервных копий». Файлы переносить не нужно — они в Object Storage.

## GitHub App

Проще всего создать приложение из админки: войти администратором на https://tracker.plwedding.ru, открыть **Админка → Интеграции** и нажать **Создать GitHub App на GitHub** — адреса, права и вебхук GitHub заполнит из манифеста, ключи сохранятся в БД, перезапуск не нужен (подробно — [Интеграция с GitHub](github.md#из-админки-рекомендуется)). Ключи шифруются ключом из `BETTER_AUTH_SECRET`: при его смене приложение нужно создать заново.

Другой способ — шесть переменных `GITHUB_*` в `/opt/tasker/.env`; они важнее записи из админки. Пустые значения означают «не задано».

Адреса приложения для `tracker.plwedding.ru` (при ручном создании):

| Поле GitHub App | Значение |
|-----------------|----------|
| Homepage URL | `https://tracker.plwedding.ru` |
| Callback URL | `https://tracker.plwedding.ru/api/auth/callback/github` |
| Setup URL (Redirect on update) | `https://tracker.plwedding.ru/api/integrations/github/setup` |
| Webhook URL | `https://tracker.plwedding.ru/api/webhooks/github` |

```
GITHUB_APP_ID=123456
GITHUB_APP_SLUG=tasker-plwedding
GITHUB_APP_PRIVATE_KEY='-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n'
GITHUB_APP_CLIENT_ID=Iv23li...
GITHUB_APP_CLIENT_SECRET='<client secret>'
GITHUB_WEBHOOK_SECRET='<openssl rand -hex 32>'
```

Ключ — одной строкой с `\n`, в одинарных кавычках. Затем `$C up -d app`. Проверка: в настройках GitHub App → **Advanced → Recent Deliveries** повторить доставку `ping` или любого события — ответ `200` (`ignored` для `ping`), в логах `[github.webhook] received`. Ответ `401` значит, что секрет не совпадает; `404` — переменные не дошли до контейнера (`$C exec app printenv GITHUB_APP_ID`).

Edge-прокси пропускает `/api/webhooks/github` как обычный запрос приложения, отдельной настройки Caddy не нужно.

## Связка с meet

Созвоны из задач и конспекты встреч (см. [Связка с meet](meet.md)). Секреты общие для двух приложений: сгенерировать два значения (`openssl rand -base64 32`, не выводить в общий лог) и записать в оба файла.

`/opt/tasker/.env`:

```
MEET_URL=https://meet.plwedding.ru
MEET_CONTEXT_SECRET='<секрет 1>'
MEET_WEBHOOK_SECRET='<секрет 2>'
```

`/opt/meet/.env`: `TASKER_URL=https://tracker.plwedding.ru`, `TASKER_CONTEXT_SECRET` — секрет 1, `TASKER_WEBHOOK_SECRET` — секрет 2.

Порядок включения: сначала tasker (`$C up -d app` — начинает принимать вебхуки), затем meet. Проверка:

- в логах tasker при первом обращении к связке — `[meet] integration state` с `enabled: true` (секреты не логируются); `404` на вебхук значит, что переменные не дошли до контейнера (`$C exec app printenv MEET_URL`);
- запрос без подписи — ожидается `401`:

  ```bash
  curl -si -X POST https://tracker.plwedding.ru/api/integrations/meet/webhook -d '{}' | head -1
  ```

- в задаче появился раздел «Созвоны»; «Начать созвон» открывает meet, после входа встреча видна в задаче как «Идёт».

Ротация — новые секреты в обоих файлах в одно окно: перезапустить meet, затем tasker. Пока секреты расходятся, старт созвона и вебхуки отвечают ошибкой подписи; meet повторяет вебхуки до 24 часов. Edge-прокси отдельной настройки не требует.

## MCP-сервер для агентов

Claude Code подключается к `https://tracker.plwedding.ru/api/mcp` с личным токеном из **Профиль → Токены доступа** (см. [Claude Code и MCP](agents.md)). Отдельной настройки сервера не нужно:

- сервер работает без сессий и отвечает JSON, без SSE, поэтому длинные соединения и таймауты Caddy его не касаются;
- заголовок `Authorization` проходит до приложения, а в access-логе Caddy вырезается (`request>headers>Authorization delete` в сниппете `access_log` edge-прокси);
- переменные окружения не нужны, ссылки на задачи строятся от `BETTER_AUTH_URL`.

Проверка без токена — ожидается `401` с `WWW-Authenticate: Bearer`:

```bash
curl -si -X POST https://tracker.plwedding.ru/api/mcp -H 'content-type: application/json' -d '{}' | head -5
```

## Реалтайм через Caddy

Доска и списки обновляются по потоку событий `GET /api/realtime/w/<slug>` (SSE, см. [архитектуру](architecture.md#обновления-в-реальном-времени)). Поток нельзя сжимать и буферизовать: `encode` в Caddy копит ответ, и события приходят пачками или не приходят совсем. Поэтому в `tracker.caddy` для него отдельный `handle` **перед** общим:

```caddy
@realtime path /api/realtime/*
handle @realtime {
	reverse_proxy tasker-app:3000 {
		flush_interval -1
	}
}
```

Без `encode`, `flush_interval -1` отдаёт каждый кадр сразу. Пинг каждые 25 секунд держит соединение живым, таймауты Caddy по умолчанию его не рвут. Файл сайта приходит с деплоем, на сервере ничего менять не нужно.

Проверка (с cookie сессии из браузера) — ожидаются `200`, `content-type: text/event-stream` и строка `retry: 5000`:

```bash
curl -sN https://tracker.plwedding.ru/api/realtime/w/<slug> -H 'cookie: __Secure-better-auth.session_token=…' | head -3
```

Без сессии — `401`. Если приложение запущено в нескольких экземплярах, отдельный брокер не нужен: события идут через `LISTEN/NOTIFY` общего Postgres, каждый экземпляр держит одно подключение.

## Безопасность

- Снаружи открыты только 22, 80 и 443. Postgres наружу не публикуется. Бакет приватный (анонимный доступ закрыт, в ACL — только сервисный аккаунт `tasker-attachments`), файлы отдаются по presigned-ссылкам только после проверки доступа в приложении. Общий Postgres доступен только из сети `db` (internal); роль `tasker` подключается только к своей базе (`pg_hba.conf` infra).
- Ответы содержат `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`; заголовок `Server` убран. Куки сессии в production — `__Secure-`.
- Пользователь `deploy` в группе `docker` фактически равен root. Ключ `tasker_deploy` используется только для Tasker и отзывается независимо от ключа maxim (удалить строку `tasker-ci` из `/home/deploy/.ssh/authorized_keys`).
- Вход — только через IdP plwedding ID: кто может зарегистрироваться, требования к паролю и 2FA задаёт IdP. В Tasker попадают только пользователи с подтверждённым в IdP email. Роль admin получают только адреса из `ADMIN_EMAILS` при первом входе.
- Действия пользователей и администраторов пишутся в журнал (`/admin/activity`), срок хранения — `AUDIT_RETENTION_DAYS`. Вход «от имени пользователя» длится час, помечается в журнале и не даёт менять сессии, токены и привязку GitHub.
- Начало входа, привязка GitHub и колбэки OAuth (`/api/auth/*`) ограничены лимитами в БД (таблица `RateLimit`; лимиты Server Actions — `ActionRateLimit`), IP клиента — из `X-Forwarded-For`, который выставляет edge-Caddy. Администратору стоит включить 2FA в своей учётной записи plwedding ID.
- Токены доступа агентов (`/api/mcp`) действуют в одном пространстве с правами владельца и не дают админских прав. В БД хранится только их SHA-256. Отзыв действует сразу.

## See Also

- [Docker-образ и CI](deployment.md): образы, `compose.app.yml`, джобы проверок
- [Конфигурация](configuration.md): переменные приложения
- [Интеграция с GitHub](github.md): создание GitHub App и что делает интеграция
- [Claude Code и MCP](agents.md): токены доступа и подключение агентов
- [`infra/edge/README.md`](https://github.com/leha-creator/infra/blob/main/edge/README.md): edge-прокси, контракты и подключение проектов
- [`infra/host/README.md`](https://github.com/leha-creator/infra/blob/main/host/README.md): подготовка хоста
- [`infra/postgres/README.md`](https://github.com/leha-creator/infra/blob/main/postgres/README.md): общий PostgreSQL 18, роли, базы и подключение приложений
- [`infra/storage/tasker-attachments.md`](https://github.com/leha-creator/infra/blob/main/storage/tasker-attachments.md): бакет файлов Tasker, CORS и lifecycle
