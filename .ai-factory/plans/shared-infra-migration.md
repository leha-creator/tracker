# План реализации: переход на общую инфраструктуру (Postgres 18 и Object Storage)

Branch: none (`git.create_branches: false`, работа в `main`)
Created: 2026-10-21

## Settings
- Testing: yes. Локальный `compose.yml` и CI-джоб `migrations` переходят на `postgres:18.6-alpine`. Vitest — только если меняется код S3-клиента (задача 6: чистая функция настроек клиента). Остальное проверяется вручную: `sh -n`, shellcheck, прогон скриптов в контейнере, тестовый бакет, проверки на сервере после переключения.
- Logging: standard. Shell-скрипты пишут по строке на шаг через `log()` со своим префиксом (`[backup]`, `[keys]`, `[files-sync]`) в формате `<шаг>: ok|skip|fail (<причина>)`. Секреты, пароли и ключи не выводятся ни в лог, ни в argv. В CI — `::error::` и `::group::`, как в соседних шагах. В TS — `createLogger('storage')`: `info` при создании клиента (без ключей), `debug` для операций, `error` при сбоях.
- Docs: yes. Обязательный docs-чекпоинт после каждого этапа: `docs/production.md`, `docs/configuration.md`, `docs/development.md`, `docs/deployment.md`, `AGENTS.md`.

## Roadmap Linkage
Milestone: "Переход на общую инфраструктуру"
Rationale: План закрывает два оставшихся пункта этапа: «Общий PostgreSQL 18» и «Файлы в Yandex Object Storage».

## Контекст

