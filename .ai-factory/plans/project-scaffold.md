# План реализации: Каркас проекта

Branch: none (main; `git.create_branches: false`)
Created: 2026-10-15

## Settings
- Testing: yes (Vitest)
- Logging: verbose
- Docs: yes  # обязательный docs checkpoint в /aif-implement через /aif-docs

## Roadmap Linkage
Milestone: "Каркас проекта"
Rationale: План реализует первый этап дорожной карты: Next.js + TypeScript, Tailwind + shadcn/ui, Prisma + PostgreSQL, docker-compose (Postgres, MinIO), логгер, единый формат ошибок, линтеры.

## Контекст и ограничения

- Кода приложения нет. В репозитории уже лежат `.ai-factory/`, `.claude/`, `.idea/`, `.mcp.json`, `AGENTS.md`, `skills-lock.json`, `.ai-factory.json`, `.gitignore`. Их нельзя удалять или перезаписывать.
- `create-next-app` не запускается в непустой директории. Генерируем во временную папку (например, `../tasker-scaffold-tmp`), переносим файлы в корень и сливаем `.gitignore` вручную.
- Пакетный менеджер: **pnpm**. Глобально он не установлен: включить через `corepack enable` и зафиксировать в `package.json` поле `packageManager`. Локально Node v24, Docker 29, Compose v5.
- Структура папок строго по `.ai-factory/ARCHITECTURE.md`: `src/app`, `src/modules`, `src/components`, `src/shared/{db,auth,access,errors,storage,logger,types}`. Добавляется только `src/shared/env`, для валидации переменных окружения.
- Соглашения из `.ai-factory/rules/base.md`: файлы в `kebab-case`, без `console.log` в production-коде, не логировать секреты.
- Доменных моделей Prisma в этом этапе нет. Схема Better Auth и сущности пространств появятся на следующих этапах. `src/shared/auth` и `src/shared/access` пока не создаём, только `.gitkeep` при необходимости.
- Shell-команды не объединять через `&&` (правило из `AGENTS.md`).
- Версии зависимостей берём последние стабильные на момент реализации и фиксируем точно (без `^`) либо через lockfile. Если вышла мажорная версия с изменённым API (например, Prisma с обязательным `prisma.config.ts` и driver adapter), следуем её официальной документации и отмечаем это в коммите.

## Commit Plan
- **Commit 1** (после задач 1–3): `chore: scaffold next.js app with tailwind, shadcn/ui and linters`
- **Commit 2** (после задач 4–6): `feat(shared): add env validation, structured logger and unified error format`
- **Commit 3** (после задач 7–9): `chore: add docker-compose, prisma and health check endpoint`
- **Commit 4** (после задач 10–11): `test: add vitest setup and shared module tests` + `docs: update AGENTS.md project structure`

## Tasks

### Phase 1: Основа приложения

