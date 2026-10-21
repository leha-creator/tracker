[← Дизайн-система](design.md) · [Back to README](../README.md) · [Продакшен →](production.md)

# Docker-образ и CI

Приложение собирается в Docker-образ на базе standalone-сборки Next.js (`output: 'standalone'` в `next.config.ts`). Миграции применяются отдельным одноразовым контейнером. В GitHub Actions на каждый PR и push в `main` запускаются проверки кода, миграции на чистой БД и smoke-тест образа. На push в `main` образы публикуются в GHCR и деплоятся на сервер — см. [Продакшен](production.md).

## Образы

`Dockerfile` (multi-stage, база `node:24.22.0-alpine3.24`):

| Стейдж | Назначение |
|--------|------------|
| `base` | Node.js, `corepack enable` (pnpm из `packageManager`), `HUSKY=0`, `NEXT_TELEMETRY_DISABLED=1` |
| `deps` | `pnpm install --frozen-lockfile` с кешем pnpm-store; `postinstall` генерирует Prisma Client |
| `builder` | Исходники + `pnpm build` (кеш `.next/cache`) |
| `migrate` | target на базе Node-образа: только npm-пакеты `prisma` и `dotenv` (версии из `package.json`), `prisma.config.ts` и `prisma/`; команда `prisma migrate deploy` |
| `runner` | target runtime: только `.next/standalone` и `.next/static`, пользователь `node`, порт 3000, `HEALTHCHECK` по `/api/health` |

```bash
docker build --target runner  -t tasker:local .
docker build --target migrate -t tasker-migrate:local .
```

В runtime-образе нет `src/`, `pnpm-lock.yaml`, `.env` и Prisma CLI. Он занимает около 320 MB на диске (сжатый — около 80 MB), из них около 245 MB приходится на базовый `node:alpine`. Образ `migrate` занимает около 610 MB: около 250 MB — Prisma CLI с зависимостями. Он не наследуется от `deps`, где лежат все dev-зависимости (около 2 GB). Транзитивные зависимости Prisma CLI в нём не зафиксированы lockfile, но CI прогоняет образ на чистом Postgres перед публикацией.

`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` можно передать в сборку BuildKit-секретом `next_sa_key` (`docker build --secret id=next_sa_key,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ...`). В слои и историю образа он не попадает. Без секрета Next.js генерирует ключ сам.

### Переменные окружения

