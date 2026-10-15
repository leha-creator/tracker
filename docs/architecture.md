[← Конфигурация](configuration.md) · [Back to README](../README.md) · [Логирование и ошибки →](logging-and-errors.md)

# Архитектура

Tasker — модульный монолит на Next.js по паттерну **Structured Modules (Vertical Slices)**. Полные правила с примерами описаны в [`.ai-factory/ARCHITECTURE.md`](../.ai-factory/ARCHITECTURE.md). Эта страница — краткая карта.

## Структура

```
src/
├── app/                # Представление: страницы, layout, route handlers (тонкий слой)
│   └── api/health/     # GET /api/health
├── modules/            # Доменные модули: workspaces, projects, tasks, documents, integrations/github
├── components/
│   └── ui/             # shadcn/ui (генерируется CLI)
├── lib/utils.ts        # cn()
├── generated/prisma/   # Prisma Client (генерируется, не коммитится)
├── shared/             # Сквозная инфраструктура, без доменной логики
│   ├── env/            # Переменные окружения
│   ├── logger/         # pino
│   ├── errors/         # AppError и преобразование ошибок
│   ├── types/          # ActionResult<T>
│   ├── db/             # Prisma-клиент
│   ├── storage/        # S3-клиент
│   └── health/         # Агрегированный health check
└── test/               # Утилиты Vitest
```

Модули появятся на следующих этапах. Внутри модуля код делится на срезы: `slices/<entity>/<entity>.{actions,service,repository,schema}.ts`, `models/`, `index.ts`.

## Направление зависимостей

```
app/ → modules/<m>/index.ts → *.actions.ts → *.service.ts → models/, *.repository.ts → shared/db
```

## Границы, которые проверяет ESLint

| Где | Запрещено | Почему |
|-----|-----------|--------|
| `src/app/**`, `src/components/**` | `@prisma/client`, `@/generated/prisma`, `@/shared/db`, `*.repository` | UI не ходит в БД в обход сервисов и проверки доступа |
| Везде вне модуля | `@/modules/*/slices/**`, `@/modules/*/models/**` | Модуль используется только через `@/modules/<name>` |
| `src/modules/*/models/**` | Prisma, `@/shared/db`, `next`, `react`, сервисы, репозитории | Модели — чистый TypeScript |
| `src/**` | `console.*` | Только `createLogger` |

Нарушение даёт ошибку `pnpm lint` и не проходит pre-commit хук.

## Серверный код

Публичные API `@/shared/env`, `@/shared/logger`, `@/shared/errors`, `@/shared/db`, `@/shared/storage` и `@/shared/health` импортируют `server-only`. Попытка подключить их в клиентском компоненте ломает сборку. Клиенту нужны только типы: `import type { ActionResult } from '@/shared/types'`.

Тяжёлые клиенты (Prisma, S3, корневой логгер) создаются **лениво**, при первом обращении:

- `next build` не требует `.env` и не подключается к БД;
- в dev клиенты хранятся в `globalThis` и не пересоздаются при HMR.

## HTTP-эндпоинты

### `GET /api/health`

Проверяет БД (`SELECT 1`) и хранилище (`HeadBucket`, таймаут 3 с) параллельно. Ответ не кешируется.

| Статус | Тело |
|--------|------|
| `200` | `{ "status": "ok", "checks": { "db": { "ok": true, "latencyMs": 3 }, "storage": { "ok": true, "latencyMs": 4 } } }` |
| `503` | `{ "status": "degraded", "checks": { ... "storage": { "ok": false, ... } } }` |
| `500` | `{ "error": { "code": "INTERNAL_ERROR", "message": "..." } }`, только при непредвиденной ошибке |

Роут вызывает `checkHealth()` из `@/shared/health`, а не `@/shared/db` напрямую, из-за правил границ выше. Под Cache Components (Next 16) рендер на каждый запрос включает `await connection()`. Сегмент-конфиг `dynamic` в этом режиме удалён.

## See Also

- [Логирование и ошибки](logging-and-errors.md): единый формат ответов
- [Разработка](development.md): линтеры и тесты
- [`.ai-factory/ARCHITECTURE.md`](../.ai-factory/ARCHITECTURE.md): полные правила и примеры кода
