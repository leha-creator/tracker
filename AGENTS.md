# AGENTS.md

> Структурная карта проекта для AI-агентов и новых разработчиков. Обновляйте при существенных изменениях структуры.

## Обзор проекта

Tasker — простой таск-трекер с рабочими пространствами, ролями (admin / владелец пространства / участник), канбан-доской и списком задач; задача может находиться в нескольких проектах со своим статусом в каждом. Подробности — в [`.ai-factory/DESCRIPTION.md`](.ai-factory/DESCRIPTION.md).

## Технологический стек

- **Язык программирования:** TypeScript (strict)
- **Фреймворк:** Next.js 16 (App Router, Cache Components)
- **База данных:** PostgreSQL 17
- **ORM:** Prisma 7 (генератор `prisma-client`, driver adapter `@prisma/adapter-pg`)
- **Аутентификация:** Better Auth (плагины `organization`, `admin`) — следующий этап
- **UI:** Tailwind CSS v4 + shadcn/ui (radix)
- **Хранилище файлов:** S3 API, локально MinIO (`pgsty/minio`)
- **Инфраструктура кода:** pino (логи), Zod (валидация), Vitest, ESLint + Prettier, husky + lint-staged
- **Пакетный менеджер:** pnpm (через corepack)

## Структура проекта

```
tasker/
├── .ai-factory/              # Контекст AI Factory (описание, архитектура, правила, планы)
├── .claude/                  # Скиллы и субагенты
├── prisma/
│   └── schema.prisma         # Схема БД (доменные модели — на следующих этапах)
├── prisma.config.ts          # Подключение Prisma CLI (DATABASE_URL, миграции)
├── src/
│   ├── app/                  # Представление (Next.js): страницы, layout, route handlers
│   │   └── api/health/       # GET /api/health — состояние БД и хранилища
│   ├── modules/              # Доменные модули (workspaces, projects, tasks, ...) — пока пусто
│   ├── components/
│   │   └── ui/               # shadcn/ui (генерируется CLI, вручную не править)
│   ├── lib/utils.ts          # cn() для shadcn
│   ├── generated/prisma/     # Сгенерированный Prisma Client (в .gitignore)
│   ├── shared/               # Сквозная инфраструктура
│   │   ├── env/              # Валидация переменных окружения (Zod, ленивая)
│   │   ├── logger/           # pino: createLogger(scope), redact секретов
│   │   ├── errors/           # AppError, доменные ошибки, toActionError, toErrorResponse
│   │   ├── types/            # ActionResult<T>
│   │   ├── db/               # Prisma singleton, checkDatabase()
│   │   ├── storage/          # S3-клиент, checkStorage()
│   │   └── health/           # checkHealth() — агрегирует проверки
│   └── test/                 # Вспомогательное для Vitest
├── compose.yml               # Postgres (порт 5433) + MinIO (9000/9001) + создание бакета
├── .env.example              # Шаблон переменных окружения
├── eslint.config.mjs         # ESLint + правила архитектурных границ
├── vitest.config.ts
└── AGENTS.md                 # Этот файл
```

## Ключевые точки входа

| Файл | Назначение |
|------|------------|
| `.ai-factory/DESCRIPTION.md` | Требования, доменная модель, стек |
| `.ai-factory/ARCHITECTURE.md` | Архитектурный паттерн и структура папок |
| `src/shared/logger/index.ts` | `createLogger(scope)` — единственный способ логировать (`console.*` запрещён) |
| `src/shared/errors/index.ts` | Классы ошибок, `toActionError()` для Server Actions, `toErrorResponse()` для Route Handlers |
| `src/shared/env/index.ts` | `env` / `getEnv()` — типизированные переменные окружения |
| `src/shared/db/index.ts` | `prisma` (только для сервисов и репозиториев модулей) |
| `src/app/api/health/route.ts` | Health check инфраструктуры |
| `compose.yml` | Локальная инфраструктура |
| `.mcp.json` | Конфигурация MCP-серверов |

## Команды

| Команда | Назначение |
|---------|------------|
| `pnpm infra:up` / `pnpm infra:down` | Поднять / остановить Postgres и MinIO |
| `pnpm dev` | Dev-сервер Next.js |
| `pnpm check` | typecheck + lint + format:check + test |
| `pnpm build` | Production-сборка |
| `pnpm db:migrate` | Создать и применить миграцию Prisma |

## Документация

| Документ | Путь | Описание |
|----------|------|----------|
| README | `README.md` | Лендинг: быстрый старт, возможности |
| Начало работы | `docs/getting-started.md` | Установка, запуск, проверка, частые проблемы |
| Конфигурация | `docs/configuration.md` | Переменные окружения, docker-compose, порты |
| Архитектура | `docs/architecture.md` | Слои, границы ESLint, `/api/health` |
| Логирование и ошибки | `docs/logging-and-errors.md` | `createLogger`, `AppError`, `ActionResult` |
| Разработка | `docs/development.md` | Команды, линтеры, тесты, Prisma |

## Файлы AI-контекста

| Файл | Назначение |
|------|------------|
| AGENTS.md | Структурная карта проекта (этот файл) |
| .ai-factory/DESCRIPTION.md | Спецификация проекта и технологический стек |
| .ai-factory/ARCHITECTURE.md | Архитектурные решения и правила зависимостей |
| .ai-factory/rules/base.md | Соглашения об именовании, ошибках, логировании |

## Правила для агентов

- Не объединяйте shell-команды через `&&` — выполняйте их по отдельности
  - Неправильно: `git checkout main && git pull`
  - Правильно: сначала `git checkout main`, затем `git pull origin main`
- Все запросы к данным фильтруются по `workspaceId` с проверкой членства и роли пользователя
- Не обращайтесь к Prisma из React-компонентов напрямую — только через серверные сервисы модулей

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
