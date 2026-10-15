[← Логирование и ошибки](logging-and-errors.md) · [Back to README](../README.md) · [Docker-образ и CI →](deployment.md)

# Разработка

## Команды

| Команда | Что делает |
|---------|------------|
| `pnpm dev` | Dev-сервер Next.js (http://localhost:3000) |
| `pnpm build` / `pnpm start` | Production-сборка и запуск |
| `pnpm check` | `typecheck` → `lint` → `format:check` → `test`. Запускайте перед пушем: то же самое (и `pnpm build`) выполняет CI |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm test` / `pnpm test:watch` | Vitest |
| `pnpm infra:up` / `pnpm infra:down` / `pnpm infra:logs` | Postgres, MinIO и Mailpit в Docker |
| `pnpm app:up` / `pnpm app:down` | Собрать образ и запустить приложение с миграциями в Docker (http://localhost:3001, отдельный проект `tasker-app`) / остановить стек ([подробнее](deployment.md)) |
| `pnpm db:generate` | Сгенерировать Prisma Client |
| `pnpm db:migrate` | Создать и применить миграцию (dev) |
| `pnpm db:deploy` | Применить миграции (CI / production) |
| `pnpm db:studio` | Prisma Studio |

## Линтеры и форматирование

- **ESLint** (`eslint.config.mjs`): `next/core-web-vitals`, `next/typescript`, типизированные правила `typescript-eslint` для `src/`, правила архитектурных границ (см. [Архитектура](architecture.md#границы-которые-проверяет-eslint)), `no-console`.
- **Prettier** (`.prettierrc`): одинарные кавычки, `trailingComma: all`, ширина 100, сортировка Tailwind-классов (`prettier-plugin-tailwindcss`).
- **Pre-commit** (husky + lint-staged): `eslint --fix` и `prettier --write` для staged-файлов.
- **Переводы строк**: LF (`.gitattributes`, `.editorconfig`).

## Тесты

- Vitest, окружение `node`, файлы `src/**/*.test.ts` рядом с кодом.
- `server-only` в тестах подменяется пустышкой (`src/test/server-only-mock.ts`).
- Тестовые переменные окружения заданы в `vitest.config.ts` (`LOG_LEVEL=silent`), реальные БД и S3 не нужны.
- Сейчас покрыты `shared/errors`, `shared/env`, `shared/logger`.

Проверка логов в тесте: `createRootLogger({ level, pretty: false, destination })` с собственным `Writable`-потоком (пример в `src/shared/logger/logger.test.ts`).

## Prisma

- Схема: `prisma/schema.prisma`, конфиг CLI: `prisma.config.ts`.
- Клиент генерируется в `src/generated/prisma` (не коммитится; генерируется в `postinstall`).
- Импорт в коде — только через `@/shared/db` и только в сервисах и репозиториях модулей:

```ts
import { prisma, type TransactionClient } from '@/shared/db';
```

- Новая модель: правка `schema.prisma` → `pnpm db:migrate --name <change>` → миграция появляется в `prisma/migrations/`. Затем `pnpm db:generate`: Prisma 7 после миграции не генерирует клиент сам, и без этого `tsc` не увидит новые модели.

## Зависимости

- Версии фиксируются точно (`saveExact: true` в `pnpm-workspace.yaml`).
- Пакетам с install-скриптами нужно явное разрешение в `allowBuilds` (`pnpm-workspace.yaml`).
- shadcn-компоненты: `pnpm dlx shadcn@latest add <component>`.

## Коммиты

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`.

## See Also

- [Начало работы](getting-started.md): первый запуск
- [Архитектура](architecture.md): куда класть новый код
- [Логирование и ошибки](logging-and-errors.md): обязательные соглашения для нового кода
- [Docker-образ и CI](deployment.md): сборка образа, `compose.app.yml`, GitHub Actions
