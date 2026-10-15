# Tasker

> Простой таск-трекер для команд: рабочие пространства, канбан-доска и список задач.

Tasker помогает командам вести задачи в изолированных рабочих пространствах. Одна задача может одновременно находиться в нескольких проектах, и в каждом у неё свой статус. Сейчас готовы каркас приложения, вход с глобальными ролями и рабочие пространства с приглашениями, а остальные возможности появляются по этапам [дорожной карты](.ai-factory/ROADMAP.md).

## Быстрый старт

Нужны Node.js 22+ (рекомендуется 24), Docker и corepack.

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm infra:up      # Postgres (5433), MinIO (9000/9001), Mailpit (1025/8025)
pnpm db:deploy     # миграции БД
pnpm dev           # http://localhost:3000 → /register
```

Пользователь с email из `ADMIN_EMAILS` (по умолчанию `admin@example.com`) при регистрации становится администратором.

Проверка инфраструктуры:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","checks":{"db":{"ok":true,...},"storage":{"ok":true,...}}}
```

## Что уже есть

- **Next.js 16 + TypeScript (strict)**: App Router, Server Components, Cache Components
- **Вход и регистрация**: Better Auth (email + пароль), глобальные роли `user` / `admin`, защищённые страницы и `/admin`
- **Рабочие пространства**: создание, роли владельца и участника, приглашения по email со ссылкой (письма локально ловит Mailpit), единая проверка доступа `requireWorkspaceAccess()`
- **Tailwind CSS v4 + shadcn/ui**: готовые компоненты в `src/components/ui`
- **PostgreSQL + Prisma 7**: driver adapter `@prisma/adapter-pg`, логирование SQL-запросов
- **S3-хранилище**: MinIO локально, клиент `@aws-sdk/client-s3`
- **Структурированные логи**: pino, уровень через `LOG_LEVEL`, секреты скрываются автоматически
- **Единый формат ошибок**: `{ code, message, fieldErrors? }` для Server Actions и API
- **Контроль качества**: ESLint с правилами архитектурных границ, Prettier, Vitest, pre-commit хук
- **Docker и CI**: standalone-образ с отдельным контейнером миграций, GitHub Actions (проверки, миграции на чистой БД, smoke-тест образа)

## Пример: Server Action в едином формате

```ts
'use server';

import { createLogger } from '@/shared/logger';
import { NotFoundError, ok, toActionError, type ActionResult } from '@/shared/errors';

const log = createLogger('tasks');

export async function archiveTaskAction(taskId: string): Promise<ActionResult<null>> {
  try {
    log.debug({ taskId }, '[archiveTaskAction] start');
    const task = await findTask(taskId);
    if (!task) throw new NotFoundError('Задача не найдена');
    // ...
    return ok(null);
  } catch (error) {
    // Клиент получит { ok: false, error: { code: 'NOT_FOUND', message: 'Задача не найдена' } }
    return toActionError(error, { action: 'archiveTask', taskId });
  }
}
```

## Основные команды

| Команда | Что делает |
|---------|------------|
| `pnpm dev` | Dev-сервер |
| `pnpm check` | typecheck + lint + format:check + тесты |
| `pnpm build` | Production-сборка |
| `pnpm infra:up` / `pnpm infra:down` | Поднять / остановить Postgres, MinIO и Mailpit |
| `pnpm db:migrate` | Создать и применить миграцию Prisma |
| `pnpm app:up` / `pnpm app:down` | Запустить приложение с миграциями и инфраструктурой в Docker / остановить |

Полный список команд описан в [docs/development.md](docs/development.md).

---

## Документация

| Раздел | Описание |
|--------|----------|
| [Начало работы](docs/getting-started.md) | Установка, запуск, проверка, частые проблемы |
| [Конфигурация](docs/configuration.md) | Переменные окружения, docker-compose, порты |
| [Архитектура](docs/architecture.md) | Модули, слои, аутентификация, пространства и доступ, `/api/health` |
| [Логирование и ошибки](docs/logging-and-errors.md) | `createLogger`, `LOG_LEVEL`, `AppError`, `ActionResult` |
| [Разработка](docs/development.md) | Команды, линтеры, тесты, Prisma, коммиты |
| [Docker-образ и CI](docs/deployment.md) | Сборка образа, `compose.app.yml`, миграции, GitHub Actions |

Контекст для AI-агентов лежит в [AGENTS.md](AGENTS.md) и [`.ai-factory/`](.ai-factory/DESCRIPTION.md).
