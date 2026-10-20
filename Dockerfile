# syntax=docker/dockerfile:1
#
# Multi-stage образ Tasker.
#
#   docker build --target runner  -t tasker:local .          # приложение (standalone Next.js)
#   docker build --target migrate -t tasker-migrate:local .  # разовое применение миграций Prisma
#
# Секретов в образе нет: DATABASE_URL, BETTER_AUTH_SECRET, S3_* и SMTP_* передаются
# только при запуске контейнера (см. compose.app.yml и docs/deployment.md). Переменные
# окружения читаются лениво (`getEnv()`), поэтому `next build` их не требует.

# Версия Node совпадает с .nvmrc. Alpine подходит: Prisma 7 (`prisma-client` +
# `@prisma/adapter-pg`) не использует нативный query engine.
ARG NODE_IMAGE=node:24.22.0-alpine3.24

# --- base: общий фундамент всех стейджей ------------------------------------------
FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    # `prepare` (husky) не должен трогать git внутри образа.
    HUSKY=0 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# pnpm той версии, что указана в `packageManager` в package.json.
RUN corepack enable

# --- deps: зависимости (вместе с dev — нужны для сборки и Prisma CLI) --------------
FROM base AS deps
# Только манифесты и Prisma: слой с node_modules пересобирается лишь при их изменении.
# pnpm-workspace.yaml содержит `allowBuilds` для Prisma; prisma/ и prisma.config.ts
# нужны `postinstall` → `prisma generate` (клиент генерируется в src/generated/prisma).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# --- builder: production-сборка Next.js -------------------------------------------
FROM deps AS builder
# .dockerignore исключает node_modules, .next, src/generated и .env*,
# поэтому результаты стейджа deps не перезаписываются.
COPY . .
# NEXT_SERVER_ACTIONS_ENCRYPTION_KEY — BuildKit-секрет (в слои и историю образа не попадает):
# один ключ на все релизы, иначе после деплоя открытые вкладки ловят «Failed to find Server Action».
# Без секрета (локальная сборка, PR) Next.js генерирует ключ сам.
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
    --mount=type=secret,id=next_sa_key,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
    pnpm build

# --- migrate: разовое применение миграций -----------------------------------------
# Отдельный target, а не шаг при старте приложения: runtime-образ не содержит Prisma CLI,
# а при нескольких репликах нет гонки за применение миграций. Запускается перед `app`.
# В контейнере нет .env — `dotenv/config` в prisma.config.ts ничего не загрузит,
# DATABASE_URL приходит из окружения контейнера.
#
# Не наследуется от `deps`: там все dev-зависимости (~2 GB), а для `migrate deploy` нужны
# только Prisma CLI и dotenv (его импортирует prisma.config.ts). Ставятся через npm тех же
# точных версий, что в package.json; транзитивные зависимости lockfile не фиксирует —
# CI всё равно прогоняет этот образ на чистом Postgres перед публикацией.
FROM ${NODE_IMAGE} AS migrate
WORKDIR /app
COPY package.json ./app-package.json
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('app-package.json','utf8'));const d={...p.dependencies,...p.devDependencies};fs.writeFileSync('package.json',JSON.stringify({private:true,dependencies:{prisma:d.prisma,dotenv:d.dotenv}}))" \
    && rm app-package.json \
    && npm install --omit=dev --no-audit --no-fund --loglevel=warn \
    && npm cache clean --force
COPY prisma.config.ts ./
COPY prisma ./prisma
USER node
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

# --- runner: минимальный runtime на standalone-сборке -----------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Только результат `output: 'standalone'`: server.js + оттрассированные node_modules.
# Статику `.next/static` server.js раздаёт сам, если положить её рядом.
# public/ (аватар агента, скриншоты справки) тоже раздаёт server.js. Статьи справки
# (content/help) попадают в standalone через outputFileTracingIncludes.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Пользователь `node` (uid 1000) есть в базовом образе.
USER node
EXPOSE 3000
# /api/health отвечает 200 только при доступных БД и хранилище (503 — degraded).
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1
# Логи — JSON pino в stdout, уровень через LOG_LEVEL (по умолчанию info в production).
CMD ["node", "server.js"]
