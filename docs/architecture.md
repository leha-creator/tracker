[← Конфигурация](configuration.md) · [Back to README](../README.md) · [Логирование и ошибки →](logging-and-errors.md)

# Архитектура

Tasker — модульный монолит на Next.js по паттерну **Structured Modules (Vertical Slices)**. Полные правила с примерами описаны в [`.ai-factory/ARCHITECTURE.md`](../.ai-factory/ARCHITECTURE.md). Эта страница — краткая карта.

## Структура

```
src/
├── proxy.ts            # Оптимистичный редирект на /login (Next 16: бывший middleware)
├── app/                # Представление: страницы, layout, route handlers (тонкий слой)
│   ├── (auth)/         # /login, /register
│   ├── (app)/          # Защищённая зона: /, /admin, /workspaces/new,
│   │                   # /w/[workspaceSlug] (+ /settings, /settings/members), /invite/[invitationId]
│   └── api/
│       ├── auth/[...all]/  # Better Auth
│       └── health/     # GET /api/health
├── modules/            # Доменные модули
│   ├── auth/           # Вход, регистрация, выход
│   └── workspaces/     # Пространства, участники, приглашения
├── components/
│   ├── auth/           # Формы входа и регистрации, меню пользователя
│   ├── forms/          # FormField, FormError
│   ├── workspaces/     # Список и переключатель пространств, участники, приглашения
│   └── ui/             # shadcn/ui (генерируется CLI)
├── lib/utils.ts        # cn()
├── generated/prisma/   # Prisma Client (генерируется, не коммитится)
├── shared/             # Сквозная инфраструктура, без доменной логики
│   ├── auth/           # Better Auth: getAuth(), getSession()
│   ├── access/         # Глобальные роли, роли пространства и guard-функции
│   ├── env/            # Переменные окружения
│   ├── logger/         # pino
│   ├── errors/         # AppError и преобразование ошибок
│   ├── types/          # ActionResult<T>
│   ├── db/             # Prisma-клиент
│   ├── storage/        # S3-клиент
│   ├── mail/           # SMTP (nodemailer): sendMail(), escapeHtml()
│   └── health/         # Агрегированный health check
└── test/               # Утилиты Vitest
```

Остальные модули (projects, tasks, documents, integrations/github) появятся на следующих этапах. Внутри модуля код делится на срезы: `slices/<entity>/<entity>.{actions,service,repository,schema,dto}.ts`, `models/`, `index.ts`.

Публичный API модуля:

| Файл | Для кого | Что экспортирует |
|------|----------|------------------|
| `index.ts` | Страницы, Server Components, другие модули | Всё из `client.ts` + read-функции сервисов (`server-only`) |
| `client.ts` | Клиентские компоненты (`'use client'`) | Server Actions, Zod-схемы, чистые функции (например `slugify`), типы DTO. Без `server-only` кода |

Клиентский компонент импортирует `@/modules/workspaces/client`, серверный код — `@/modules/workspaces`. Модели, которые нужны клиенту, импортируют ошибки из `@/shared/errors/app-error`, а не из `@/shared/errors` (там `server-only`).

## Направление зависимостей

```
app/ → modules/<m>/index.ts → *.actions.ts → *.service.ts → models/, *.repository.ts → shared/db
```

## Границы, которые проверяет ESLint

| Где | Запрещено | Почему |
|-----|-----------|--------|
| `src/app/**`, `src/components/**` | `@prisma/client`, `@/generated/prisma`, `@/shared/db`, `*.repository` | UI не ходит в БД в обход сервисов и проверки доступа |
| Везде вне модуля | `@/modules/*/slices/**`, `@/modules/*/models/**` | Модуль используется только через `@/modules/<name>` (или `@/modules/<name>/client`) |
| `src/modules/*/models/**` | Prisma, `@/shared/db`, `next`, `react`, сервисы, репозитории | Модели — чистый TypeScript |
| `src/**` | `console.*` | Только `createLogger` |
| `src/shared/**` | `@/modules/*/slices/**`, `@/modules/*/models/**` | `shared/` не зависит от модулей |

Нарушение даёт ошибку `pnpm lint` и не проходит pre-commit хук.

## Серверный код

Публичные API `@/shared/env`, `@/shared/logger`, `@/shared/errors`, `@/shared/db`, `@/shared/storage`, `@/shared/mail`, `@/shared/health`, `@/shared/auth` и `@/shared/access` импортируют `server-only`. Попытка подключить их в клиентском компоненте ломает сборку. Клиенту нужны только типы: `import type { ActionResult } from '@/shared/types'`. Чистые файлы без `server-only` можно импортировать напрямую: `@/shared/access/workspace-role` (`WORKSPACE_ROLES`), `@/shared/mail/escape-html`.

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
| `@/modules/workspaces` | Пространства, участники, приглашения (см. ниже) |

### Guard-функции

| Функция | Где использовать | Нет сессии | Не та роль |
|---------|------------------|------------|------------|
| `requireUser()` | Сервисы, Server Actions | `UnauthorizedError` | — (заблокирован → `ForbiddenError`) |
| `requireAdmin()` | Сервисы, Server Actions | `UnauthorizedError` | `ForbiddenError` |
| `requireUserOrRedirect(returnTo?)` | Страницы | редирект на `/login` | — |
| `requireAdminOrNotFound()` | Страницы админки | редирект на `/login` | 404 (не раскрываем, что раздел существует) |
| `requireWorkspaceAccess(session, workspaceId, minRole)` | Сервисы с данными пространства | — (сессию передаёт action) | не участник → `NotFoundError`, роль ниже → `ForbiddenError` |
| `requireWorkspaceAccessBySlug(slug, minRole)` | Страницы `/w/[workspaceSlug]/*` | редирект на `/login` | 404 и для неучастника, и для роли ниже |

