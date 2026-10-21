[← Логирование и ошибки](logging-and-errors.md) · [Back to README](../README.md) · [Дизайн-система →](design.md)

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
| `pnpm help:screenshots` | Засеять демо-данные и переснять скриншоты справки ([подробнее](#как-переснять-скриншоты)) |
| `pnpm brand:icons` | Пересобрать PNG и ICO знака (фавикон, apple-icon, иконки манифеста, логотип для писем, OG) из SVG через Playwright ([подробнее](design.md#файлы-знака)) |

## Интерфейс

UI собирается по правилам [Дизайн-системы](design.md). Коротко:

- цвета — только токенами и тонами (`tones.ts`); guard-тест `src/components/design-system/style-guard.test.ts` падает на `text-red-600`, `[oklch(…)]`, `[#…]` и `text-[11px]`;
- новый токен — в `globals.css` (обе темы) и в `token-catalog.ts`, иначе упадёт `token-catalog.test.ts`;
- новый общий компонент или вариант — на страницу `/admin/design` (`design-system-sections.tsx`) в том же изменении.

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
- `migrate dev` интерактивный. Если миграция требует подтверждения (например, новый уникальный индекс на существующей таблице) или её нужно дописать вручную, создайте каталог `prisma/migrations/<timestamp>_<name>/` и сгенерируйте SQL: `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o <каталог>/migration.sql`. После правки примените миграцию через `pnpm db:deploy`.
- То, чего нет в схеме Prisma, дописывается в SQL миграции вручную с комментарием. Пример — `add_tasks`: `COLLATE "C"` для `TaskPlacement.position` и триггер снятия ответственного. Drift такие правки не дают: `migrate diff --from-config-datasource --to-schema …` после применения возвращает пустую миграцию.
- Расширения в миграциях — только `CREATE EXTENSION IF NOT EXISTS`. В проде роль `tasker` не суперпользователь и не владелец расширений: их заранее ставит общий Postgres из infra (`pg_trgm`). Новое расширение сначала добавляют в infra (`postgres/config/sql/app.sql`).

### PostgreSQL 18

Локально, в CI и в проде — PostgreSQL 18 (`postgres:18.6-alpine`, тот же тег, что у общего Postgres в infra). Том локальной базы — `tasker_postgres18-data`: с версии 18 образ хранит данные в `/var/lib/postgresql/18/docker`, а том PG 17 (`tasker_postgres-data`) с ним несовместим.

Перенос локальных данных с PG 17 (старый контейнер ещё работает на старом томе):

```bash
docker exec tasker-postgres-1 sh -c 'pg_dump -U tasker -d tasker -Fc' > dev-pg17.dump
docker compose up -d --wait postgres          # пересоздаёт контейнер на PG 18 с новым томом
docker exec -i tasker-postgres-1 pg_restore -U tasker -d tasker --no-owner --exit-on-error < dev-pg17.dump
pnpm exec prisma migrate status               # «Database schema is up to date!»
```

Если локальные данные не нужны, хватит `pnpm infra:up` и `pnpm db:deploy`. Старый том после проверки удаляется: `docker volume rm tasker_postgres-data`.

## Зависимости

- Версии фиксируются точно (`saveExact: true` в `pnpm-workspace.yaml`).
- Пакетам с install-скриптами нужно явное разрешение в `allowBuilds` (`pnpm-workspace.yaml`).
- shadcn-компоненты: `pnpm dlx shadcn@latest add <component>`.

## Справка и скриншоты

Справка — раздел `/help` в приложении (только после входа).

- **Статьи** лежат в `content/help/<slug>.md`: только тело, без заголовка `#` и frontmatter. Заголовок, раздел, порядок, описание и аудиторию задаёт каталог `src/modules/help/models/help-catalog.ts`.
- **Новая статья:** запись в `HELP_ARTICLES` → файл `content/help/<slug>.md` → `pnpm test`. Тест `src/modules/help/help-content-integrity.test.ts` проверяет, что файл есть, картинки лежат в `public/help-media/`, а ссылки `/help/<slug>#<якорь>` ведут на существующие статьи и заголовки.
- **Картинки:** `![Описание](/help-media/<article>/<name>.png "Подпись")`. Другие адреса картинок в справке не отображаются.
- **Тексты** пишутся на «вы», подписи интерфейса — дословно в «ёлочках». Новые и переписанные тексты проходят скилл `humanizer:humanizer`. После правки сверьте по `git diff content/help/`, что подписи, клавиши, лимиты и ссылки остались прежними.

### Как переснять скриншоты

Скрипт `scripts/help-screenshots/` (Playwright) засевает демо-данные через интерфейс и HTTP API и снимает экраны в `public/help-media/`. Ему нужен отдельный сервер с чистой базой: демо-пользователи регистрируются заново.

1. Один раз установите браузер: `pnpm exec playwright install chromium`.
2. Создайте пустую базу и примените миграции:

   ```bash
   docker exec tasker-postgres-1 psql -U tasker -d tasker -c "CREATE DATABASE tasker_help"
   DATABASE_URL="postgresql://tasker:tasker@localhost:5433/tasker_help?schema=public" pnpm db:deploy
   ```

3. Соберите приложение (`pnpm build`), скопируйте `public` и `.next/static` в `.next/standalone` и запустите сервер на порту 3001 без подтверждения почты:

   ```bash
   cd .next/standalone
   DATABASE_URL="postgresql://tasker:tasker@localhost:5433/tasker_help?schema=public" \
   BETTER_AUTH_URL=http://localhost:3001 AUTH_REQUIRE_EMAIL_VERIFICATION=false PORT=3001 \
   node --env-file=../../.env server.js
   ```

   Порт 3001 выбран потому, что локальный MinIO разрешает CORS только для `http://localhost:3000` и `http://localhost:3001` (`MINIO_CORS_ALLOW_ORIGIN`). На другом порту загрузка вложений из браузера не пройдёт. Адрес сервера можно поменять переменной `HELP_APP_URL`.
4. `pnpm help:screenshots` — засев и съёмка, около трёх минут.

| Флаг | Что делает |
|------|------------|
| `--shots-only` | Только съёмка по уже засеянной базе |
| `--seed-only` | Только засев |
| `--only=<article>` | Снять одну статью (например, `--only=board`) |
| `--seed-step=<name>` | Выполнить один шаг засева |
| `--allow-remote` | Разрешить нелокальный `HELP_APP_URL`. Без флага скрипт работает только с `localhost`, чтобы случайно не засеять боевой сервер |

Засев можно продолжить после сбоя: выполненные шаги, пароли демо-пользователей и id созданных данных записываются в `scripts/help-screenshots/.state/` (в `.gitignore`). Там же в `errors/` лежит снимок экрана, на котором скрипт упал. Чтобы начать заново, пересоздайте базу и удалите `.state/`. `HELP_HEADED=1` показывает окно браузера.

Кадр `claude-code-mcp/connect.png` снимается при засеве: окно с токеном показывается один раз. Токен на кадре заменён заглушкой. Если засев падает, скорее всего, поменялся интерфейс и справку нужно обновить.

## Коммиты

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`.

## See Also

- [Начало работы](getting-started.md): первый запуск
- [Архитектура](architecture.md): куда класть новый код
- [Логирование и ошибки](logging-and-errors.md): обязательные соглашения для нового кода
- [Docker-образ и CI](deployment.md): сборка образа, `compose.app.yml`, GitHub Actions