В образе нет секретов. В `ENV` заданы только `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0` и `NEXT_TELEMETRY_DISABLED=1`. Остальные переменные (`DATABASE_URL`, `BETTER_AUTH_*`, `OIDC_*`, `S3_*`, `SMTP_*`, `LOG_LEVEL`) передаются при запуске контейнера, их список есть в [Конфигурации](configuration.md#переменные-приложения). Переменные валидируются лениво, поэтому `next build` работает без них.

Логи пишутся в stdout в формате JSON (pino) с уровнем `info` по умолчанию.

### Почему миграции отдельно

Runtime-образ не мигрирует БД при старте. Так в нём не нужен Prisma CLI, а несколько реплик не начнут применять миграции одновременно. Контейнер `migrate` запускается разово перед обновлением приложения. `DATABASE_URL` он берёт из окружения: `.env` в образ не попадает.

## Запуск всего стека в Docker

`compose.app.yml` — оверлей поверх `compose.yml` с сервисами `migrate` и `app`:

```bash
pnpm app:up     # docker compose -f compose.yml -f compose.app.yml up -d --build --wait app
sh scripts/smoke-health.sh   # ждёт 200 и {"status":"ok"} от http://localhost:3001/api/health
pnpm app:down   # останавливает контейнерный стек (тома сохраняются)
```

Порядок запуска такой: `postgres` (healthy) → `migrate` (успешно завершился) → `app`, причём `app` дополнительно ждёт `minio-init` и `mailpit`. Внутри сети compose приложение обращается к `postgres:5432`, `http://minio:9000` и `mailpit:1025`. Значения `DATABASE_URL`, `S3_ENDPOINT` и `SMTP_HOST` из `.env` указывают на `localhost`, поэтому здесь они не используются. Браузер загружает и скачивает вложения напрямую из MinIO, поэтому ссылки подписываются на `S3_PUBLIC_ENDPOINT` (`http://localhost:9002`).

Контейнерный стек изолирован от dev-инфраструктуры (`pnpm infra:up`):

- `compose.app.yml` задаёт имя проекта `tasker-app` — свои контейнеры и тома, отдельная БД. `migrate` не трогает базу `pnpm dev`, `pnpm app:down` не останавливает dev-инфраструктуру;
- порт Postgres наружу не публикуется (`!reset []`). У MinIO публикуется только API — на `9002` (консоль закрыта), UI Mailpit — на `8026`, приложение — на `3001`. Оба стека и `pnpm dev` (порт 3000) могут работать одновременно.

Удалить стек вместе с данными: `docker compose -f compose.yml -f compose.app.yml down -v`.

### Переменные `compose.app.yml`

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `APP_PORT` | `3001` | Порт приложения на хосте |
| `APP_MAILPIT_UI_PORT` | `8026` | Порт UI Mailpit контейнерного стека на хосте |
| `APP_MINIO_PORT` | `9002` | Порт API MinIO контейнерного стека на хосте: на него браузер загружает и скачивает вложения |
| `APP_S3_PUBLIC_ENDPOINT` | `http://localhost:${APP_MINIO_PORT}` | `S3_PUBLIC_ENDPOINT` контейнера. Поменяйте вместе с портом и добавьте origin приложения в `MINIO_CORS_ALLOW_ORIGIN`, если он отличается от `http://localhost:3001` |
| `APP_URL` | `http://localhost:${APP_PORT}` | Публичный адрес, передаётся в `BETTER_AUTH_URL` |
| `APP_LOG_LEVEL` | `info` | `LOG_LEVEL` контейнера (не берётся из `LOG_LEVEL` в `.env`, где для dev стоит `debug`) |
| `APP_IMAGE` / `MIGRATE_IMAGE` | `tasker:local` / `tasker-migrate:local` | Теги образов |
| `BETTER_AUTH_SECRET`, `ADMIN_EMAILS`, `MAIL_FROM`, `S3_REGION`, `S3_BUCKET` | как в `.env.example` | Берутся из окружения или `.env` |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | `http://localhost:3005`, `tasker`, локальный фиктивный секрет | IdP plwedding ID. Для smoke-теста `/api/health` IdP не нужен; чтобы войти в контейнерный стек, запустите локальный IdP с `OIDC_TASKER_ORIGIN=http://localhost:3001` и тем же секретом |
| `POSTGRES_*`, `MINIO_ROOT_*` | как в `compose.yml` | Из них собираются `DATABASE_URL` и S3-ключи |

Значения по умолчанию подходят только для локального запуска. В окружении с реальными данными задайте `BETTER_AUTH_SECRET`, `OIDC_CLIENT_SECRET`, пароли и ключи явно.

### Несколько реплик

При запуске нескольких экземпляров приложения учитывайте требования Next.js из `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`. Нужен общий `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`: в CI он передаётся секретом при сборке (см. выше). Для защиты от version skew нужен `deploymentId`, он пока не настроен. В продакшене сейчас работает один экземпляр.

## Smoke-скрипт

`scripts/smoke-health.sh` (POSIX sh, нужен `curl`) опрашивает `GET $APP_URL/api/health`, пока не получит 200 со статусом `"ok"`.

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `APP_URL` | `http://localhost:3001` | Адрес приложения |
| `SMOKE_TIMEOUT` | `60` | Общий таймаут, с |
| `SMOKE_INTERVAL` | `2` | Пауза между попытками, с |

При успехе скрипт выходит с кодом 0. Если таймаут истёк, он печатает `[smoke] failed: <status> <body>` (например `503 {"status":"degraded",...}`, когда MinIO недоступен) и выходит с кодом 1.

## CI (GitHub Actions)

`.github/workflows/ci.yml` запускается на `push` в `main`, на `pull_request` и вручную (`workflow_dispatch`, вход `tag` — откат). Для каждой ветки одновременно выполняется один запуск. В PR новый запуск отменяет предыдущий, на `main` запуски идут по очереди, чтобы не прервать деплой. Права по умолчанию — `contents: read`; `packages: write` есть только у `publish`.

| Джоб | Что делает |
|------|------------|
| `check` | `pnpm install --frozen-lockfile` → `pnpm check` → `pnpm build` без `.env`. Кешируются pnpm-store и `.next/cache` |
| `migrations` | Postgres 18 (`postgres:18.6-alpine`) в `services` → `pnpm db:deploy` → `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`. Код 2 значит, что схема разошлась с миграциями (забыли `pnpm db:migrate`) |
| `docker` | После `check`: сборка `runner` и `migrate` через buildx (кеш слоёв `type=gha`), `docker compose config` прод-стека `deploy/tasker/compose.yml` с фиктивными значениями, `docker compose -f compose.yml -f compose.app.yml up -d --wait app`, `scripts/smoke-health.sh`. При падении выводятся логи `migrate`, `app` и `minio-init`, в конце всегда выполняется `down -v` |
| `publish` | Только `main`: пуш образов в GHCR (`ghcr.io/leha-creator/tracker`, `tracker-migrate`) с тегами `sha-<7>` и `main` |
| `deploy` | После `publish` или ручной откат: деплой на сервер по SSH, environment `production` — см. [Продакшен](production.md#cd) |

Проверкам (`check`, `migrations`, `docker`) секреты не нужны: стек в CI работает на локальных значениях по умолчанию. `docker` и `publish` передают в сборку `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`: BuildKit не включает секреты в ключ кеша, поэтому слой `pnpm build` в обоих джобах должен собираться с одним и тем же ключом.

Workflow можно проверить локально через [actionlint](https://github.com/rhysd/actionlint):

```bash
# SC2029: в ssh-командах деплоя переменные намеренно раскрываются на раннере
docker run --rm -e SHELLCHECK_OPTS="-e SC2029" -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7
```

## See Also

- [Продакшен](production.md): сервер, прод-стек, CD, откат, бэкапы, почта
- [Конфигурация](configuration.md): переменные приложения и docker-compose
- [Разработка](development.md): команды `app:*`, `infra:*`, `db:*`