Сторона infra ([`leha-creator/infra`](https://github.com/leha-creator/infra), `D:\work\infra`):

- **Postgres** ([`docs/postgres-handoff.md`](https://github.com/leha-creator/infra/blob/main/docs/postgres-handoff.md)). Применено на сервер 2026-10-21 00:15–00:20 UTC. Стек `/opt/postgres`, PostgreSQL 18.6, сеть `db` (external, internal), хост `postgres:5432`. Роль и база `tasker`/`tasker`, `pg_trgm` уже установлен. Пароль — `TASKER_DB_PASSWORD` в `/opt/postgres/.env`. У роли `CONNECTION LIMIT 20`, у сервера `max_connections = 40`. Ежедневный дамп — `/opt/backups/dumps/tasker/`. База пока пустая, tasker работает на своём `tasker-postgres-1` (PG 17).
- **Object Storage** ([`docs/storage-handoff.md`](https://github.com/leha-creator/infra/blob/main/docs/storage-handoff.md), [`storage/tasker-attachments.md`](https://github.com/leha-creator/infra/blob/main/storage/tasker-attachments.md)). Бакет `tasker-attachments` (`ru-central1`, path-style, приватный, без версионирования), CORS только для `https://tracker.plwedding.ru` (`GET`, `HEAD`, `POST`, наружу — `ETag`), сервисный аккаунт `tasker-attachments` с ACL `READ` + `WRITE` только на этот бакет. **Бакет описан, но ещё не создан**: в `apply-log.md` записи нет, в `tasker-attachments.md` — «Ещё не создан». Это блокер этапа 2.

Сторона tasker сейчас: `deploy/tasker/compose.yml` поднимает свои `postgres` (17), `minio`, `minio-init`. Приложение берёт `S3_*` из захардкоженных значений и учётки root MinIO. `tracker.caddy` проксирует `/tasker-attachments/*` в `tasker-minio`. `backup.sh` делает дамп через `docker exec tasker-postgres-1` и tar тома MinIO. Таймеры — `tasker-backup-db` и `tasker-backup-files`.

### Принятые решения
- **Порядок:** сначала Postgres (инфраструктура готова), потом файлы (после того как infra создаст бакет). Это два отдельных окна обслуживания и два отдельных коммита переключения.
- **Пуш = деплой.** Коммит переключения нельзя выкатывать до переноса данных: `migrate` накатит схему на пустую общую базу, и приложение поднимется без данных. Поэтому в CI появляются защиты (задачи 3 и 9): деплой останавливается до загрузки файлов, если на сервере не выполнены ручные шаги. Порядок такой: пуш → деплой останавливается на защите (ожидаемо) → окно обслуживания → повторный деплой того же тега через `workflow_dispatch` (`inputs.tag`).
- **Откат = `git revert` коммита переключения + пуш.** `workflow_dispatch` с тегом берёт `compose.yml` из текущего `main`, поэтому старый стек он не вернёт. Тома `tasker_postgres-data` и `tasker_minio-data` неделю не удаляются.
- **Бэкап файлов после переезда — решить позже** (на стороне infra: версионирование бакета или restic). В плане — только отключение таймера `tasker-backup-files` и пункт роадмапа.
- **Локальная разработка остаётся на MinIO**, Postgres локально и в CI — 18, чтобы версии совпадали с продом.
- В `/opt/tasker/.env` ключи хранилища пишет скрипт (секрет не проходит через терминал и чат). Пароль БД переносится командой из `infra/postgres/README.md` на сервере.

### Перед началом
- В рабочем дереве лежит неотслеживаемый `.ai-factory/PLAN.md` (fast-план редизайна). К этому плану он отношения не имеет, его не трогать.
- Действия на сервере (окна обслуживания, `yc`, удаление томов) выполнять только после явного подтверждения владельца. Всё, что выполняется на сервере, — по шагам, с записью результата в отчёт `/aif-implement`.

## Commit Plan
- **Commit 1** (задача 1): `chore(dev): run local and CI Postgres 18`
- **Commit 2** (задачи 2–4): `feat(deploy): move database to shared Postgres 18`. Пушится перед окном 1, деплой ожидаемо останавливается на защите.
- **Commit 3** (задачи 6–8): `feat(storage): Yandex Object Storage key and file sync tooling`. Без переключения, деплой проходит как обычно.
- **Commit 4** (задачи 9–10): `feat(deploy): serve files from Yandex Object Storage, drop MinIO`. Пушится перед окном 2.
- **Commit 5** (задача 12): `chore(deploy): remove migration leftovers after shared infra move`

## Tasks

### Phase 1: Общий PostgreSQL 18

- [x] **Task 1: PG 18 локально и в CI**
  - `compose.yml`: `postgres:17-alpine` → `postgres:18.6-alpine` (тот же тег, что в infra). У образа 18 данные лежат в `/var/lib/postgresql/18/docker`, а том монтируется в `/var/lib/postgresql`. Поэтому том переименовать (`postgres-data` → `postgres18-data`), иначе старый каталог 17 не даст стартовать. Комментарий в файле: старый том `tasker_postgres-data` можно удалить после переноса (см. docs).
  - `.github/workflows/ci.yml`, джоб `migrations`: сервис `postgres:18.6-alpine`. Если где-то ещё используется `postgres:17` (smoke `compose.app.yml`, шаги docker-джоба), заменить так же: `rg -n "postgres:17"`.
  - `docs/development.md` (и `docs/getting-started.md`, если там указана версия): PG 18 и перенос локальных данных — `pg_dump` со старого контейнера до смены образа, `pg_restore` в новый, либо пересоздать базу (`pnpm db:migrate` с нуля).
  - Проверка: `pnpm infra:down`, `pnpm infra:up`, `pnpm prisma migrate deploy` на чистой базе 18, `pnpm check`, `pnpm build` (правило памяти: `pnpm check` не ловит ошибки сборки).
  Логирование: не требуется (конфигурация).

- [x] **Task 2: прод-стек на общем Postgres**
  - `deploy/tasker/compose.yml`:
    - удалить сервис `postgres` и том `postgres-data`; у `migrate` убрать `depends_on: postgres`;
    - `migrate` и `app` подключить к сети `db` (`external: true`, `name: db`). Сеть `tasker` у `app` остаётся до этапа 2, пока есть MinIO;
    - `DATABASE_URL: postgresql://tasker:${TASKER_DB_PASSWORD:?TASKER_DB_PASSWORD is required}@postgres:5432/tasker?schema=public` у `migrate` и `app`;
    - шапка: «PostgreSQL — общий из `leha-creator/infra` (`postgres/`, сеть `db`)».
  - `deploy/tasker/.env.example`: блок `POSTGRES_*` заменить на `TASKER_DB_PASSWORD=` с комментарием «берётся из `/opt/postgres/.env` (infra), команда — в docs/production.md; через чат не передавать». Комментарий про `openssl rand` для паролей Postgres убрать.
  - `deploy/bootstrap-app-server.sh`:
    - проверка `docker network inspect db` → `fail: docker network db does not exist (shared Postgres is not set up: run infra/postgres/install.sh)`. Проверка ставится рядом с проверкой сети `edge`, до любых изменений;
    - не генерировать `POSTGRES_PASSWORD`. Если `/opt/postgres/.env` читается и в нём есть `TASKER_DB_PASSWORD`, подставить его в новый `.env` (тем же `sed`, без вывода). Иначе — строка `.env: TASKER_DB_PASSWORD is empty (copy it from /opt/postgres/.env, see docs/production.md)`;
    - не включать `tasker-backup-db.timer`. Если он активен, выключить: `systemctl disable --now tasker-backup-db.timer` и вывести `backup db timer: disabled (daily dumps are made by infra)`;
    - шапку и список «Что делает» обновить.
  - `deploy/tasker/systemd/tasker-backup-db.timer` удалить (`git rm`). `tasker-backup@.service` остаётся: им пользуется `tasker-backup-files` до этапа 2.
  - `deploy/tasker/backup.sh`, режим `db` — дамп из общего Postgres временным клиентом в сети `db`:
    - пароль — `TASKER_DB_PASSWORD` из `${APP_ENV:-/opt/tasker/.env}` (`sed -n 's/^TASKER_DB_PASSWORD=//p'`), передаётся через `-e PGPASSWORD` (переменная окружения, значение не попадает в argv): `PGPASSWORD="$pw" docker run --rm --network db -e PGPASSWORD postgres:18.6-alpine pg_dump -h postgres -U tasker -d tasker -Fc > "$file.tmp"`;
    - если пароля нет или сети `db` нет — `db fail: ...` и `exit 1`, а не `skip`: CI должен остановиться до миграций. Исключение — первый деплой на новом сервере: в общей базе нет таблиц (`psql -tAc "select count(*) from information_schema.tables where table_schema='public'"` → `0`), тогда `db skip: database is empty`;
    - прежние имена `tasker-<UTC>.dump` в `/opt/tasker/backups/db` и `prune` не менять: это контракт вывоза infra до переключения `BACKUP_SOURCES`;
    - шапку и «Восстановление БД» переписать: `docker run --rm -i --network db -e PGPASSWORD postgres:18.6-alpine pg_restore -h postgres -U tasker -d tasker --no-owner --role=tasker --clean --if-exists < dump`;
    - в режиме `files` образ для tar заменить на `postgres:18.6-alpine` (`postgres:17` после переезда на сервере не останется). Режим целиком удаляется в задаче 9.
  - `rg -n "POSTGRES_|tasker-postgres|postgres:17|backup-db" deploy .github` после правок — только ожидаемые места (переходный runbook в docs).
  Логирование: `[backup] db start|done size=... file=...|skip (<причина>)|fail (<причина>)`, `[bootstrap] db network: ok|fail`, пароль нигде не печатается.
  Зависит от: задачи 1 (тот же образ `postgres:18.6-alpine`).

- [x] **Task 3: защиты деплоя от переключения без данных**
  `.github/workflows/ci.yml`, джоб `deploy`. Все проверки — в шаге `Configure SSH` или в новом шаге `Preflight` до `Upload stack files`. Ничего на сервере не меняют:
  - `ssh target "docker network inspect db > /dev/null"` → `::error::docker network db is missing: apply infra/postgres first (leha-creator/infra)`;
  - `ssh target "grep -q '^TASKER_DB_PASSWORD=..*' ${APP_DIR}/.env"` → `::error::TASKER_DB_PASSWORD is not set in ${APP_DIR}/.env: move data to shared Postgres first (docs/production.md, «Переезд на общий Postgres»)`;
  - защита от пустой базы: если существует том `tasker_postgres-data` (`docker volume inspect`), а в общей базе нет `_prisma_migrations` (запрос временным клиентом `postgres:18.6-alpine` в сети `db`, пароль через `-e PGPASSWORD` из `.env` на сервере), — `::error::shared database is empty while the old tasker_postgres-data volume exists: restore the dump first`. На новом сервере без старого тома проверка пропускается: там `migrate` создаёт схему с нуля;
  - шаг `Backup database`: обновить комментарий («на первом деплое база пустая — пропуск»);
  - шаг `Diagnostics on failure`: логи `migrate app` (+ `minio-init` до этапа 2).
  Проверка: `actionlint`, если есть, иначе внимательно прочитать diff. Удалённая команда должна быть фиксированной строкой: значения в неё не интерполируются, кроме `${APP_DIR}`.
  Логирование: `::error::` с причиной и ссылкой на раздел docs, `::group::preflight` с результатами проверок (без значений из `.env`).
  Зависит от: задачи 2.

- [x] **Task 4: документация этапа 1**
  - `docs/production.md`:
    - схема: `tasker-app ──► сеть db ──► postgres:5432 (общий, infra)`;
    - «Прод-стек»: строку `postgres` убрать, абзац про сеть `db`;
    - «Что CI Tasker ждёт от infra»: сеть `db`, хост `postgres:5432`, роль и база `tasker`, ключ `TASKER_DB_PASSWORD`; ссылка на «Контракты» в `infra/docs/postgres-handoff.md`;
    - «Резервные копии»: ежедневный дамп делает infra (`/opt/backups/dumps/tasker`, вывоз и проверка восстановления), tasker — только копия перед миграциями (`backup.sh db` из CI). Новая команда восстановления. Таймер `tasker-backup-db` убран;
    - новый раздел «Переезд на общий Postgres» — runbook окна 1 (из задачи 5): шаги, команды, критерии, откат, что делает infra после (`BACKUP_SOURCES`);
    - «Новый сервер»: шаг infra `postgres/install.sh`, перенос `TASKER_DB_PASSWORD`;
    - «See Also»: `infra/postgres/README.md`.
  - `docs/configuration.md` (переменные docker-compose прода), `docs/deployment.md` (если описан прод-стек), `AGENTS.md`: строку `deploy/tasker/` (без своего Postgres), версию PostgreSQL в стеке (17 → 18).
  - `.ai-factory/DESCRIPTION.md`: версия PostgreSQL, если указана.
  Логирование: не требуется.
  Зависит от: задач 1–3.

- [ ] **Task 5: окно 1 — переезд базы** (на сервере, только с подтверждения владельца)
  Перед окном: Commit 1 и Commit 2 запушены. CI зелёный до `deploy`, `deploy` остановился на защите `TASKER_DB_PASSWORD` (ожидаемо), образ нового тега опубликован. Желательно, чтобы meet уже переехал (рекомендация infra), но это не обязательно.
  Шаги (`postgres-handoff.md`, «Порядок переезда»):
  1. Общая база пуста: `select count(*) from information_schema.tables where table_schema='public'` → `0`.
  2. `cd /opt/tasker && docker compose --env-file .env --env-file release.env stop app`.
  3. Свежий дамп **старым** `backup.sh` (на сервере ещё прежний: CI его не загрузил) — `sh /opt/tasker/backup.sh db`.
  4. `pg_restore` в общий Postgres без записей `EXTENSION` (`-L`), `--no-owner --role=tasker --exit-on-error`, затем удалить временные файлы в контейнере.
  5. Перенести `TASKER_DB_PASSWORD` командой из `infra/postgres/README.md`, «Подключение приложения».
  6. `workflow_dispatch` с `tag=<sha нового коммита>`. Ожидание: защиты проходят, `backup.sh db` (новый) делает дамп общей базы, `migrate` — «No pending migrations», `app` healthy, smoke 200.
  7. Проверки: `/api/health` (БД ok), вход, список задач, поиск (`pg_trgm`), создание задачи и комментария, `select count(*)` по `Task` и `User` совпадает с данными до переезда (снять в шаге 2 со старой базы).
  8. `tasker-postgres-1` удалён (`--remove-orphans`), том `tasker_postgres-data` остаётся неделю. `systemctl disable --now tasker-backup-db.timer` (или повторный запуск `bootstrap-app-server.sh` из свежего `deploy/`).
  9. Передать владельцу infra: переключить `BACKUP_SOURCES` на `/opt/backups/dumps/tasker` и прогнать `infra-backup-restore-check` (`tables=<n>`).
  Откат до удаления тома: `git revert` Commit 2 + пуш. Данные, записанные после переезда, перенести дампом в обратную сторону.
  Логирование: результаты каждого шага (код возврата, счётчики, время простоя) — в отчёт `/aif-implement`. Пароль не выводится.
  Зависит от: задач 1–4.

### Phase 2: Yandex Object Storage

Блокер: infra создала бакет `tasker-attachments` и сервисный аккаунт (запись в `infra/docs/apply-log.md`). До этого выполняются только задачи 6–8 на тестовом бакете.

- [ ] **Task 6: совместимость S3-клиента с Yandex (тестовый бакет)**
  Владелец создаёт временный бакет `tasker-attachments-test` с CORS для `http://localhost:3000` (и тем же lifecycle) и статический ключ к нему. Ключ — только в локальном `.env`, после задачи бакет и ключ удаляются. Локальный `pnpm dev` с `S3_ENDPOINT=S3_PUBLIC_ENDPOINT=https://storage.yandexcloud.net`, `S3_REGION=ru-central1`, `S3_FORCE_PATH_STYLE=true`.
  Проверить все операции `src/shared/storage/objects.ts` и `health.ts`:
  - `HeadBucket` (`/api/health`) с ключом, у которого только ACL бакета;
  - presigned POST (вложение задачи, файл документа, фото профиля), presigned GET (скачивание, превью картинок, PDF во `<iframe>` — без `X-Frame-Options`), `HeadObject` после загрузки, `GetObject` с `Range` (текст, CSV, JSON), `DeleteObjects` (удаление задачи с вложениями, документа, фото).
  - **Риск:** `@aws-sdk/client-s3` 3.1151 по умолчанию добавляет CRC32-контрольные суммы (`requestChecksumCalculation: WHEN_SUPPORTED`) и для `DeleteObjects` шлёт их вместо `Content-MD5`. Если Yandex отвечает ошибкой (`InvalidRequest`, `MissingContentMD5`, `XAmzContentSHA256Mismatch` и т.п.), в `src/shared/storage/s3-client.ts` вынести настройки клиента в чистую функцию `buildS3ClientConfig(env, endpoint)` с `requestChecksumCalculation: 'WHEN_REQUIRED'` и `responseChecksumValidation: 'WHEN_REQUIRED'` и покрыть её тестом Vitest (`s3-client.test.ts`: поля endpoint, region, forcePathStyle, checksum). Если всё работает без изменений — код не трогать и записать это в отчёт.
  - Браузер: загрузка 50 МБ при throttling DevTools «Slow 4G» укладывается в TTL presigned POST (10 мин), прогресс XHR идёт (preflight проходит), ошибка истёкшей политики показывается понятным сообщением (`use-attachment-upload.ts`, `use-document-upload.ts` разбирают XML-ошибку Yandex так же, как MinIO).
  - Задержки `HeadObject` и `GetObject` из контейнера на сервере уже измерены infra (`check-bucket.sh`). Сравнить их с таймаутами приложения (health — 3000 мс) и при необходимости поднять с комментарием.
  - Комментарии с «MinIO» в `s3-client.ts`, `env.ts`, хуках загрузки обобщить до «S3 (MinIO локально, Yandex Object Storage в проде)».
  Логирование: `info` при создании клиента — endpoint, region, forcePathStyle, режим checksum, без ключей. Ошибки операций — `error` с `bucket`, `key`, кодом S3 (уже так; проверить, что код ошибки Yandex попадает в лог).

- [ ] **Task 7: скрипт ключа `deploy/rotate-storage-key.sh`**
  По образцу `D:\work\meet\deploy\rotate-yc-keys.sh`, только статический ключ:
  - `yc --profile ${YC_PROFILE:-aandreev} iam access-key create --service-account-name tasker-attachments --description "tasker prod app <YYYY-MM-DD>" --format json`, с тем же повтором только при `error dialing endpoint`;
  - разбор JSON (`node -e`, как в meet), секрет — только в переменной, на сервер уходит через stdin `ssh` (`APP_HOST=${APP_HOST:-deploy@95.163.229.132}`, `SSH_KEY=${SSH_KEY:-$HOME/.ssh/tasker_deploy}`): `umask 077`, копия `.env.bak-<дата>` (`600`), слияние ключей `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` через `awk`, атомарный `mv`;
  - предварительная проверка `test -w /opt/tasker/.env` до создания ключа;
  - печатает только ID ключа, первые 7 символов `key_id` и команду удаления старого ключа (`yc iam access-key delete <id>`): её выполняют после пересоздания `app` и проверки загрузки и скачивания;
  - повторный запуск — ротация тем же путём.
  Пока `compose.yml` берёт ключи из `MINIO_ROOT_*` (до задачи 9), запись `S3_*` в `.env` ни на что не влияет. Поэтому скрипт можно запустить до окна, чтобы `files-sync.sh` видел ключ.
  Проверка: `sh -n`, shellcheck, прогон с подставными `yc`/`ssh` (функции в PATH из scratchpad), которые проверяют, что секрет не встречается в argv и выводе.
  Логирование: `[keys] <шаг>: ok|fail (<причина>)`, секрет и полный `key_id` не печатаются.

- [ ] **Task 8: перенос файлов `deploy/tasker/files-sync.sh`**
  Запускается на сервере под `deploy` из `/opt/tasker` (CI копирует его вместе с `backup.sh` до задачи 12):
  - `files-sync.sh sync|check [--reverse]`: `rclone sync`/`rclone check` между MinIO (`http://minio:9000`, сеть `tasker`, учётка `MINIO_ROOT_*`) и Yandex (`https://storage.yandexcloud.net`, `ru-central1`, `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`), бакет `S3_BUCKET` с обеих сторон, пути объектов не меняются. `--reverse` — обратное направление для отката;
  - rclone в контейнере (`rclone/rclone:<точная версия>`), конфиг — через переменные `RCLONE_CONFIG_SRC_*`/`RCLONE_CONFIG_DST_*` во временном `--env-file` (`umask 077`, `mktemp`, удаляется через `trap`), а не в argv;
  - `check` завершается ненулевым кодом при любом расхождении; итог — строка `check: ok (N objects)` или `check: fail (differences=N)`;
  - флаги: `--checksum` не использовать, если ETag multipart-объектов MinIO и Yandex различаются (проверить на тестовом бакете), иначе `--size-only` + сравнение количества;
  - `--dry-run` по умолчанию выключен, `sync` печатает итоговую статистику rclone (`--stats-one-line`).
  - `.github/workflows/ci.yml`: добавить файл в `scp` шага `Upload stack files`.
  Проверка: локально на `compose.yml` (MinIO) → тестовый бакет из задачи 6: `sync`, `check` (0 расхождений), `--reverse` в пустой локальный бакет. Shellcheck.
  Логирование: `[files-sync] <режим> start|done|fail (<причина>)`, ключи и env-файл не выводятся.

- [ ] **Task 9: прод на Object Storage, удаление MinIO**
  - `deploy/tasker/compose.yml`:
    - `app`: `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET` — из `.env` с `:?` (обязательные), `S3_FORCE_PATH_STYLE: ${S3_FORCE_PATH_STYLE:-true}`; убрать `depends_on: minio-init` и сеть `tasker` (остаются `db` и `edge`);
    - удалить `minio`, `minio-init`, том `minio-data`, сеть `tasker` (если больше никем не используется), алиас `tasker-minio`. Том `tasker_minio-data` на сервере не удаляется (compose без `-v` его не трогает);
    - шапка: файлы — Yandex Object Storage (бакет из infra).
  - `deploy/tasker/tracker.caddy`: удалить `@bucket` и его комментарий. Браузер ходит в `storage.yandexcloud.net` напрямую.
  - `deploy/tasker/.env.example`: блок «Хранилище» со значениями из `storage-handoff.md` («Значения для `/opt/tasker`»); ключи — «пишет `deploy/rotate-storage-key.sh`, вручную не заполнять». `MINIO_*` убрать, комментарий `DOMAIN` поправить (больше не адрес ссылок на вложения).
  - `deploy/bootstrap-app-server.sh`: не генерировать `MINIO_ROOT_PASSWORD`; не включать `tasker-backup-files.timer`, активный — выключить (`backup files timer: disabled (files live in Object Storage)`); подсказка про `rotate-storage-key.sh`, если `S3_ACCESS_KEY_ID` пуст.
  - `deploy/tasker/backup.sh`: удалить режим `files` (остаётся только `db`), usage и шапку поправить. `git rm deploy/tasker/systemd/tasker-backup-files.timer`; если таймеров на `tasker-backup@.service` не осталось — удалить и его, а в `bootstrap-app-server.sh` убрать проверку этого файла.
  - `.github/workflows/ci.yml`, джоб `deploy`: защита в `Preflight` — `grep -q '^S3_ACCESS_KEY_ID=..*'` и `'^S3_ENDPOINT=https://'` в `.env`, иначе `::error::Object Storage settings are missing in ${APP_DIR}/.env: run deploy/rotate-storage-key.sh and files-sync (docs/production.md, «Переезд файлов в Object Storage»)`; `Diagnostics` без `minio-init`; комментарий `Prune old images` про `507` MinIO обобщить (диск заполняют образы).
  - `rg -n -i "minio" deploy .github docs/production.md` — только runbook переезда и откат.
  Логирование: `::error::` с причиной в CI, `[bootstrap] ... ok|skip|disabled`, `[backup]` без изменений для `db`.
  Зависит от: задач 6–8; на сервере — от создания бакета infra.

- [ ] **Task 10: документация этапа 2**
  - `docs/production.md`: схема (браузер ⇄ `storage.yandexcloud.net`, без `tasker-minio`); «Прод-стек» без `minio`/`minio-init`; раздел «Вложения через тот же домен» заменить на «Файлы — Yandex Object Storage» (бакет, CORS, presigned POST/GET напрямую, ключ и ротация — `rotate-storage-key.sh`); «Что CI ждёт от infra»: алиас `tasker-minio` убрать, добавить бакет, сервисный аккаунт и CORS-origin (смена домена — через infra); «Резервные копии»: файлы не бэкапятся tasker'ом, решение — за infra (ссылка на `storage-handoff.md`, «Что остаётся на tasker»); новый раздел «Переезд файлов в Object Storage» — runbook окна 2 и откат (`files-sync.sh --reverse` + `git revert`); «Место на диске» — без MinIO; «Новый сервер» — ключ скриптом.
  - `docs/configuration.md`, «Хранилище для вложений и документов»: прод — Yandex (значения), локально — MinIO, CORS бакета задаёт infra.
  - `AGENTS.md`: `deploy/` — `rotate-storage-key.sh`, `files-sync.sh`; стек «Хранилище файлов: S3 API — локально MinIO, в проде Yandex Object Storage»; `.ai-factory/DESCRIPTION.md` — то же.
  Логирование: не требуется.
  Зависит от: задачи 9.

- [ ] **Task 11: окно 2 — переезд файлов** (на сервере, только с подтверждения владельца)
  Перед окном: бакет создан infra, Commit 3 выкачен (на сервере есть `files-sync.sh`), Commit 4 запушен, `deploy` остановился на защите `S3_ACCESS_KEY_ID` (ожидаемо).
  1. `sh deploy/rotate-storage-key.sh` с рабочей машины → ключ в `/opt/tasker/.env`. Дописать в `.env` остальные `S3_*` из `.env.example` (без ключей).
  2. Предварительная копия без простоя: `sh /opt/tasker/files-sync.sh sync`, затем `check`.
  3. Окно: `docker compose ... stop app`, финальные `files-sync.sh sync` и `check` → 0 расхождений.
  4. `workflow_dispatch` с `tag=<sha Commit 4>`: защиты проходят, `minio`/`minio-init` удалены (`--remove-orphans`), `app` healthy, `caddy validate`/`reload` зелёные, smoke 200.
  5. Проверки в браузере на `https://tracker.plwedding.ru`: загрузка вложения с прогрессом, скачивание, превью картинки, PDF во `<iframe>`, удаление вложения (объект исчез из бакета), документ-файл и квота пространства, фото профиля, MCP-загрузка через presigned POST (`curl`). `/api/health` — storage ok.
  6. Удалить старый ключ, если это ротация (команда из вывода скрипта). `systemctl disable --now tasker-backup-files.timer`.
  Откат до удаления тома: `files-sync.sh sync --reverse` (новые файлы — обратно в MinIO), `git revert` Commit 4 + пуш.
  Логирование: результаты шагов, число объектов и расхождений, время простоя — в отчёт `/aif-implement`. Ключи не выводятся.
  Зависит от: задач 6–10.

### Phase 3: Завершение

- [ ] **Task 12: уборка через неделю после окон** (только с подтверждения владельца)
  - Сервер: `docker volume rm tasker_postgres-data` (не раньше чем через 7 дней после окна 1 и после зелёного `infra-backup-restore-check` по общей базе), `docker volume rm tasker_minio-data` (через 7 дней после окна 2). Из `/opt/tasker/.env` убрать `POSTGRES_*` и `MINIO_*`, удалить `.env.bak-*`. Удалить `/opt/tasker/backups/files` и `/opt/tasker/files-sync.sh`. Образы `pgsty/minio`, `pgsty/mc`, `postgres:17-alpine` — `docker rmi`.
  - Репозиторий: `git rm deploy/tasker/files-sync.sh`, убрать его из `scp` в CI; защиту «пустая база при живом старом томе» оставить (на новом сервере она не мешает). Из `docs/production.md` убрать runbook-разделы переездов или сжать их до «История: переезд выполнен <дата>» со ссылками на handoff-документы infra.
  - `.ai-factory/ROADMAP.md`: отметить оба пункта этапа и этап целиком, если в нём ничего не осталось. Добавить в «Эксплуатацию» пункт «Бэкап файлов Object Storage (версионирование или restic — решает infra)», а из пункта «Регулярная проверка восстановления…» убрать «остаются файлы MinIO».
  Логирование: что удалено на сервере и сколько места освободилось (`df -h /` до/после) — в отчёт.
  Зависит от: задач 5 и 11.
