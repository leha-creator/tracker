# План реализации: Docker-образ и CI

Branch: feature/docker-ci (worktree `../tasker-feature-docker-ci`)
Created: 2026-10-15

## Settings
- Testing: smoke  # без Vitest-тестов: в CI собирается образ, поднимается контейнер, `/api/health` отвечает 200
- Logging: verbose
- Docs: yes  # обязательный docs checkpoint в /aif-implement через /aif-docs

## Roadmap Linkage
Milestone: "Готовность к продакшену"
Rationale: План покрывает часть этапа — Docker-образ и CI. E2E-тесты и аудит безопасности остаются, этап после плана не закрывается.

## Рамки этапа

**Входит:**
- `output: 'standalone'` в `next.config.ts`, `.dockerignore`.
- `Dockerfile` (multi-stage): `deps` → `builder` → `runner` (минимальный runtime на standalone) и отдельный target `migrate` (Prisma CLI + `prisma/migrations`, `prisma migrate deploy`).
- `compose.app.yml` — оверлей поверх `compose.yml`: сервисы `migrate` и `app` из Dockerfile; скрипты `app:up` / `app:down`.
- GitHub Actions `.github/workflows/ci.yml`: `pnpm check` + `pnpm build`; проверка миграций на чистом Postgres в `services`; сборка образа и smoke-проверка `/api/health`. Образ никуда не публикуется.
- Документация по сборке и запуску образа.

**Не входит:**
- E2E-тесты, аудит безопасности, публикация образа в registry, деплой.
- Изменения доменного кода.

## Ограничения параллельной работы

План выполняется в worktree параллельно с планом «Проекты и статусы» в `main`. Чтобы при слиянии не было конфликтов:
- **Не трогать:** `prisma/schema.prisma`, `prisma/migrations/`, `src/shared/access/`, `src/shared/auth/`, `src/modules/`, `src/app/`, `src/components/`, `compose.yml`.
- **Разрешено менять:** `next.config.ts` (только `output`), `package.json` (только секция `scripts`), новые файлы (`Dockerfile`, `.dockerignore`, `compose.app.yml`, `.github/`), `docs/`, `README.md`, `AGENTS.md`, `.env.example` (только комментарии/новые необязательные ключи в конце файла).
- Новые зависимости не добавлять: `pnpm-lock.yaml` не должен меняться.
- Перед слиянием: `git rebase main` после Commit 3 плана «Проекты и статусы»; CI-джоб миграций проверит и новую миграцию `add_projects_and_statuses`.
- В worktree перед работой: `pnpm install` (свои `node_modules`), `.env` скопировать из основного каталога при необходимости.

## Ключевые решения

- **Standalone-сборка.** `output: 'standalone'` даёт `.next/standalone/server.js` с минимальным `node_modules`. `public/` и `.next/static` копируются в образ вручную (см. `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`). `serverExternalPackages` (`pino`, `pino-pretty`) трассируются в standalone — проверить их наличие в `.next/standalone/node_modules`. На Windows standalone может падать на симлинках — проверять сборку внутри Docker, а не на хосте.
- **Базовый образ** — `node:22-alpine` с точной версией тега (например `node:22.x.y-alpine3.zz`, актуальную взять на hub.docker.com). Prisma 7 с `prisma-client` + `@prisma/adapter-pg` не требует нативного query engine, alpine подходит. Если `pnpm build` или запуск упадут на musl — переключиться на `node:22-bookworm-slim` и зафиксировать причину в комментарии Dockerfile.
  - *При реализации:* взят `node:24.22.0-alpine3.24` — мажор совпадает с `.nvmrc` (24) и CI (`node-version-file: .nvmrc`); на musl сборка и запуск проходят.
