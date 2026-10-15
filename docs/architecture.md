[← Конфигурация](configuration.md) · [Back to README](../README.md) · [Логирование и ошибки →](logging-and-errors.md)

# Архитектура

Tasker — модульный монолит на Next.js по паттерну **Structured Modules (Vertical Slices)**. Полные правила с примерами описаны в [`.ai-factory/ARCHITECTURE.md`](../.ai-factory/ARCHITECTURE.md). Эта страница — краткая карта.

## Структура

```
src/
├── proxy.ts            # Оптимистичный редирект на /login (Next 16: бывший middleware)
├── app/                # Представление: страницы, layout, route handlers (тонкий слой)
│   ├── (auth)/         # /login, /register
│   ├── (app)/          # Защищённая зона: /, /admin
│   └── api/
│       ├── auth/[...all]/  # Better Auth
│       └── health/     # GET /api/health
├── modules/            # Доменные модули
│   └── auth/           # Вход, регистрация, выход
├── components/
│   ├── auth/           # Формы входа и регистрации, меню пользователя
│   └── ui/             # shadcn/ui (генерируется CLI)
├── lib/utils.ts        # cn()
├── generated/prisma/   # Prisma Client (генерируется, не коммитится)
├── shared/             # Сквозная инфраструктура, без доменной логики
│   ├── auth/           # Better Auth: getAuth(), getSession()
│   ├── access/         # Глобальные роли и guard-функции
│   ├── env/            # Переменные окружения
│   ├── logger/         # pino
│   ├── errors/         # AppError и преобразование ошибок
│   ├── types/          # ActionResult<T>
│   ├── db/             # Prisma-клиент
│   ├── storage/        # S3-клиент
│   └── health/         # Агрегированный health check
└── test/               # Утилиты Vitest
```

Остальные модули (workspaces, projects, tasks, documents, integrations/github) появятся на следующих этапах. Внутри модуля код делится на срезы: `slices/<entity>/<entity>.{actions,service,repository,schema}.ts`, `models/`, `index.ts`.

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
| `src/shared/**` | `@/modules/*/slices/**`, `@/modules/*/models/**` | `shared/` не зависит от модулей |

Нарушение даёт ошибку `pnpm lint` и не проходит pre-commit хук.

## Серверный код

Публичные API `@/shared/env`, `@/shared/logger`, `@/shared/errors`, `@/shared/db`, `@/shared/storage`, `@/shared/health`, `@/shared/auth` и `@/shared/access` импортируют `server-only`. Попытка подключить их в клиентском компоненте ломает сборку. Клиенту нужны только типы: `import type { ActionResult } from '@/shared/types'`.

Тяжёлые клиенты (Prisma, S3, корневой логгер) создаются **лениво**, при первом обращении:

- `next build` не требует `.env` и не подключается к БД;
- в dev клиенты хранятся в `globalThis` и не пересоздаются при HMR.

Экземпляр Better Auth (`getAuth()`) создаётся так же лениво.

## Аутентификация и доступ

Вход по email и паролю через [Better Auth](https://www.better-auth.com). Сессии хранятся в БД, браузер получает cookie. Плагин `admin` добавляет глобальную роль: `user` или `admin` (поле `User.role`).

### Слои

| Слой | Что делает |
|------|------------|
| `src/proxy.ts` | Нет session-cookie → редирект на `/login?returnTo=...`. В БД не ходит, это **не** проверка доступа |
| `@/shared/auth` | `getSession()` — текущая сессия как DTO `{ user: { id, email, name, role, banned }, session }` или `null`. Кешируется на время запроса |
| `@/shared/access` | Guard-функции: единственное место, где проверяется доступ |
| `@/modules/auth` | `signInAction`, `signUpAction`, `signOutAction` и Zod-схемы форм |

### Guard-функции

| Функция | Где использовать | Нет сессии | Не та роль |
|---------|------------------|------------|------------|
| `requireUser()` | Сервисы, Server Actions | `UnauthorizedError` | — (заблокирован → `ForbiddenError`) |
| `requireAdmin()` | Сервисы, Server Actions | `UnauthorizedError` | `ForbiddenError` |
| `requireUserOrRedirect(returnTo?)` | Страницы | редирект на `/login` | — |
| `requireAdminOrNotFound()` | Страницы админки | редирект на `/login` | 404 (не раскрываем, что раздел существует) |

Скрытая в UI ссылка — не защита: каждая страница и каждый сервис вызывают guard сам. `returnTo` пропускается через `safeRedirectPath()`: принимаются только относительные пути внутри приложения (защита от open redirect).

### Сессия и Cache Components

- Чтение сессии — данные запроса. Компонент, который вызывает `getSession()` или guard, рендерится внутри `<Suspense>`, иначе `next build` падает. Layout не ждёт сессию на верхнем уровне, чтобы не задерживать `{children}`.
- `getSession()` вызывает `await connection()` перед чтением заголовков: Better Auth сравнивает срок сессии с `Date.now()`, а в статическом пререндере это запрещено.
- Страницы входа и регистрации сами уводят вошедшего пользователя на `returnTo`, проверив настоящую сессию. Proxy этого не делает: cookie может остаться от истёкшей сессии, и редирект по cookie зациклил бы `/login` ↔ `/`.
- Страница не-админу в `/admin` отдаёт 404 уже после статического shell, поэтому у неё нет собственного `<title>`: иначе заголовок раскрыл бы существование раздела.

### Известные ограничения

- **Rate limit.** Встроенный лимит Better Auth (in-memory) работает только для HTTP-эндпоинтов `/api/auth/*`. Вход и регистрация идут через Server Actions (`auth.api.*`) и его обходят. Ограничение попыток входа запланировано на этап «Готовность к продакшену».
- **Нет подтверждения email и сброса пароля**: для них нужен почтовый транспорт.
- **Вход через GitHub** появится вместе с интеграцией GitHub.

## HTTP-эндпоинты

### `/api/auth/*`

Обработчик Better Auth (`getAuth().handler`, методы `GET` и `POST`). UI использует Server Actions, а этот эндпоинт нужен для клиентских SDK и будущих OAuth-провайдеров. Ошибки отдаются в формате Better Auth, а не в едином формате `{ error: { code, message } }`.

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