Скрытая в UI ссылка — не защита: каждая страница и каждый сервис вызывают guard сам. `returnTo` пропускается через `safeRedirectPath()`: принимаются только относительные пути внутри приложения (защита от open redirect).

### Сессия и Cache Components

- Чтение сессии — данные запроса. Компонент, который вызывает `getSession()` или guard, рендерится внутри `<Suspense>`, иначе `next build` падает. Layout не ждёт сессию на верхнем уровне, чтобы не задерживать `{children}`.
- `getSession()` вызывает `await connection()` перед чтением заголовков: Better Auth сравнивает срок сессии с `Date.now()`, а в статическом пререндере это запрещено.
- Страницы входа и регистрации сами уводят вошедшего пользователя на `returnTo`, проверив настоящую сессию. Proxy этого не делает: cookie может остаться от истёкшей сессии, и редирект по cookie зациклил бы `/login` ↔ `/`.
- Страница не-админу в `/admin` отдаёт 404 уже после статического shell, поэтому у неё нет собственного `<title>`: иначе заголовок раскрыл бы существование раздела.

## Рабочие пространства и роли

Пространства реализованы плагином Better Auth `organization` под доменными именами:

| Плагин | Prisma-модель | Поля |
|--------|---------------|------|
| `organization` | `Workspace` | `name`, `slug` (уникальный) |
| `member` | `WorkspaceMember` | `workspaceId`, `userId`, `role` (`owner` / `member`), уникальная пара `(workspaceId, userId)` |
| `invitation` | `WorkspaceInvitation` | `workspaceId`, `email`, `role`, `status` (`pending` / `accepted` / `rejected` / `canceled`), `expiresAt`, `inviterId` |

Переименования (`organizationId` → `workspaceId` и т.д.) заданы в `src/shared/auth/auth.ts`. Менять их можно только вместе со схемой.

### Как устроен модуль `workspaces`

- **Изменения** (создание, переименование, удаление, приглашения, роли, исключение, выход) идут через `auth.api.*` плагина (`callOrganizationApi` в `organization-api.ts`). Ошибки плагина переводятся в доменные (`workspaces.errors.ts`): занятый slug → `CONFLICT` с ошибкой поля `slug`, уже приглашён → `CONFLICT` поля `email` и т.д.
- **Чтение** (списки, DTO) — собственные репозитории с фильтром по `workspaceId`. Участник или приглашение по `id` ищутся только внутри пространства (защита от IDOR).
- **Проверки до плагина.** Каждый сервис сначала вызывает `requireWorkspaceAccess()`, затем инварианты моделей: `Membership` (нельзя понизить, исключить или вывести последнего владельца; нельзя исключить себя) и `Invitation` (статус `pending`, не истекло, email адресата совпадает без учёта регистра).
- **Текущее пространство** берётся из URL `/w/[workspaceSlug]`. Поле `Session.activeWorkspaceId` есть в схеме (требование плагина), но приложение на него не опирается.
- **Письма-приглашения** отправляет сервис модуля через `@/shared/mail`, а не колбэк плагина. Ошибка SMTP не откатывает приглашение: результат действия содержит `emailSent: false` и ссылку.

### Маршруты

| Путь | Доступ |
|------|--------|
| `/` | Вошедший пользователь: список своих пространств |
| `/workspaces/new` | Вошедший пользователь |
| `/w/[workspaceSlug]` | Участник |
| `/w/[workspaceSlug]/settings/members` | Участник (просмотр); управление — владелец |
| `/w/[workspaceSlug]/settings` | Владелец (иначе 404) |
| `/invite/[invitationId]` | Вошедший пользователь; без сессии — вход с возвратом. Неизвестное приглашение → 404 |

Глобальный `admin` пока не имеет неявного доступа к чужим пространствам: это этап «Администрирование ресурса».

### Известные ограничения

- **Rate limit.** Встроенный лимит Better Auth (in-memory) работает только для HTTP-эндпоинтов `/api/auth/*`. Вход и регистрация идут через Server Actions (`auth.api.*`) и его обходят. Ограничение попыток входа запланировано на этап «Готовность к продакшену».
- **Нет подтверждения email и сброса пароля.** Почтовый транспорт уже есть (`@/shared/mail`), сами сценарии — отдельный этап. Пока email не подтверждаются, приглашение может принять тот, кто зарегистрировался с адресом приглашённого **и** получил ссылку (id приглашения — случайная строка). Строгая проверка (`requireEmailVerificationOnInvitation`) включится вместе с подтверждением email.
- **Последний владелец.** Проверка «останется ли владелец» и вызов плагина не атомарны: два одновременных понижения или выхода теоретически могут оставить пространство без владельца. Плагин частично проверяет то же самое.
- **Лимит приглашений.** Server Actions обходят rate limit Better Auth. Количество ограничено `invitationLimit` (100 ожидающих приглашений на пространство).
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
- [Конфигурация](configuration.md): SMTP и настройки плагина `organization`
- [Разработка](development.md): линтеры и тесты
- [`.ai-factory/ARCHITECTURE.md`](../.ai-factory/ARCHITECTURE.md): полные правила и примеры кода
