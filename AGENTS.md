# AGENTS.md

> Структурная карта проекта для AI-агентов и новых разработчиков. Обновляйте при существенных изменениях структуры.

## Обзор проекта

Tasker — простой таск-трекер с рабочими пространствами, ролями (admin / владелец пространства / участник), канбан-доской и списком задач; задача может находиться в нескольких проектах со своим статусом в каждом. Подробности — в [`.ai-factory/DESCRIPTION.md`](.ai-factory/DESCRIPTION.md).

## Технологический стек

- **Язык программирования:** TypeScript (strict)
- **Фреймворк:** Next.js 16 (App Router, Cache Components)
- **База данных:** PostgreSQL 17
- **ORM:** Prisma 7 (генератор `prisma-client`, driver adapter `@prisma/adapter-pg`)
- **Аутентификация:** Better Auth 1.7 — email + пароль, плагин `admin` (глобальная роль `user` / `admin`), плагин `organization` (пространства: роли `owner` / `member`, приглашения)
- **UI:** Tailwind CSS v4 + shadcn/ui (radix)
- **Хранилище файлов:** S3 API, локально MinIO (`pgsty/minio`)
- **Почта:** SMTP через nodemailer, локально Mailpit (UI http://localhost:8025)
- **Инфраструктура кода:** pino (логи), Zod (валидация), Vitest, ESLint + Prettier, husky + lint-staged
- **Пакетный менеджер:** pnpm (через corepack)
- **Контейнеры и CI:** Docker (multi-stage, standalone Next.js, `node:24-alpine`), GitHub Actions

## Структура проекта

```
tasker/
├── .ai-factory/              # Контекст AI Factory (описание, архитектура, правила, планы)
├── .claude/                  # Скиллы и субагенты
├── .github/workflows/ci.yml  # CI: pnpm check + build, миграции на чистом Postgres, сборка образа и smoke-тест
├── prisma/
│   ├── schema.prisma         # Схема БД: модели Better Auth (User, Session, …), пространств (Workspace, WorkspaceMember, WorkspaceInvitation), проектов (Project, ProjectStatus), задач (Task, TaskPlacement, WorkspaceTaskCounter, TaskComment)
│   └── migrations/
├── prisma.config.ts          # Подключение Prisma CLI (DATABASE_URL, миграции)
├── src/
│   ├── proxy.ts              # Оптимистичный редирект на /login по session-cookie (не авторизация)
│   ├── app/                  # Представление (Next.js): страницы, layout, route handlers
│   │   ├── (auth)/           # /login, /register
│   │   ├── (app)/            # Защищённая зона: шапка (переключатель пространств, меню), /, /admin (→ /admin/users),
│   │   │                     # /workspaces/new, /w/[workspaceSlug] (+ settings, settings/members), /invite/[invitationId],
│   │   │                     # /w/[workspaceSlug]/projects/new, projects/[projectId]/{board,list,settings},
│   │   │                     # /w/[workspaceSlug]/tasks (+ new, [taskNumber])
│   │   └── api/
│   │       ├── auth/[...all]/ # Better Auth handler
│   │       └── health/       # GET /api/health — состояние БД и хранилища
│   ├── modules/              # Доменные модули
│   │   ├── auth/             # Вход, регистрация, выход: Zod-схемы, сервис, Server Actions
│   │   ├── workspaces/       # Пространства, участники (+ право «Управление проектами»), приглашения (index.ts — сервер, client.ts — клиент)
│   │   ├── projects/         # Проекты и статусы-колонки: модели (StatusSet), срезы project/status
│   │   ├── tasks/            # Задачи: модели (TaskPlacement, позиции, запрос списка TaskListQuery, права на комментарии), срезы task/placement/comment/views; зависит от projects и workspaces
│   │   └── admin/            # Администрирование ресурса: модели (правила над пользователями, запрос списка), срез user (чтение — репозиторий, изменения — плагин admin через callAdminApi); зависит от workspaces
│   ├── components/
│   │   ├── auth/             # Формы входа/регистрации, меню пользователя
│   │   ├── forms/            # FormField, FormError, ConfirmActionDialog (подтверждение; управляемый режим open/onOpenChange)
│   │   ├── admin/            # Навигация админки; users/ — таблица пользователей, фильтры (URL), меню действий, диалоги блокировки и удаления
│   │   ├── workspaces/       # Список, переключатель, участники, приглашения
│   │   ├── projects/         # Список проектов, навигация проекта, настройки проекта и статусов
│   │   ├── tasks/            # Канбан-доска (dnd-kit), карточка, быстрое создание, страница задачи, размещения;
│   │                         # task-list/ — список задач: фильтры, сортировка, пагинация (состояние в URL);
│   │                         # comments/ — комментарии на странице задачи: лента, добавление, правка, удаление
│   │   └── ui/               # shadcn/ui (генерируется CLI, вручную не править)
│   ├── lib/utils.ts          # cn() для shadcn
│   ├── generated/prisma/     # Сгенерированный Prisma Client (в .gitignore)
│   ├── shared/               # Сквозная инфраструктура
│   │   ├── auth/             # Конфиг Better Auth (getAuth), getSession() → DTO, getFreshSession() (в обход cookie-кеша)
│   │   ├── access/           # Глобальные роли, роли и права пространства, requireUser/requireAdmin, requireWorkspaceAccess(BySlug), requireWorkspacePermission
│   │   ├── env/              # Валидация переменных окружения (Zod, ленивая)
│   │   ├── logger/           # pino: createLogger(scope), redact секретов, maskEmail()
│   │   ├── errors/           # AppError, доменные ошибки, toActionError, toErrorResponse
│   │   ├── types/            # ActionResult<T>, FormState<T> для useActionState
│   │   ├── db/               # Prisma singleton, checkDatabase(), isUniqueViolation()
│   │   ├── storage/          # S3-клиент, checkStorage()
│   │   ├── mail/             # sendMail() (nodemailer), escapeHtml()
│   │   └── health/           # checkHealth() — агрегирует проверки
│   └── test/                 # Вспомогательное для Vitest
├── scripts/smoke-health.sh   # Ожидание 200 и {"status":"ok"} от /api/health (CI и ручная проверка)
├── compose.yml               # Postgres (порт 5433) + MinIO (9000/9001) + создание бакета + Mailpit (1025/8025)
├── compose.app.yml           # Оверлей: сервисы migrate (prisma migrate deploy) и app (образ runner)
├── Dockerfile                # Multi-stage: base → deps → builder → runner; отдельный target migrate
├── .dockerignore
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
| `src/shared/auth/index.ts` | `getAuth()` (Better Auth), `getSession()` — текущая сессия как DTO |
| `src/shared/access/index.ts` | `requireUser()` / `requireAdmin()` / `requireWorkspaceAccess()` / `requireWorkspacePermission()` для сервисов, `requireUserOrRedirect()` / `requireAdminOrNotFound()` / `requireWorkspaceAccessBySlug()` для страниц |
| `src/shared/mail/index.ts` | `sendMail()` — отправка писем через SMTP |
| `src/modules/workspaces/index.ts` | Пространства, участники, приглашения: actions и read-функции (`client.ts` — для клиентских компонентов) |
| `src/modules/projects/index.ts` | Проекты и статусы: actions и read-функции (`listProjects`, `getProject`, `listStatuses`, `listWorkspaceStatuses`; `client.ts` — для клиентских компонентов) |
| `src/modules/tasks/index.ts` | Задачи, размещения и комментарии: actions и read-функции (`getTaskByNumber`, `listTaskComments`, `listTasks`, `listProjectTasks`, `getBoardCards`, `parseTaskListParams`; `client.ts` — для клиентских компонентов, в т.ч. `movePlacementAction` и чистые функции переноса карточек) |
| `src/modules/admin/index.ts` | Пользователи ресурса: `listAdminUsers`, `parseAdminUserListParams`; actions блокировки, роли, сессий и удаления (`client.ts` — для клиентских компонентов) |
| `src/modules/auth/index.ts` | `signInAction`, `signUpAction`, `signOutAction`, Zod-схемы форм |
| `src/proxy.ts` | Оптимистичный редирект неавторизованных на `/login` |
| `src/app/api/health/route.ts` | Health check инфраструктуры |
| `compose.yml` | Локальная инфраструктура |
| `Dockerfile` / `compose.app.yml` | Образ приложения и миграций, запуск стека в Docker |
| `.github/workflows/ci.yml` | GitHub Actions |
| `.mcp.json` | Конфигурация MCP-серверов |

## Команды

| Команда | Назначение |
|---------|------------|
| `pnpm infra:up` / `pnpm infra:down` | Поднять / остановить Postgres, MinIO и Mailpit |
| `pnpm dev` | Dev-сервер Next.js |
| `pnpm check` | typecheck + lint + format:check + test |
| `pnpm build` | Production-сборка |
| `pnpm db:migrate` | Создать и применить миграцию Prisma |
| `pnpm app:up` / `pnpm app:down` | Собрать образ и запустить приложение с миграциями в Docker (проект `tasker-app`, порт 3001) / остановить стек |

## Документация

| Документ | Путь | Описание |
|----------|------|----------|
| README | `README.md` | Лендинг: быстрый старт, возможности |
| Начало работы | `docs/getting-started.md` | Установка, миграции, первый вход и администратор |
| Конфигурация | `docs/configuration.md` | Переменные окружения, docker-compose, порты |
| Архитектура | `docs/architecture.md` | Слои, границы ESLint, аутентификация, пространства, проекты, задачи, доска, список и комментарии, администрирование, доступ, `/api/health` |
| Логирование и ошибки | `docs/logging-and-errors.md` | `createLogger`, `AppError`, `ActionResult` |
| Разработка | `docs/development.md` | Команды, линтеры, тесты, Prisma |
| Docker-образ и CI | `docs/deployment.md` | Dockerfile, `compose.app.yml`, миграции, smoke-скрипт, GitHub Actions |

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