- [ ] Task 1: Инициализация Next.js + TypeScript на pnpm
  - `corepack enable`, затем `pnpm create next-app` во временную директорию с опциями: TypeScript, App Router, `src/`, Tailwind, ESLint, alias `@/*`, без Turbopack-специфичных настроек сверх дефолта. Перенести результат в корень репозитория без перезаписи существующих файлов.
  - `package.json`: `name: "tasker"`, `private: true`, `packageManager: "pnpm@<версия>"`, `engines.node: ">=22"`. Скрипты: `dev`, `build`, `start`.
  - `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, alias `@/*` → `./src/*`.
  - Добавить `.nvmrc` (24), `.editorconfig` (utf-8, lf, 2 пробела).
  - Дополнить `.gitignore`: `node_modules`, `.next`, `.env*` кроме `.env.example`, `coverage`, `*.log`, `src/generated` (если Prisma генерирует клиент туда). Сохранить существующие строки `.idea/` и `.claude/settings.local.json`.
  - Создать скелет папок из `ARCHITECTURE.md` с `.gitkeep`: `src/modules/`, `src/components/`, `src/shared/{db,errors,logger,storage,types,env}`.
  - Логирование: в этой задаче логгера ещё нет, ничего не логируем. Шаблонный `console.*` из create-next-app удалить.
  - Проверка: `pnpm dev` открывает стартовую страницу, `pnpm build` проходит.
  - Files: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.nvmrc`, `.editorconfig`, `src/app/layout.tsx`, `src/app/page.tsx`.

- [ ] Task 2: Tailwind CSS + shadcn/ui (depends on 1)
  - Проверить, что Tailwind (v4, `@tailwindcss/postcss`) подключён через `src/app/globals.css`.
  - `pnpm dlx shadcn@latest init`: стиль по умолчанию, базовый цвет neutral, CSS variables, aliases `@/components`, `@/components/ui`, `@/lib/utils`. Утилиту `cn` положить в `src/lib/utils.ts` (так ожидает shadcn CLI).
  - Добавить базовые компоненты: `button`, `card`, `input`, `label`, `sonner` (тосты для ошибок Server Actions на будущих этапах).
  - `src/app/layout.tsx`: шрифты через `next/font`, `lang="ru"`, `<Toaster />`, metadata `title: "Tasker"`.
  - `src/app/page.tsx`: минимальная стартовая страница на `Card` + `Button` для визуальной проверки стилей. Шаблонный контент create-next-app удалить.
  - Логирование: не требуется (только UI). Проверить, что в консоли браузера нет ошибок гидратации.
  - Files: `components.json`, `src/app/globals.css`, `src/lib/utils.ts`, `src/components/ui/*`, `src/app/layout.tsx`, `src/app/page.tsx`, `postcss.config.mjs`.

- [ ] Task 3: Линтеры и форматирование (depends on 1, 2)
  - ESLint flat config (`eslint.config.mjs`): `next/core-web-vitals`, `next/typescript`, `typescript-eslint` (recommended-type-checked для `src/`), `eslint-config-prettier`. Запуск через `eslint` CLI, без `next lint`.
  - Правила архитектурных границ через `no-restricted-imports` / `no-restricted-syntax`:
    - в `src/app/**` и `src/components/**` запрещены импорты `@prisma/client`, `@/generated/prisma*`, `@/shared/db`, `**/*.repository`;
    - снаружи модуля запрещены глубокие импорты `@/modules/*/slices/**` и `@/modules/*/models/**` (только `@/modules/<name>`);
    - в `src/modules/*/models/**` запрещены `@prisma/client`, `@/shared/db`, `next/*`, `react`;
    - `no-console: error` везде, кроме конфигов и скриптов.
  - Сгенерированные shadcn-компоненты (`src/components/ui/**`) и сгенерированный Prisma-клиент исключить из строгих правил или из линта.
  - Prettier (`.prettierrc`, `.prettierignore`) с `prettier-plugin-tailwindcss`. singleQuote, trailingComma all, printWidth 100.
  - `husky` + `lint-staged`: pre-commit запускает `eslint --fix` и `prettier --write` на staged-файлах.
  - Скрипты: `lint`, `lint:fix`, `format`, `format:check`, `typecheck` (`tsc --noEmit`).
  - Логирование: не требуется (только конфигурация).
  - Проверка: `pnpm lint`, `pnpm typecheck` и `pnpm format:check` проходят. Тестовый импорт `@/shared/db` в `src/app/page.tsx` даёт ошибку линта (проверить и откатить).
  - Files: `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.husky/pre-commit`, `package.json`.

<!-- Commit checkpoint: tasks 1-3 -->

### Phase 2: Сквозная инфраструктура (`src/shared`)

- [ ] Task 4: Валидация переменных окружения (depends on 1)
  - `src/shared/env/env.ts`: Zod-схема серверных переменных: `NODE_ENV`, `LOG_LEVEL` (`trace|debug|info|warn|error|fatal|silent`, по умолчанию `debug` в development и `info` в production), `DATABASE_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`. Парсинг ленивый (через функцию/геттер), чтобы `next build` не падал без `.env`.
  - При невалидном окружении бросать ошибку со списком невалидных ключей, без значений.
  - `import 'server-only'` в модуле env.
  - `src/shared/env/index.ts`: публичный экспорт `env`.
  - `.env.example`: все ключи со значениями для локального docker-compose. Пароли-заглушки помечены комментарием «только для локальной разработки».
  - Логирование: логгер ещё не создан, и он сам зависит от env. Ошибку валидации выводим только через throw (сообщение содержит имена ключей, без значений секретов).
  - Files: `src/shared/env/env.ts`, `src/shared/env/index.ts`, `.env.example`.

- [ ] Task 5: Структурированный логгер на pino (depends on 4)
  - `pnpm add pino`, `pnpm add -D pino-pretty`.
  - `src/shared/logger/logger.ts`:
    - корневой логгер `pino` с уровнем из `env.LOG_LEVEL`;
    - в development — `pino-pretty` транспорт, в production — JSON в stdout;
    - `redact` для путей `password`, `*.password`, `token`, `*.token`, `secret`, `*.secret`, `authorization`, `headers.authorization`, `headers.cookie`, `*.accessKeyId`, `*.secretAccessKey`;
    - `base: { app: 'tasker' }`, ISO-время, сериализатор ошибок `pino.stdSerializers.err`.
  - `createLogger(scope: string, bindings?)` возвращает child-логгер с полем `scope`. Формат сообщений в коде: `log.debug({ ...data }, '[Scope.method] message')`.
  - `next.config.ts`: `serverExternalPackages: ['pino', 'pino-pretty']`.
  - `import 'server-only'`, чтобы логгер не попал в клиентский бандл.
  - `src/shared/logger/index.ts`: экспорт `logger`, `createLogger`, тип `Logger`.
  - Логирование: при инициализации один раз логировать `INFO [logger] initialized { level, env }`.
  - Files: `src/shared/logger/logger.ts`, `src/shared/logger/index.ts`, `next.config.ts`.

- [ ] Task 6: Единый формат ошибок и `ActionResult` (depends on 5)
  - `src/shared/errors/app-error.ts`: базовый `AppError extends Error` с полями `code` (строковый union `ErrorCode`), `httpStatus`, `details?`, `expose` (можно ли показывать сообщение клиенту), `cause`.
  - Доменные ошибки: `ValidationError` (`VALIDATION_ERROR`, 400, `fieldErrors?: Record<string, string[]>`), `UnauthorizedError` (`UNAUTHORIZED`, 401), `ForbiddenError` (`FORBIDDEN`, 403), `NotFoundError` (`NOT_FOUND`, 404), `ConflictError` (`CONFLICT`, 409). Инфраструктурные: `InternalError` (`INTERNAL_ERROR`, 500, `expose: false`).
  - `src/shared/types/action-result.ts`: `ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError }`, `ActionError = { code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> }`.
  - `src/shared/errors/to-action-error.ts`: `toActionError(error): { ok: false; error: ActionError }`:
    - `ZodError` → `VALIDATION_ERROR` с `fieldErrors` из `error.flatten().fieldErrors`;
    - `AppError` с `expose: true` → его `code` и `message`;
    - всё остальное (включая ошибки Prisma) → `INTERNAL_ERROR` с общим сообщением «Внутренняя ошибка сервера», без стектрейса.
  - `src/shared/errors/to-http-response.ts`: `toErrorResponse(error): Response` для Route Handlers. JSON `{ error: { code, message, fieldErrors? } }` и `httpStatus`.
  - Хелперы `ok(data)` и `fail(...)` для Server Actions.
  - `src/shared/errors/index.ts`: публичный API.
  - Логирование (через `createLogger('errors')`):
    - доменные ошибки (4xx) → `WARN` с `{ code, message }`;
    - неожиданные ошибки (5xx) → `ERROR` с полным `err` (сериализатор pino), чтобы стектрейс был в логах, а не в ответе;
    - `DEBUG` с `fieldErrors` для ошибок валидации.
  - Files: `src/shared/errors/app-error.ts`, `src/shared/errors/to-action-error.ts`, `src/shared/errors/to-http-response.ts`, `src/shared/errors/index.ts`, `src/shared/types/action-result.ts`, `src/shared/types/index.ts`.

<!-- Commit checkpoint: tasks 4-6 -->

### Phase 3: Инфраструктура данных

- [ ] Task 7: docker-compose для Postgres и MinIO (depends on 4)
  - `compose.yml`:
    - `postgres`: образ `postgres:17-alpine`, переменные из `.env` (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`), порт `5432`, volume `postgres-data`, healthcheck `pg_isready`;
    - `minio`: образ `minio/minio` (зафиксированный тег), `server /data --console-address ":9001"`, порты `9000`/`9001`, volume `minio-data`, healthcheck через `mc ready local` или `curl /minio/health/live`;
    - `minio-init`: образ `minio/mc`, `depends_on: minio (service_healthy)`. Создаёт приватный бакет `${S3_BUCKET}` (`mc mb --ignore-existing`, `mc anonymous set none`) и завершается.
  - Сервисы только для разработки. Приложение в контейнер не упаковываем (это этап «Готовность к продакшену»).
  - Дополнить `.env.example` переменными `POSTGRES_*`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`. Значения согласовать с `DATABASE_URL` и `S3_*`.
  - Скрипты в `package.json`: `infra:up` (`docker compose up -d --wait`), `infra:down`, `infra:logs`.
  - Логирование: на уровне приложения не требуется. Healthcheck-и обеспечивают диагностику через `docker compose ps`.
  - Проверка: `pnpm infra:up` поднимает оба сервиса в состоянии healthy, бакет создан, консоль MinIO открывается на `http://localhost:9001`.
  - Files: `compose.yml`, `.env.example`, `package.json`.

- [ ] Task 8: Prisma + PostgreSQL (depends on 5, 7)
  - `pnpm add @prisma/client`, `pnpm add -D prisma`. Если текущая мажорная версия этого требует, добавить `@prisma/adapter-pg` и `prisma.config.ts`.
  - `prisma/schema.prisma`: `datasource db { provider = "postgresql" }`, генератор клиента (при генераторе `prisma-client` — `output = "../src/generated/prisma"`). Доменных моделей нет, только комментарий о том, что модели добавляются на следующих этапах.
  - `src/shared/db/prisma.ts`: singleton `PrismaClient` через `globalThis`, чтобы не плодить подключения при HMR. `import 'server-only'`.
  - Логирование запросов через события Prisma (`log: [{ emit: 'event', level: 'query' }, 'warn', 'error']`):
    - `query` → `DEBUG` `[db.query] { durationMs, query }` (параметры не логировать: в них могут быть персональные данные);
    - медленные запросы (>200 мс) → `WARN`;
    - `warn`/`error` Prisma → соответствующий уровень логгера `createLogger('db')`.
  - `src/shared/db/health.ts`: `checkDatabase(): Promise<{ ok: boolean; latencyMs: number }>` через `SELECT 1`. Ошибки логируются как `ERROR` и возвращают `ok: false`, без throw.
  - `src/shared/db/index.ts`: экспорт `prisma`, `checkDatabase`, тип `TransactionClient`.
  - Скрипты: `db:generate`, `db:migrate` (`prisma migrate dev`), `db:deploy`, `db:studio`, `postinstall: prisma generate`.
  - Files: `prisma/schema.prisma`, `prisma.config.ts` (если нужен), `src/shared/db/prisma.ts`, `src/shared/db/health.ts`, `src/shared/db/index.ts`, `package.json`.

- [ ] Task 9: Клиент S3/MinIO и эндпоинт `/api/health` (depends on 6, 8)
  - `pnpm add @aws-sdk/client-s3`.
  - `src/shared/storage/s3-client.ts`: singleton `S3Client` из `env.S3_*` (`forcePathStyle` для MinIO), `import 'server-only'`.
  - `src/shared/storage/health.ts`: `checkStorage()` через `HeadBucketCommand`, возвращает `{ ok, latencyMs }`.
  - `src/shared/storage/index.ts`: публичный API. Presigned URL и загрузка файлов — в этапе «Вложения», здесь не реализуются.
  - `src/app/api/health/route.ts`: `GET` параллельно вызывает `checkDatabase()` и `checkStorage()`. Ответ `200 { status: 'ok', checks: { db, storage } }` или `503 { status: 'degraded', ... }`. `export const dynamic = 'force-dynamic'`. Непредвиденные ошибки обрабатывает `toErrorResponse`.
  - Логирование:
    - `createLogger('health')`: `DEBUG` на входе, `INFO` с итоговым статусом и латентностями, `WARN` при `degraded`;
    - `createLogger('storage')`: `DEBUG` на вызове `HeadBucket`, `ERROR` при сбое (без ключей доступа).
  - Проверка: при поднятом `infra:up` запрос `GET /api/health` возвращает 200. После `docker compose stop minio` возвращает 503 со `storage.ok: false`.
  - Files: `src/shared/storage/s3-client.ts`, `src/shared/storage/health.ts`, `src/shared/storage/index.ts`, `src/app/api/health/route.ts`.

<!-- Commit checkpoint: tasks 7-9 -->

### Phase 4: Тесты и финализация

- [ ] Task 10: Vitest и тесты сквозных модулей (depends on 4, 5, 6)
  - `pnpm add -D vitest vite-tsconfig-paths`. `vitest.config.ts`: окружение `node`, alias `@/*` через `vite-tsconfig-paths`, мок `server-only` (alias на пустой модуль), `include: ['src/**/*.test.ts']`.
  - Скрипты: `test` (`vitest run`), `test:watch`.
  - Тесты:
    - `src/shared/errors/to-action-error.test.ts`: `ZodError` → `VALIDATION_ERROR` + `fieldErrors`; `NotFoundError` → `NOT_FOUND` с исходным сообщением; произвольный `Error` → `INTERNAL_ERROR` без утечки сообщения и стека; `InternalError` с `expose: false` не раскрывает сообщение;
    - `src/shared/errors/to-http-response.test.ts`: корректные HTTP-статусы и тело ответа;
    - `src/shared/env/env.test.ts`: валидное окружение парсится, невалидное даёт ошибку со списком ключей, без значений секретов;
    - `src/shared/logger/logger.test.ts`: `createLogger` добавляет `scope`; поля `password`/`token`/`authorization` редактируются (проверка через pino с кастомным destination-стримом).
  - Логирование: в тестах уровень `silent` через `LOG_LEVEL`, кроме теста логгера, где вывод перехватывается.
  - Files: `vitest.config.ts`, `src/test/server-only-mock.ts`, `src/shared/**/*.test.ts`, `package.json`.

- [ ] Task 11: Сводный скрипт проверки и обновление AGENTS.md (depends on 1–10)
  - Скрипт `check` в `package.json`: последовательно `typecheck`, `lint`, `format:check`, `test`.
  - Обновить раздел «Структура проекта» в `AGENTS.md`: реальное дерево (`src/app`, `src/modules`, `src/components/ui`, `src/shared/*`, `prisma/`, `compose.yml`) и таблицу ключевых точек входа (`src/shared/logger`, `src/shared/errors`, `src/shared/db`, `src/app/api/health/route.ts`, `compose.yml`). Убрать фразу «Код приложения ещё не создан».
  - Финальный прогон: `pnpm install` на чистом клоне не падает (`postinstall` генерирует Prisma-клиент), `pnpm check` и `pnpm build` зелёные, `pnpm infra:up` → `pnpm dev` → `GET /api/health` возвращает 200.
  - Логирование: проверить, что при `LOG_LEVEL=debug` в `pnpm dev` видны логи `logger`, `db.query` и `health`, а при `LOG_LEVEL=warn` остаются только предупреждения и ошибки.
  - Files: `package.json`, `AGENTS.md`.

<!-- Commit checkpoint: tasks 10-11 -->
