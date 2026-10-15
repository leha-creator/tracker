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
│   │                   # /w/[workspaceSlug] (+ /settings, /settings/members), /invite/[invitationId],
│   │                   # /w/[workspaceSlug]/projects/new, /projects/[projectId]/{board,settings},
│   │                   # /w/[workspaceSlug]/tasks (+ /new, /[taskNumber])
│   └── api/
│       ├── auth/[...all]/  # Better Auth
│       └── health/     # GET /api/health
├── modules/            # Доменные модули
│   ├── auth/           # Вход, регистрация, выход
│   ├── workspaces/     # Пространства, участники, приглашения
│   ├── projects/       # Проекты и статусы-колонки
│   └── tasks/          # Задачи, размещения в проектах, доска и список
├── components/
│   ├── auth/           # Формы входа и регистрации, меню пользователя
│   ├── forms/          # FormField, FormError
│   ├── workspaces/     # Список и переключатель пространств, участники, приглашения
│   ├── projects/       # Список проектов, колонки доски, настройки проекта и статусов
│   ├── tasks/          # Карточка, быстрое создание, страница задачи, список задач
│   └── ui/             # shadcn/ui (генерируется CLI)
├── lib/utils.ts        # cn()
├── generated/prisma/   # Prisma Client (генерируется, не коммитится)
├── shared/             # Сквозная инфраструктура, без доменной логики
│   ├── auth/           # Better Auth: getAuth(), getSession()
│   ├── access/         # Глобальные роли, роли и права пространства, guard-функции
│   ├── env/            # Переменные окружения
│   ├── logger/         # pino
│   ├── errors/         # AppError и преобразование ошибок
│   ├── types/          # ActionResult<T>, FormState<T>
│   ├── db/             # Prisma-клиент, isUniqueViolation()
│   ├── storage/        # S3-клиент
│   ├── mail/           # SMTP (nodemailer): sendMail(), escapeHtml()
│   └── health/         # Агрегированный health check
└── test/               # Утилиты Vitest
```

Остальные модули (documents, integrations/github) появятся на следующих этапах. Внутри модуля код делится на срезы: `slices/<entity>/<entity>.{actions,service,repository,schema,dto}.ts`, `models/`, `index.ts`.

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

Между модулями: `tasks → projects, workspaces` (только через `index.ts`). Обратных зависимостей нет: страница доски сама собирает колонки из `projects` и карточки из `tasks`.

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
| `@/modules/projects` | Проекты и статусы (см. ниже) |
| `@/modules/tasks` | Задачи и их размещения в проектах (см. ниже) |

### Guard-функции

| Функция | Где использовать | Нет сессии | Не та роль |
|---------|------------------|------------|------------|
| `requireUser()` | Сервисы, Server Actions | `UnauthorizedError` | — (заблокирован → `ForbiddenError`) |
| `requireAdmin()` | Сервисы, Server Actions | `UnauthorizedError` | `ForbiddenError` |
| `requireUserOrRedirect(returnTo?)` | Страницы | редирект на `/login` | — |
| `requireAdminOrNotFound()` | Страницы админки | редирект на `/login` | 404 (не раскрываем, что раздел существует) |
| `requireWorkspaceAccess(session, workspaceId, minRole)` | Сервисы с данными пространства | — (сессию передаёт action) | не участник → `NotFoundError`, роль ниже → `ForbiddenError` |
| `requireWorkspaceAccessBySlug(slug, minRole)` | Страницы `/w/[workspaceSlug]/*` | редирект на `/login` | 404 и для неучастника, и для роли ниже |
| `requireWorkspacePermission(session, workspaceId, permission)` | Сервисы, которым нужно право сверх роли (`manageProjects`) | — | не участник → `NotFoundError`, нет права → `ForbiddenError` |

Guard-функции пространства возвращают `WorkspaceAccess` с полем `permissions` (например `{ manageProjects: true }`). Страницы по нему решают, показывать ли кнопки управления и не отдать ли 404.

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
| `member` | `WorkspaceMember` | `workspaceId`, `userId`, `role` (`owner` / `member`), `canManageProjects`, уникальная пара `(workspaceId, userId)` |
| `invitation` | `WorkspaceInvitation` | `workspaceId`, `email`, `role`, `status` (`pending` / `accepted` / `rejected` / `canceled`), `expiresAt`, `inviterId` |

Переименования (`organizationId` → `workspaceId` и т.д.) и дополнительное поле `canManageProjects` (`additionalFields` с `input: false`: эндпоинты плагина его не принимают) заданы в `src/shared/auth/auth.ts`. Менять их можно только вместе со схемой.

### Как устроен модуль `workspaces`

- **Изменения** (создание, переименование, удаление, приглашения, роли, исключение, выход) идут через `auth.api.*` плагина (`callOrganizationApi` в `organization-api.ts`). Ошибки плагина переводятся в доменные (`workspaces.errors.ts`): занятый slug → `CONFLICT` с ошибкой поля `slug`, уже приглашён → `CONFLICT` поля `email` и т.д.
- **Чтение** (списки, DTO) — собственные репозитории с фильтром по `workspaceId`. Участник или приглашение по `id` ищутся только внутри пространства (защита от IDOR).
- **Проверки до плагина.** Каждый сервис сначала вызывает `requireWorkspaceAccess()`, затем инварианты моделей: `Membership` (нельзя понизить, исключить или вывести последнего владельца; нельзя исключить себя) и `Invitation` (статус `pending`, не истекло, email адресата совпадает без учёта регистра).
- **Текущее пространство** берётся из URL `/w/[workspaceSlug]`. Поле `Session.activeWorkspaceId` есть в схеме (требование плагина), но приложение на него не опирается.
- **Право «Управление проектами».** Владелец включает его участнику переключателем на странице «Участники» (`setMemberPermissionAction`). У плагина нет API для дополнительных полей, поэтому это единственная мутация модуля в обход плагина: репозиторий обновляет строку с `workspaceId` в `where`. Владельцу право не настраивается — оно есть всегда.
- **Письма-приглашения** отправляет сервис модуля через `@/shared/mail`, а не колбэк плагина. Ошибка SMTP не откатывает приглашение: результат действия содержит `emailSent: false` и ссылку.

### Маршруты

| Путь | Доступ |
|------|--------|
| `/` | Вошедший пользователь: список своих пространств |
| `/workspaces/new` | Вошедший пользователь |
| `/w/[workspaceSlug]` | Участник: список проектов |
| `/w/[workspaceSlug]/settings/members` | Участник (просмотр); управление — владелец |
| `/w/[workspaceSlug]/settings` | Владелец (иначе 404) |
| `/invite/[invitationId]` | Вошедший пользователь; без сессии — вход с возвратом. Неизвестное приглашение → 404 |

Маршруты проектов — в разделе [«Проекты и статусы»](#проекты-и-статусы).

Глобальный `admin` пока не имеет неявного доступа к чужим пространствам: это этап «Администрирование ресурса».

### Известные ограничения

- **Rate limit.** Встроенный лимит Better Auth (in-memory) работает только для HTTP-эндпоинтов `/api/auth/*`. Вход и регистрация идут через Server Actions (`auth.api.*`) и его обходят. Ограничение попыток входа запланировано на этап «Готовность к продакшену».
- **Нет подтверждения email и сброса пароля.** Почтовый транспорт уже есть (`@/shared/mail`), сами сценарии — отдельный этап. Пока email не подтверждаются, приглашение может принять тот, кто зарегистрировался с адресом приглашённого **и** получил ссылку (id приглашения — случайная строка). Строгая проверка (`requireEmailVerificationOnInvitation`) включится вместе с подтверждением email.
- **Последний владелец.** Проверка «останется ли владелец» и вызов плагина не атомарны: два одновременных понижения или выхода теоретически могут оставить пространство без владельца. Плагин частично проверяет то же самое.
- **Лимит приглашений.** Server Actions обходят rate limit Better Auth. Количество ограничено `invitationLimit` (100 ожидающих приглашений на пространство).
- **Вход через GitHub** появится вместе с интеграцией GitHub.

## Проекты и статусы

| Модель | Поля |
|--------|------|
| `Project` | `id` (UUID v7), `workspaceId`, `name` (уникально в пространстве), `description`, `createdById` |
| `ProjectStatus` | `id` (UUID v7), `projectId`, `workspaceId`, `name` (уникально в проекте), `category` (`todo` / `in_progress` / `done`), `color` (ключ палитры), `position` (0..n-1) |

- **Статус ссылается на проект составным ключом** `(projectId, workspaceId)`: статус не может оказаться в чужом пространстве. Удаление пространства или проекта удаляет статусы каскадом.
- **Права.** Читать проекты и статусы может любой участник. Создавать, менять и удалять — владелец или участник с правом `manageProjects` (`requireWorkspacePermission`).
- **Инварианты набора — в модели `StatusSet`**: хотя бы один статус, не больше 20, имена уникальны без учёта регистра, позиции всегда `0..n-1`. Новый проект получает набор по умолчанию: «К выполнению», «В работе», «Готово».
- **Изменение набора статусов** выполняется в транзакции: сервис блокирует строку проекта (`SELECT … FOR UPDATE`), загружает набор, вызывает метод модели и сохраняет результат. Параллельные изменения идут по очереди и не перезаписывают друг друга.
- **id в URL и формах** проверяются как UUID до запроса к БД: невалидная строка → 404, а не ошибка Postgres.
- **Занятое название проекта** проверяется до вставки. Нарушение уникального индекса (`isUniqueViolation()` из `@/shared/db`, код P2002) ловится только на случай гонки и тоже превращается в `CONFLICT` с ошибкой поля `name`.

| Путь | Доступ |
|------|--------|
| `/w/[workspaceSlug]/projects/new` | Право `manageProjects` (иначе 404) |
| `/w/[workspaceSlug]/projects/[projectId]` | Редирект на `/board` (`redirects` в `next.config.ts`, параметр ограничен UUID) |
| `/w/[workspaceSlug]/projects/[projectId]/board` | Участник. Колонки по статусам с карточками задач, «+ Задача» в каждой колонке |
| `/w/[workspaceSlug]/projects/[projectId]/settings` | Право `manageProjects` (иначе 404): свойства проекта, статусы, удаление |

Проект для layout и страниц загружает `projects/[projectId]/_lib/load-project.ts` (`cache()` на запрос): невалидный id, чужой или удалённый проект → 404.

- **Удаление статуса с задачами** требует выбрать статус для переноса (`moveToStatusId`; правило — в `StatusSet.remove`). В той же транзакции `statusRepository.reassignPlacements` меняет `statusId` размещений, позиции не пересчитываются: дробные ключи двух колонок сливаются в одну. Это единственное место, где `projects` пишет в таблицу модуля `tasks`: колонкой управляет `projects`, а зависимости от `tasks` у него нет.
- **Удаление проекта** каскадом удаляет статусы и размещения задач. Сами задачи остаются в пространстве. Диалог удаления показывает число задач (`ProjectDto.tasksCount`).

## Задачи

| Модель | Поля |
|--------|------|
| `Task` | `id` (UUID v7), `workspaceId`, `number` (сквозной в пространстве, `#42`), `title`, `description` (простой текст), `priority` (`none` / `low` / `medium` / `high` / `urgent`), `dueDate` (дата без времени), `assigneeId`, `createdById` |
| `TaskPlacement` | Ключ `(taskId, projectId)`; `workspaceId`, `statusId`, `position` (дробный ключ) |
| `WorkspaceTaskCounter` | `workspaceId`, `lastNumber`: счётчик номеров задач |

- **Статус хранится только в размещении.** Задача может быть в нескольких проектах (до 20), в каждом — своё размещение со статусом и позицией. В `Task` статуса нет.
- **Целостность на уровне БД.** Размещение ссылается на задачу и проект составными ключами с `workspaceId`, а на статус — ключом `(statusId, projectId)`. Размещение не может оказаться в чужом пространстве или в статусе другого проекта. FK на статус — `NO ACTION`: статус с задачами без переноса не удалить, а каскад проекта проходит.
- **Номер задачи** выдаётся атомарно: `INSERT … ON CONFLICT DO UPDATE … RETURNING` в транзакции создания. Номера не переиспользуются. URL задачи — по номеру.
- **Порядок карточек** задают дробные ключи ([`fractional-indexing`](https://github.com/rocicorp/fractional-indexing)), поэтому перемещение карточки меняет одну строку. Ключи сравниваются побайтно: колонка `position` создана с `COLLATE "C"`. Новая карточка и смена статуса ставят задачу в конец колонки. При совпадении ключей (гонка) порядок определяет `taskId`.
- **Ответственный** — только участник пространства (`isWorkspaceMember` из `@/modules/workspaces`). Участника удаляет плагин Better Auth вне транзакций приложения, поэтому с задач его снимает триггер БД на `WorkspaceMember` (миграция `add_tasks`).
- **Права.** Любой участник создаёт и редактирует задачи и меняет их размещения. Удалить задачу может автор или владелец пространства.
- **Срок** — дата без времени (`@db.Date`), форматируется в UTC. Задача просрочена, если срок прошёл, а статус не в категории `done`. На доске учитывается статус в этом проекте, в списке — все размещения.
- **Описание** выводится как текст (`whitespace-pre-wrap`), HTML не рендерится. Rich-text появится вместе с проектной документацией.

| Путь | Доступ |
|------|--------|
| `/w/[workspaceSlug]/tasks` | Участник: задачи пространства, новые сверху, «Показать ещё» по 50 (курсор `createdAt` + `id`) |
| `/w/[workspaceSlug]/tasks/new` | Участник: создание задачи; `?projectId=` предвыбирает проект |
| `/w/[workspaceSlug]/tasks/[taskNumber]` | Участник: поля задачи, проекты и статусы, удаление. Некорректный номер или задача другого пространства → not found |

Карточки доски отдаёт `getBoardCards()` (один запрос), статусы всех проектов для селектов — `listWorkspaceStatuses()` из `@/modules/projects`.

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
- [Разработка](development.md): линтеры, тесты, ручные правки миграций
- [`.ai-factory/ARCHITECTURE.md`](../.ai-factory/ARCHITECTURE.md): полные правила и примеры кода