- **pnpm через corepack**: `corepack enable` в базовом стейдже, версия — из `packageManager` в `package.json`. `pnpm install --frozen-lockfile` с `--mount=type=cache,id=pnpm,target=/pnpm/store`. Копировать `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (там `allowBuilds` для Prisma) и `prisma/` + `prisma.config.ts` до install — `postinstall` запускает `prisma generate`. `HUSKY=0` в окружении стейджа, чтобы `prepare` не трогал git.
- **Переменные окружения — только runtime.** `getEnv()` ленивый, `next build` не требует `.env`. В образ секреты не попадают; `ENV` в Dockerfile — только `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0`, `NEXT_TELEMETRY_DISABLED=1`.
- **Миграции — отдельный target `migrate`.** Наследуется от `deps` (там есть dev-зависимости: `prisma`, `dotenv` для `prisma.config.ts`), содержит `prisma/` и `prisma.config.ts`, команда `pnpm exec prisma migrate deploy`. Запускается разово перед `app`; runtime-образ не содержит Prisma CLI и не мигрирует сам (нет гонок при нескольких репликах).
- **Runtime-образ**: непривилегированный пользователь (`node` из базового образа или `nextjs:1001`), только standalone + static + public, `HEALTHCHECK` через `wget -qO- http://127.0.0.1:3000/api/health` (busybox есть в alpine), `CMD ["node", "server.js"]`. Логи — JSON pino в stdout (pretty только при `NODE_ENV=development`, уже так в `src/shared/logger/logger.ts`).
- **`compose.app.yml` — оверлей**, `compose.yml` не меняется: `docker compose -f compose.yml -f compose.app.yml up`. Внутри сети: `DATABASE_URL=postgresql://…@postgres:5432/…`, `S3_ENDPOINT=http://minio:9000`, `SMTP_HOST=mailpit`. Значения через `${VAR:-default}` с локальными дефолтами из `.env.example`.
- **Проверка миграций в CI**: `prisma migrate deploy` на чистой БД, затем `prisma migrate diff` между применённой БД и `schema.prisma` с `--exit-code` — ловит забытую миграцию. Точные флаги Prisma 7 сверить с `pnpm exec prisma migrate diff --help` (в v7 источники задаются через `--from-config-datasource` / `--to-schema`).
- **Кеши CI**: pnpm store (`actions/setup-node` с `cache: pnpm`), `.next/cache` (`actions/cache`, ключ по `pnpm-lock.yaml` + хешу исходников, см. `node_modules/next/dist/docs/01-app/02-guides/ci-build-caching.md`), слои Docker — `cache-from/to: type=gha`.

## Commit Plan
- **Commit 1** (после задач 1–3): `build(docker): add standalone output, Dockerfile and compose.app.yml`
- **Commit 2** (после задач 4–5): `ci: add GitHub Actions workflow with checks, migrations and docker smoke test`

## Tasks

### Phase 1: Образ

- [x] Task 1: Standalone-сборка и `.dockerignore`
  - `next.config.ts`: добавить `output: 'standalone'` с комментарием (Docker-образ, см. Dockerfile). Остальные поля не трогать.
  - `.dockerignore`: `node_modules`, `.next`, `.git`, `.github`, `.env*` (кроме `.env.example`), `src/generated`, `coverage`, `*.log`, `.ai-factory`, `.claude`, `docs`, `*.tsbuildinfo`, `next-env.d.ts`, `.idea`, `.playwright-mcp`.
  - Проверка: `pnpm build` в worktree проходит; `pnpm check` зелёный. Если на Windows standalone падает на симлинках — зафиксировать в отчёте, финальная проверка в Docker (Task 2).
  - Логирование: без изменений кода; при старте `server.js` должен появиться лог инициализации (`[db] prisma client created` при первом запросе к `/api/health`).
  - Files: `next.config.ts`, `.dockerignore`.

- [x] Task 2: Multi-stage `Dockerfile` (depends on 1)
  - Стейджи: `base` (`node:22.x.y-alpine3.zz`, `corepack enable`, `WORKDIR /app`, `HUSKY=0`, `NEXT_TELEMETRY_DISABLED=1`) → `deps` (копирование манифестов + `prisma/` + `prisma.config.ts`, `pnpm install --frozen-lockfile` с cache mount) → `builder` (копирование исходников, `pnpm build`) → `runner` (чистый `base` без pnpm-кеша: `.next/standalone`, `.next/static`, `public`, `USER` непривилегированный, `EXPOSE 3000`, `HEALTHCHECK`, `CMD ["node", "server.js"]`).
  - Target `migrate`: `FROM deps`, `COPY prisma prisma.config.ts`, `CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]`.
  - Комментарии в Dockerfile на русском: зачем каждый стейдж, почему миграции отдельно, почему нет секретов в `ENV`.
  - Проверка: `docker build --target runner -t tasker:local .` и `docker build --target migrate -t tasker-migrate:local .`; размер runner-образа указать в отчёте (ориентир < 300 MB); в `runner` нет `pnpm-lock.yaml`, `src/`, `.env`; процесс работает не от root (`docker run --rm tasker:local id`).
  - Логирование: `LOG_LEVEL` пробрасывается через env (`info` по умолчанию в production); в Dockerfile ничего не логируется.
  - Files: `Dockerfile`.

- [x] Task 3: `compose.app.yml` и скрипты запуска (depends on 2)
  - `compose.app.yml` (оверлей): `migrate` (`build.target: migrate`, `depends_on: postgres: service_healthy`, `restart: 'no'`), `app` (`build.target: runner`, `depends_on: migrate: service_completed_successfully`, `minio-init: service_completed_successfully`, `mailpit: service_healthy`; порт `${APP_PORT:-3000}:3000`; env с внутренними хостами; `healthcheck` как в Dockerfile).
  - `package.json` → `scripts`: `"app:up": "docker compose -f compose.yml -f compose.app.yml up -d --build --wait app"`, `"app:down": "docker compose -f compose.yml -f compose.app.yml down"`. Других изменений в `package.json` нет.
  - `.env.example`: в конец файла — закомментированный `# APP_PORT=3000` с пояснением.
  - Проверка (в отдельном compose-проекте, чтобы не трогать dev-инфраструктуру `tasker` из `main`): с env `POSTGRES_PORT=5434 MINIO_API_PORT=9100 MINIO_CONSOLE_PORT=9101 MAILPIT_SMTP_PORT=1026 MAILPIT_UI_PORT=8026 APP_PORT=3001` выполнить `docker compose -p tasker-ci -f compose.yml -f compose.app.yml up -d --build --wait app` — миграции применяются, `curl http://localhost:3001/api/health` → 200 `{"status":"ok"}`; регистрация и вход работают через UI; `docker compose -p tasker-ci ... logs app` — JSON-логи pino без секретов. Уборка — только `docker compose -p tasker-ci -f compose.yml -f compose.app.yml down -v` (не `pnpm infra:down` / `app:down`).
  - Логирование: `migrate` пишет вывод Prisma в stdout; `app` — JSON pino уровня `info`.
  - Files: `compose.app.yml`, `package.json`, `.env.example`.

<!-- Commit checkpoint: tasks 1-3 -->

### Phase 2: CI

- [x] Task 4: GitHub Actions workflow (depends on 3)
  - `.github/workflows/ci.yml`: триггеры `push` в `main` и `pull_request`; `concurrency` по ref с `cancel-in-progress: true`; `permissions: contents: read`; actions — на мажорных тегах (`actions/checkout@v5`, `actions/setup-node@v5`, `actions/cache@v4`, `docker/setup-buildx-action@v3`, `docker/build-push-action@v6` — сверить актуальные мажоры).
  - Джоб `check`: checkout → `corepack enable` → `setup-node` (`node-version-file` или `22`, `cache: pnpm`) → `pnpm install --frozen-lockfile` → кеш `.next/cache` → `pnpm check` → `pnpm build` (без `.env`; если сборке нужны переменные — это баг ленивого env, разбираться, а не подставлять значения).
  - Джоб `migrations`: `services.postgres` (`postgres:17-alpine`, healthcheck `pg_isready`), `DATABASE_URL` на `localhost:5432` → install → `pnpm db:deploy` → `prisma migrate diff … --exit-code` (флаги — см. «Ключевые решения»).
  - Джоб `docker` (`needs: check`): buildx, сборка `runner` и `migrate` с `load: true` и `cache-from/to: type=gha`; smoke: `docker compose -f compose.yml -f compose.app.yml up -d --wait app` (с `pull_policy`/тегами из собранных образов или `--build` с тем же gha-кешем), `curl -fsS http://localhost:3000/api/health`; `if: failure()` — `docker compose … logs`; `if: always()` — `down -v`.
  - Проверка: workflow валиден (`actionlint`, если доступен; иначе через пуш ветки и PR — пушить только с подтверждения пользователя); все три джоба зелёные.
  - Логирование: шаги с понятными `name`; при падении smoke — дамп логов `app` и `migrate`; секреты в логах не печатать.
  - Files: `.github/workflows/ci.yml`.

- [x] Task 5: Smoke-скрипт проверки health (depends on 4)
  - `scripts/smoke-health.sh` (POSIX sh): ждёт `GET $APP_URL/api/health` до таймаута (по умолчанию 60 с, шаг 2 с), выходит 0 при 200 и `"status":"ok"`, иначе печатает последний ответ и выходит 1. Используется в джобе `docker` и для ручной проверки после `pnpm app:up`.
  - Подключить в `ci.yml` вместо голого `curl`.
  - Проверка: локально после `pnpm app:up` → exit 0; при остановленном MinIO (`docker compose stop minio`) → exit 1 с ответом `degraded`.
  - Логирование: строки `[smoke] waiting for <url> (attempt N)`, `[smoke] ok`, `[smoke] failed: <status> <body>` в stdout.
  - Files: `scripts/smoke-health.sh`, `.github/workflows/ci.yml`, `.prettierignore` (если prettier проверяет `.sh` — не должен).

<!-- Commit checkpoint: tasks 4-5 -->

## Риски и что проверить

- **Cache Components при сборке без env.** Если какая-то страница вне `<Suspense>` обращается к `getEnv()`/БД на этапе пререндера, `pnpm build` в CI упадёт. Это ошибка в коде страницы — зафиксировать и сообщить, но не чинить в этой ветке, если она в `src/app` (зона плана «Проекты и статусы»).
- **pino-pretty в standalone.** Импорт статический (`src/shared/logger/logger.ts`), поэтому пакет должен попасть в трассировку; проверить запуск `server.js` в контейнере.
- **`prisma.config.ts` и `dotenv/config`.** В target `migrate` `.env` нет — `dotenv` тихо ничего не загрузит, `DATABASE_URL` приходит из окружения контейнера.
- **Конфликт с `main`.** Изменения в `package.json` (scripts) и `AGENTS.md`/`docs/` могут пересечься с docs checkpoint плана «Проекты и статусы» — решается при rebase.
- **Push и PR** — только с явного подтверждения пользователя.
