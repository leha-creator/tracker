[← Конфигурация](configuration.md) · [Back to README](../README.md) · [Логирование и ошибки →](logging-and-errors.md)

# Архитектура

Tasker — модульный монолит на Next.js по паттерну **Structured Modules (Vertical Slices)**. Полные правила с примерами описаны в [`.ai-factory/ARCHITECTURE.md`](../.ai-factory/ARCHITECTURE.md). Эта страница — краткая карта.

## Структура

```
src/
├── proxy.ts            # Оптимистичный редирект на /login (Next 16: бывший middleware)
├── app/                # Представление: страницы, layout, route handlers (тонкий слой)
│   ├── (auth)/         # /login — кнопка «Войти через plwedding ID»
│   ├── (app)/          # Защищённая зона: /, /admin (обзор; users, users/[userId], workspaces, workspaces/[workspaceId], activity, settings, integrations), /workspaces/new,
│   │                   # /w/[workspaceSlug] (+ /settings, /settings/members, /settings/github,
│   │                   #   /settings/agents, /settings/agents/[agentId], /settings/labels), /invite/[invitationId],
│   │                   # /w/[workspaceSlug]/projects/new, /projects/[projectId]/{board,settings},
│   │                   # /w/[workspaceSlug]/tasks (+ /new, /[taskNumber]),
│   │                   # /w/[workspaceSlug]/members/[userId] (публичный профиль),
│   │                   # /w/[workspaceSlug]/docs (+ /new, /[documentId], /[documentId]/edit),
│   │                   # /profile (+ /notifications, /account, /security, /tokens, /tokens/[tokenId] — журнал токена), /notifications
│   └── api/
│       ├── auth/[...all]/  # Better Auth
│       ├── mcp/        # POST — MCP-сервер для агентов (Bearer-токен, без сессий)
│       ├── attachments/[attachmentId]/ # GET — скачивание вложения (302 на presigned-ссылку)
│       ├── documents/[documentId]/file/ # GET — файл документа (302) или Markdown заметки
│       ├── idp-avatar/[sub]/           # GET — фото профиля из IdP (302 на IdP)
│       ├── w/[workspaceSlug]/members/[userId]/card/ # GET — карточка участника при наведении
│       ├── notifications/  # GET — последние уведомления и счётчик (+ /unread-count)
│       ├── webhooks/github/ # POST — вебхуки GitHub App (подпись X-Hub-Signature-256)
│       ├── integrations/github/setup/ # GET — Setup URL: возврат с GitHub после установки приложения
│       ├── cron/reminders/ # POST — напоминания о сроке (Bearer CRON_SECRET, вызывает планировщик)
│       └── health/     # GET /api/health
├── modules/            # Доменные модули
│   ├── auth/           # Вход через IdP (sso), выход и сессии (session), системные операции для админки (account)
│   ├── workspaces/     # Пространства, участники, приглашения
│   ├── projects/       # Проекты и статусы-колонки
│   ├── tasks/          # Задачи, размещения в проектах, комментарии и @упоминания, вложения, доска и список;
│   │                   # история (history), метки (label), наблюдатели (watcher), архив, поиск (search), напоминания о сроке (reminder)
│   ├── profiles/       # Профиль пользователя: должность, описание (имя и фото — из IdP)
│   ├── notifications/  # Уведомления (в приложении и письмом) и настройки получателя
│   ├── documents/      # Документы пространства: папки, Markdown-заметки, файлы, теги, связи с задачами
│   ├── integrations/
│   │   └── github/     # GitHub App: установки, репозитории, вебхуки, PR, ветки и коммиты задач, автосмена статуса
│   ├── agents/         # Агенты пространства: служебный User (isAgent) + WorkspaceAgent, ответственный, права, отключение
│   ├── api-tokens/     # Токены доступа (личные и агентов): области, выпуск, отзыв, журнал действий MCP (срез activity)
│   ├── agent-mcp/      # MCP-сервер: инструменты задач и документов, области токена, журнал, правила GitHub, промпты
│   ├── search/         # Глобальный поиск (палитра Cmd+K): агрегатор задач, документов, участников и пространств
│   ├── audit/          # Журнал действий: чтение (лента участника, журнал безопасности, журнал админки), тексты событий
│   └── admin/          # Администрирование ресурса: пользователи и их карточка, имперсонация, пространства, настройки, обзор
├── components/
│   ├── layout/         # Каркас: PageContainer, разделы пространства в шапке, TabLink, тема, 404, nav-items (чистые функции навигации)
│   ├── auth/           # Кнопка входа через IdP (idp-sign-in), меню пользователя (аватар с выпадающим списком)
│   ├── forms/          # FormField, FormError, ConfirmActionDialog
│   ├── admin/          # Навигация админки; users/ (+ detail/ — карточка), workspaces/, activity/, settings/, overview/
│   ├── audit/          # Лента событий журнала (AuditEventList)
│   ├── workspaces/     # Список и переключатель пространств, участники, приглашения
│   ├── projects/       # Список проектов, колонки доски, настройки проекта и статусов
│   ├── tasks/          # Доска, карточка, быстрое создание, поля задачи; task-panel/ — панель и компоновка задачи (?task); task-list/ — список задач; comments/ — комментарии и подсказка @; attachments/ — загрузка и список вложений; history/ — лента истории; labels/ — метки (чип, редактор)
│   ├── search/         # Палитра Cmd/Ctrl+K (CommandPalette) и кнопка поиска в шапке (SearchTrigger)
│   ├── users/          # UserAvatar (фото или инициалы), UserHoverCard (карточка участника при наведении)
│   ├── profile/        # Свой профиль: вкладки, форма «О себе», настройки уведомлений; security/ — сеансы в Tasker
│   ├── api-tokens/     # Токены доступа (профиль и страница агента): таблица, выпуск с областями, отзыв, журнал действий
│   ├── agents/         # Раздел «Агенты»: таблица, диалог создания и правки; ViaAgentBadge — пометка «через Claude Code»
│   ├── notifications/  # Колокольчик в шапке, элемент и лента уведомлений
│   ├── documents/      # Раздел «Документы»: дерево папок, список, загрузка, диалоги; markdown/ — безопасный рендер; note-editor/ — редактор заметки; viewers/ — просмотрщики файлов; task-documents/ — раздел в задаче
│   ├── github/         # Раздел GitHub задачи, индикатор PR, настройки GitHub пространства и проекта, привязка аккаунта
│   └── ui/             # shadcn/ui (генерируется CLI)
├── lib/utils.ts        # cn()
├── generated/prisma/   # Prisma Client (генерируется, не коммитится)
├── shared/             # Сквозная инфраструктура, без доменной логики
│   ├── auth/           # Better Auth: getAuth(), getSession(), getFreshSession(); клиент IdP (oidc-config, oidc-discovery, oidc-profile)
│   ├── rate-limit/     # Лимиты попыток для Server Actions (таблица ActionRateLimit), getClientIp()
│   ├── audit/          # Каталог событий журнала, recordAuditEvent() (никогда не бросает)
│   ├── resource-settings/ # Настройки ресурса: квота хранилища по умолчанию
│   ├── access/         # Глобальные роли, роли и права пространства, guard-функции
│   ├── env/            # Переменные окружения
│   ├── logger/         # pino
│   ├── errors/         # AppError и преобразование ошибок
│   ├── types/          # ActionResult<T>, FormState<T>
│   ├── db/             # Prisma-клиент, isUniqueViolation()
│   ├── text/           # transliterate() — транслитерация для slug, ключей задач и имён веток
│   ├── storage/        # S3-клиенты, presigned POST/GET, удаление объектов
│   ├── mail/           # SMTP (nodemailer): sendMail(), escapeHtml()
│   └── health/         # Агрегированный health check
└── test/               # Утилиты Vitest
```

Вложенный модуль `integrations/github` устроен так же (правила ESLint для `slices/**` и `models/**` покрывают вложенность). Внутри модуля код делится на срезы: `slices/<entity>/<entity>.{actions,service,repository,schema,dto}.ts`, `models/`, `index.ts`.

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

Между модулями (только через `index.ts`):

| Модуль | Зависит от | Зачем |
|--------|------------|-------|
| `tasks` | `projects`, `workspaces`, `notifications` | Статусы, проверка ответственного и участники для @упоминаний, уведомления о комментариях и назначении |
| `workspaces` | `notifications` | Уведомление о приглашении |
| `profiles` | — | Только `shared/`: должность и описание (`UserProfile`); имя и фото приходят из IdP |
| `admin` | `workspaces`, `profiles`, `api-tokens`, `audit`, `auth`, `documents`, `tasks`, `integrations/github` | Число пространств, единоличное владение; системные функции пространств; токены и GitHub-аккаунт в карточке; журнал; операции над учётной записью и метрики учётных записей (`auth`); хранилище для обзора |
| `audit` | `auth` (client) | Подпись устройства по User-Agent |
| `documents` | `tasks` | Номер, название и поиск задач для связей документ ↔ задача (`getTaskSummaries`, `listTasks`) |
| `integrations/github` | `tasks`, `projects`, `workspaces`, `notifications` | Задачи по ключу (`resolveTaskRefs`), системная смена статуса, статусы проекта для автоматизации, пространства по ключу (`findWorkspacesByTaskKeys`), уведомления о PR |
| `api-tokens` | — | Только `shared/` (членство — через `requireWorkspaceAccess`). Строку агента (`WorkspaceAgent`) читает своим репозиторием |
| `agents` | `api-tokens` | Отзыв токенов отключённого агента (`revokeAllUserApiTokens`); владелец проверяется через `shared/access` |
| `agent-mcp` | `api-tokens`, `tasks`, `projects`, `workspaces`, `documents`, `integrations/github` | Аутентификация токена и журнал, те же сервисы задач и документов, что у Server Actions, сводка GitHub и разбор ключей для правил агента |
| `search` | `tasks`, `documents`, `workspaces` | Палитра Cmd+K: `searchTasks`, `searchDocuments`, `listMembers`, `listMyWorkspaces`. От `search` не зависит никто |

`notifications` ни от кого не зависит: данные события (номер и название задачи, slug пространства, имя автора) приходят снимком от вызывающего модуля. Таблицы агентов (`WorkspaceAgent`) `notifications`, `workspaces`, `profiles` и `api-tokens` читают своими репозиториями — так же, как `notifications` читает `User` для email: обратной зависимости от `agents` нет. Обратных зависимостей нет: страница доски сама собирает колонки из `projects` и карточки из `tasks`, страница профиля участника — данные из `workspaces`, `profiles` и `tasks`, раздел «Документы» в задаче — из `documents` (модуль `tasks` о документах не знает). Так же доска, список и задача берут индикаторы и раздел GitHub из `integrations/github`: ядро о GitHub не знает.

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

Вход — только через IdP «plwedding ID» (OIDC, репозиторий `leha-creator/auth`): Tasker — его клиент на [Better Auth](https://www.better-auth.com) (см. [«Вход через plwedding ID»](#вход-через-plwedding-id)). Пароли, подтверждение email, 2FA и правила регистрации — в IdP. Сессии Tasker хранятся в его БД, браузер получает cookie. Плагин `admin` добавляет глобальную роль: `user` или `admin` (поле `User.role`).

### Слои

| Слой | Что делает |
|------|------------|
| `src/proxy.ts` | Нет session-cookie → редирект на `/login?returnTo=...`. В БД не ходит, это **не** проверка доступа |
| `@/shared/auth` | `getSession()` — текущая сессия как DTO `{ user: { id, email, name, role, banned }, session }` или `null`. Кешируется на время запроса. `getFreshSession()` — то же в обход cookie-кеша сессии (см. ниже) |
| `@/shared/access` | Guard-функции: единственное место, где проверяется доступ |
| `@/modules/auth` | Срезы `sso` (вход через IdP, тексты ошибок, ссылка на аккаунт IdP), `session` (сеансы в Tasker, выход), `account` (системные операции для админки) (`client.ts` — для клиентских компонентов) |
| `@/shared/rate-limit` | `enforceRateLimit(action, { ip, email?, userId? })` — лимиты попыток для Server Actions |
| `@/modules/workspaces` | Пространства, участники, приглашения (см. ниже) |
| `@/modules/projects` | Проекты и статусы (см. ниже) |
| `@/modules/tasks` | Задачи и их размещения в проектах (см. ниже) |
| `@/modules/admin` | Управление пользователями ресурса (см. [«Администрирование»](#администрирование)) |

### Guard-функции

| Функция | Где использовать | Нет сессии | Не та роль |
|---------|------------------|------------|------------|
| `requireUser()` | Сервисы, Server Actions | `UnauthorizedError` | — (заблокирован → `ForbiddenError`) |
| `requireAdmin()` | Сервисы, Server Actions | `UnauthorizedError` | `ForbiddenError`. Сессия — `getFreshSession()` |
| `requireUserOrRedirect(returnTo?)` | Страницы | редирект на `/login` | — |
| `requireAdminOrNotFound(returnTo?)` | Страницы админки | редирект на `/login` | 404 (не раскрываем, что раздел существует). Сессия — `getFreshSession()` |
| `requireWorkspaceAccess(session, workspaceId, minRole, { allowArchived })` | Сервисы с данными пространства | — (сессию передаёт action) | не участник или пространство в архиве → `NotFoundError`, роль ниже → `ForbiddenError` |
| `requireWorkspaceAccessBySlug(slug, minRole)` | Страницы `/w/[workspaceSlug]/*` | редирект на `/login` | 404 и для неучастника, и для роли ниже |
| `requireWorkspacePermission(session, workspaceId, permission)` | Сервисы, которым нужно право сверх роли (`manageProjects`, `manageDocuments`) | — | не участник → `NotFoundError`, нет права → `ForbiddenError` |

**Архивное пространство заморожено:** все guard-функции пространства отвечают `NOT_FOUND` (страницы — 404). Исключение — опция `allowArchived` (и у `requireWorkspaceAccessBySlug`): с ней в архивное пространство пускают только владельца — в настройки, к восстановлению и удалению. Тогда в `WorkspaceAccess` есть `archived: true`.

Guard-функции пространства возвращают `WorkspaceAccess` с полем `permissions` (например `{ manageProjects: true, manageDocuments: false }`). Страницы по нему решают, показывать ли кнопки управления и не отдать ли 404.

Скрытая в UI ссылка — не защита: каждая страница и каждый сервис вызывают guard сам. `returnTo` пропускается через `safeRedirectPath()`: принимаются только относительные пути внутри приложения (защита от open redirect).

### Сессия и Cache Components

- Чтение сессии — данные запроса. Компонент, который вызывает `getSession()` или guard, рендерится внутри `<Suspense>`, иначе `next build` падает. Layout не ждёт сессию на верхнем уровне, чтобы не задерживать `{children}`.
- `getSession()` вызывает `await connection()` перед чтением заголовков: Better Auth сравнивает срок сессии с `Date.now()`, а в статическом пререндере это запрещено.
- Страница входа сама уводит вошедшего пользователя на `returnTo`, проверив настоящую сессию. Proxy этого не делает: cookie может остаться от истёкшей сессии, и редирект по cookie зациклил бы `/login` ↔ `/`.
- Страницы `/admin/*` отдают не-админу 404 уже после статического shell, поэтому у них нет собственного `<title>`, а заголовок раздела рендерится внутри `<Suspense>`: иначе shell раскрыл бы существование раздела.
- **Cookie-кеш сессии.** Better Auth хранит данные сессии в подписанной cookie до 5 минут (`cookieCache`), и `getSession()` читает их без запроса к БД. Поэтому снятая роль или блокировка доходят до остального приложения не сразу. Проверки администратора (`requireAdmin`, `requireAdminOrNotFound`) используют `getFreshSession()` — сессию из БД: в админке изменения действуют сразу. Вне админки заблокированный пользователь теряет доступ не позже чем через 5 минут: плагин удаляет его сессии из БД, а кеш истекает.

## Вход через plwedding ID

Tasker — OIDC-клиент IdP «plwedding ID» (`leha-creator/auth`; локально `http://localhost:3005`, в продакшене `https://auth.plwedding.ru`). Своих паролей, подтверждения email, 2FA и правил регистрации в Tasker нет: кто может войти, решает IdP. Tasker хранит свои сессии, роль `admin`, профиль (должность, описание) и данные приложения.

### Как устроено

| Часть | Где | Как работает |
|-------|-----|--------------|
| Провайдер | `src/shared/auth/oidc-config.ts` | Плагин `genericOAuth` (`better-auth/plugins/generic-oauth`), провайдер `plwedding`: discovery `<OIDC_ISSUER>/.well-known/openid-configuration`, области `openid email profile`, authorization code + PKCE, `client_secret_basic`, проверка ID-токена по JWKS (`requireIdTokenVerification`). Колбэк — `/api/auth/callback/plwedding` |
| Подтверждённый email | `requireEmailVerification` | Без `email_verified: true` от IdP сессия не создаётся (`?error=email_not_verified`) |
| Профиль из IdP | `src/shared/auth/oidc-profile.ts`, `overrideUserInfo` | Имя, email и фото обновляются при каждом входе: источник правды — IdP. Фото — только загруженное в IdP: `User.image = /api/idp-avatar/<sub>?v=<версия>` (см. [`GET /api/idp-avatar/[sub]`](#get-apiidp-avatarsub)); иначе — инициалы |
| Доступность IdP | `src/shared/auth/oidc-discovery.ts` | Свой загрузчик discovery: первая проверка ждёт до 5 с, при неудаче повторяется в фоне каждые 30 с. Пока IdP недоступен, провайдер не подключён, а `/login` вместо кнопки показывает предупреждение «Вход через plwedding ID временно недоступен…». Когда IdP ответил, экземпляр Better Auth пересоздаётся (`getAuth()`) |
| Только IdP | `hooks.before` в `auth.ts` | `/sign-in/social` с провайдером, отличным от `plwedding`, — `403 SIGN_IN_PROVIDER_NOT_ALLOWED`. GitHub подключён только для привязки аккаунта (`linkSocial`) и токенов интеграции |
| Связь с учётной записью | `accountLinking` | Пользователь Tasker, заведённый до IdP, получает аккаунт `plwedding` при первом входе по совпадению email — только если email подтверждён и в IdP, и локально (`User.emailVerified`). Иначе — `?error=account_not_linked`. `trustedProviders` пуст |
| Первый вход | `databaseHooks.user.create` | Учётная запись создаётся при первом входе; email из `ADMIN_EMAILS` получает роль `admin`. В журнал пишется `auth.signed_up` с методом `oidc` |

### Страницы

| Страница | Что показывает |
|----------|----------------|
| `/login` | Одна кнопка **Войти через plwedding ID** (`signInWithIdpAction`) и ошибка из `?error=`: `email_not_verified`, `account_not_linked`, `account_already_linked_to_different_user`, `access_denied`, `banned`; неизвестный код — общий текст. Вошедшего пользователя уводит на `returnTo` |
| `/profile` | «Имя и фото» — только чтение, ссылка «Изменить в plwedding ID»; «О себе» — должность и описание |
| `/profile/account` | Имя и email — только чтение, ссылка «Учётная запись plwedding ID»; привязка GitHub |
| `/profile/security` | «Пароль и двухфакторная защита» — ссылка «Пароль, 2FA и сессии в plwedding ID» (`<OIDC_ISSUER>/account`); «Сеансы в Tasker»; «Журнал безопасности» |

**Сеансы в Tasker:** устройство (по User-Agent), IP, время входа и активности, пометки «Это устройство» и «Вход администратора». Завершить можно одну сессию или все, кроме текущей. Сессии IdP управляются в самом IdP.

### Выход

`signOutAction` (срез `session`, `sign-out.service.ts`) завершает сессию Tasker и уводит на `end_session_endpoint` IdP с `id_token_hint` и `post_logout_redirect_uri=<BETTER_AUTH_URL>/login` (RP-initiated logout): пользователь выходит и из IdP. При входе «от имени пользователя» — только локальный выход. Back-channel logout пока не реализован: выход в IdP или другом приложении не завершает сессию Tasker.

### Лимиты попыток

Лимитов два, потому что Better Auth считает запросы только в своём HTTP-роутере:

| Что ограничивает | Где | Хранилище |
|------------------|-----|-----------|
| Прямые запросы к `/api/auth/*` | `rateLimit` Better Auth: `storage: 'database'`, `customRules` из `src/shared/auth/auth-options.ts`: `/sign-in/social` и `/link-social` — 10 в минуту, `/callback/*` — 20 в минуту | `RateLimit` |
| Server Actions (вызовы `auth.api.*` из них лимит Better Auth обходят) | `enforceRateLimit` из `@/shared/rate-limit`, правила — `RATE_LIMITS` в `rules.ts` | `ActionRateLimit` |

Правила для Server Actions (фиксированное окно), которые сейчас применяются:

| Действие | Лимит |
|----------|-------|
| `admin-mail` (тестовое письмо) | 10 в час на администратора |
| `admin-impersonate` | 30 в час на администратора |
| `tasks.export` | 10 в минуту на пользователя |

- Счётчик — один атомарный `INSERT … ON CONFLICT DO UPDATE`; истёкшие строки удаляются в фоне примерно на каждом 50-м вызове. Email в ключе хранится только хешем (`sha256`, 16 символов).
- Превышение → `RateLimitError` (`RATE_LIMITED`, HTTP 429, «Повторите через N мин»; в Route Handler — заголовок `Retry-After`). При сбое БД лимит не применяется (fail-open), пишется `ERROR`.
- Таблицу `RateLimit` Better Auth чистит от строк старше своего самого длинного окна (60 с), поэтому окна до часа живут в отдельной `ActionRateLimit`.

**IP клиента** — первый адрес `X-Forwarded-For` (`getClientIp`), для Better Auth — `advanced.ipAddress.ipAddressHeaders`. Доверять заголовку можно только за прокси, который его перезаписывает: edge-Caddy (`reverse_proxy` без `trusted_proxies`) так и делает. Без определённого IP все запросы попадают в общий бакет `unknown` (`WARN` один раз за процесс).

Логгер скрывает токены OIDC (`idToken`, `id_token`, `id_token_hint`, `accessToken`, `refreshToken`, `codeVerifier`).

### Модели

| Модель | Поля |
|--------|------|
| `Account` | Аккаунт `plwedding` (`accountId` — `sub` IdP, ID-токен для выхода) и, если привязан, `github` (токены зашифрованы, `encryptOAuthTokens`) |
| `Verification` | Состояние OAuth (state, PKCE) на время входа |
| `RateLimit` | `key` (IP и путь), `count`, `lastRequest` (мс) — лимит Better Auth |
| `ActionRateLimit` | `key` (`действие:область:…`), `count`, `windowStart`, `expiresAt` — свой лимит |

Миграция `20261021120000_drop_local_auth` убрала локальный вход: таблицу `TwoFactor`, `User.twoFactorEnabled`, поля режима регистрации в `ResourceSettings` и enum `SignupMode`, `UserProfile.avatarKey`; удалила аккаунты `credential`; сбросила загруженные фото (агентам — `/agent-avatar.svg`, остальным — `NULL`).

### Ограничения

- **Завершённая сессия живёт до 5 минут** в cookie-кеше браузера (см. [«Сессия и Cache Components»](#сессия-и-cache-components)).
- **Список сессий читается напрямую из `Session`.** `auth.api.listSessions` требует «свежую» сессию (моложе суток) и отдаёт токены. Репозиторий `session.repository.ts` выбирает поля без токена и удаляет только сессии текущего пользователя.
- **Нет back-channel logout:** блокировка или выход в IdP не завершают уже открытую сессию Tasker.
- **Роль `admin` — локальная:** claim `groups` IdP не используется.

## Рабочие пространства и роли

Пространства реализованы плагином Better Auth `organization` под доменными именами:

| Плагин | Prisma-модель | Поля |
|--------|---------------|------|
| `organization` | `Workspace` | `name`, `slug` (уникальный) |
| `member` | `WorkspaceMember` | `workspaceId`, `userId`, `role` (`owner` / `member`), `canManageProjects`, `canManageDocuments`, уникальная пара `(workspaceId, userId)` |
| `invitation` | `WorkspaceInvitation` | `workspaceId`, `email`, `role`, `status` (`pending` / `accepted` / `rejected` / `canceled`), `expiresAt`, `inviterId` |

Переименования (`organizationId` → `workspaceId` и т.д.) и дополнительные поля `canManageProjects`, `canManageDocuments` (`additionalFields` с `input: false`: эндпоинты плагина его не принимают) заданы в `src/shared/auth/auth.ts`. Менять их можно только вместе со схемой.

### Как устроен модуль `workspaces`

- **Изменения** (создание, переименование, удаление, приглашения, роли, исключение, выход) идут через `auth.api.*` плагина (`callOrganizationApi` в `organization-api.ts`). Ошибки плагина переводятся в доменные (`workspaces.errors.ts`): занятый slug → `CONFLICT` с ошибкой поля `slug`, уже приглашён → `CONFLICT` поля `email` и т.д.
- **Чтение** (списки, DTO) — собственные репозитории с фильтром по `workspaceId`. Участник или приглашение по `id` ищутся только внутри пространства (защита от IDOR).
- **Проверки до плагина.** Каждый сервис сначала вызывает `requireWorkspaceAccess()`, затем инварианты моделей: `Membership` (нельзя понизить, исключить или вывести последнего владельца; нельзя исключить себя) и `Invitation` (статус `pending`, не истекло, email адресата совпадает без учёта регистра).
- **Текущее пространство** берётся из URL `/w/[workspaceSlug]`. Поле `Session.activeWorkspaceId` есть в схеме (требование плагина), но приложение на него не опирается.
- **Права «Управление проектами» и «Управление документами».** Владелец включает их участнику переключателями на странице «Участники» (`setMemberPermissionAction`, `permission` = `manageProjects` / `manageDocuments`; право → колонка — `PERMISSION_FLAGS` в `workspace-role.ts`). У плагина нет API для дополнительных полей, поэтому это единственная мутация модуля в обход плагина: репозиторий обновляет строку с `workspaceId` в `where`. Владельцу право не настраивается — оно есть всегда.
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

Глобальный `admin` не имеет неявного доступа к чужим пространствам. Управление ими — в админке ([«Пространства»](#пространства)), а работа внутри — только через [имперсонацию](#имперсонация).

### Известные ограничения

- **Приглашения и email.** Принять приглашение можно только с подтверждённым email (`requireEmailVerificationOnInvitation`). Вход через IdP и так требует подтверждённый email.
- **Последний владелец.** Проверка «останется ли владелец» и вызов плагина не атомарны: два одновременных понижения или выхода теоретически могут оставить пространство без владельца. Плагин частично проверяет то же самое.
- **Лимит приглашений.** Server Actions обходят rate limit Better Auth, а свой лимитер (`@/shared/rate-limit`) на приглашения не стоит. Количество ограничено `invitationLimit` (100 ожидающих приглашений на пространство).
- **GitHub — не способ входа**: аккаунт GitHub привязывается только явно из профиля (`linkSocial`), см. [Интеграция с GitHub](github.md#привязка-аккаунта-github).

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
| `/w/[workspaceSlug]/projects/[projectId]/board` | Участник. Колонки по статусам с карточками задач, перетаскивание карточек внутри колонки и между колонками, «+ Задача» в каждой колонке |
| `/w/[workspaceSlug]/projects/[projectId]/list` | Участник. Задачи проекта таблицей: статус в этом проекте, фильтры, сортировка (по умолчанию — порядок доски), страницы |
| `/w/[workspaceSlug]/projects/[projectId]/settings` | Право `manageProjects` (иначе 404): свойства проекта, статусы, удаление |

Проект для layout и страниц загружает `projects/[projectId]/_lib/load-project.ts` (`cache()` на запрос): невалидный id, чужой или удалённый проект → 404.

- **Удаление статуса с задачами** требует выбрать статус для переноса (`moveToStatusId`; правило — в `StatusSet.remove`). В той же транзакции `statusRepository.reassignPlacements` меняет `statusId` размещений, позиции не пересчитываются: дробные ключи двух колонок сливаются в одну. Это единственное место, где `projects` пишет в таблицу модуля `tasks`: колонкой управляет `projects`, а зависимости от `tasks` у него нет.
- **Порядок статусов** меняется перетаскиванием за ручку в настройках проекта (`StatusList`, dnd-kit: указатель, касание, клавиатура — Space, стрелки, Space). Клиент считает новый порядок чистой функцией `reorderStatuses()` и сразу показывает его, затем вызывает `moveStatusAction({ workspaceId, projectId, statusId, prevStatusId })`: статус встаёт сразу после `prevStatusId` (`null` — первым; правило — в `StatusSet.moveAfter`). Если порядок не изменился, сервис ничего не сохраняет. Неизвестный `prevStatusId` (статус успели удалить) → `NOT_FOUND`, клиент показывает toast и возвращает порядок с сервера.
- **Удаление проекта** каскадом удаляет статусы и размещения задач. Сами задачи остаются в пространстве. Диалог удаления показывает число задач (`ProjectDto.tasksCount`).

## Задачи

| Модель | Поля |
|--------|------|
| `Task` | `id` (UUID v7), `workspaceId`, `number` (сквозной в пространстве; показывается с ключом пространства `TSK-42`, без ключа — `#42`), `title`, `description` (простой текст), `priority` (`none` / `low` / `medium` / `high` / `urgent`), `dueDate` (дата без времени), `assigneeId`, `createdById`, `parentId` (родитель подзадачи, см. [Подзадачи](#подзадачи)) |
| `TaskPlacement` | Ключ `(taskId, projectId)`; `workspaceId`, `statusId`, `position` (дробный ключ) |
| `WorkspaceTaskCounter` | `workspaceId`, `lastNumber`: счётчик номеров задач |
| `TaskComment` | `id` (UUID v7), `workspaceId`, `taskId`, `authorId`, `body` (простой текст), `createdAt`, `editedAt` (см. [Комментарии](#комментарии)) |
| `TaskAttachment` | `id` (UUID v7), `workspaceId`, `taskId`, `target` (`task` / `comment`), `commentId`, `uploaderId`, `fileName`, `contentType`, `size`, `storageKey`, `status` (`pending` / `ready`) (см. [Вложения](#вложения)) |
| `TaskHistoryEntry` | `id` (UUID v7), `workspaceId`, `taskId`, `kind`, `actorId`, `viaTokenId`, `source` (`null` — человек или агент, `'github'` — система), `data` (снимок `from`/`to`) (см. [История изменений](#история-изменений)) |
| `TaskLabel` / `TaskLabelAssignment` | Метка пространства (`name`, `color`) и её связь с задачей (см. [Метки](#метки)) |
| `TaskWatcher` | Ключ `(taskId, userId)`; `workspaceId` (см. [Наблюдатели](#наблюдатели)) |
| `TaskDueReminder` | Отметка отправленного напоминания: `taskId`, `kind` (`due_soon` / `overdue`), `dueDate`, `sentAt`; уникальна по `(taskId, kind, dueDate)` (см. [Напоминания о сроке](#напоминания-о-сроке)) |

У `Task` (а также `Project` и `Workspace`) есть `archivedAt` и `archivedById` — см. [Архив](#архив).

- **Статус хранится только в размещении.** Задача может быть в нескольких проектах (до 20), в каждом — своё размещение со статусом и позицией. В `Task` статуса нет.
- **Целостность на уровне БД.** Размещение ссылается на задачу и проект составными ключами с `workspaceId`, а на статус — ключом `(statusId, projectId)`. Размещение не может оказаться в чужом пространстве или в статусе другого проекта. FK на статус — `NO ACTION`: статус с задачами без переноса не удалить, а каскад проекта проходит.
- **Номер задачи** выдаётся атомарно: `INSERT … ON CONFLICT DO UPDATE … RETURNING` в транзакции создания. Номера не переиспользуются. URL задачи — по номеру.
- **Порядок карточек** задают дробные ключи ([`fractional-indexing`](https://github.com/rocicorp/fractional-indexing)), поэтому перемещение карточки меняет одну строку. Ключи сравниваются побайтно: колонка `position` создана с `COLLATE "C"`. Новая карточка и смена статуса со страницы задачи ставят её в конец колонки, перетаскивание на доске — в место броска. При совпадении ключей (гонка) порядок определяет `taskId`.
- **Ответственный** — только участник пространства (`isWorkspaceMember` из `@/modules/workspaces`). Участника удаляет плагин Better Auth вне транзакций приложения, поэтому с задач его снимает триггер БД на `WorkspaceMember` (миграция `add_tasks`).
- **Права.** Любой участник создаёт, редактирует и архивирует задачи и меняет их размещения. Удалить навсегда можно только архивную задачу — автору или владельцу пространства.
- **Срок** — дата без времени (`@db.Date`), форматируется в UTC. Задача просрочена, если срок прошёл, а статус не в категории `done`. На доске и во вкладке «Список» проекта учитывается статус в этом проекте, в списке пространства — все размещения (задача вне проектов не считается выполненной).
- **Описание** выводится как текст (`whitespace-pre-wrap`), HTML не рендерится. Rich-text появится вместе с проектной документацией.

| Путь | Доступ |
|------|--------|
| `/w/[workspaceSlug]/tasks` | Участник: задачи пространства таблицей с фильтрами, сортировкой и страницами по 50 (см. [Список задач](#список-задач)) |
| `/w/[workspaceSlug]/tasks/new` | Участник: создание задачи на отдельной странице; `?projectId=` предвыбирает проект, `?parent=<номер>` создаёт подзадачу |
| `/w/[workspaceSlug]/tasks/[taskNumber]` | Участник: задача на весь экран (та же компоновка, что в панели): поля, метки, проекты и статусы, вложения, история (`?history=all` — вся), комментарии (`?comments=all` — все), архив. Некорректный номер или задача другого пространства → not found |
| `/w/[workspaceSlug]/settings/labels` | Участник: метки пространства (имя, цвет, число задач); правка и удаление — с правом `manageProjects` |

Карточки доски отдаёт `getBoardCards()` (один запрос), статусы всех проектов для селектов — `listWorkspaceStatuses()` из `@/modules/projects`.

### Панель задачи

Доска, «Список» проекта и `/tasks` открывают задачу в панели справа, не уходя со страницы. Состояние панели живёт в адресе: `?task=<номер>` — просмотр, `?task=new` — создание, `?task=new&parent=<номер>` — создание подзадачи. Ссылкой можно поделиться, после перезагрузки панель снова открыта. Остальные параметры (фильтры и сортировка списка) сохраняются.

- **Код** — `src/components/tasks/task-panel/`. Чистые функции адресов (`task-panel-href.ts`: `parseTaskPanelParam`, `taskPanelHref`) покрыты тестами. Мусор в `?task` закрывает панель, удалённая или чужая задача показывает «Задача не найдена» внутри панели, а не 404 всей страницы.
- **Рендер.** Layout не получает `searchParams`, поэтому `<TaskPanel>` рендерит сама страница в собственной границе `Suspense`: доска и список её не ждут. `TaskDetailsView` и `TaskCreateView` — общая компоновка для панели (`variant="panel"`) и полноэкранных страниц (`variant="page"`).
- **Раскладка.** На `lg+` панель — колонка `--task-panel-w` под шапкой со своей прокруткой. Страница сужается (`main:has([data-task-panel])` в `globals.css`), левый край остаётся вровень с шапкой. На меньших экранах панель открывается поверх страницы на весь экран. `Esc` закрывает панель, если его не перехватили select, меню, диалог или поле в режиме правки.
- **Компоновка.** Тулбар (ключ, «Сохраняем… / Сохранено», «Скопировать ссылку», «Развернуть», «⋯» → удаление, «Закрыть»), родительские задачи (хлебные крошки), проекты, название, свойства «подпись — значение» (ответственный, срок, приоритет, проекты со статусом, родитель), описание, подзадачи, вложения, лента комментариев. Форма комментария закреплена внизу; её кнопки появляются при фокусе.
- **Режим чтения полей** (`task-fields.tsx`). В покое у поля нет рамки, фона, стрелки и маски даты: задача читается как документ. При наведении появляются лёгкая обводка и курсор, при фокусе и открытом списке — обычное поле. `hover:` в Tailwind v4 работает только на устройствах с наведением, поэтому на тач-экранах нажатие сразу открывает выбор. Срок в покое — текст даты, по нажатию — `input type=date` с `showPicker()`. `components/ui` не меняется: классы переопределяются снаружи.
- **Автосохранение.** Каждое поле отправляется отдельно через `updateTaskAction` (частичное обновление): select и срок — при выборе, название и описание — при blur, Enter / Ctrl+Enter. Неизменённое значение не отправляется, пустое название возвращает прежнее, `Esc` в поле отменяет правку. При ошибке — toast и откат значения.
- **Возврат после создания и удаления.** Формы панели передают скрытое поле `returnTo` — адрес страницы без `task`. `createTaskAction` переходит на `returnTo` с `task=<новый номер>`, `deleteTaskAction` — на `returnTo` без панели. `parseReturnPath()` (`slices/task/task-redirect.ts`) принимает только относительный путь внутри `/w/<slug>` текущего пространства: без схемы, `//`, `\`, `..`, `%2e` и управляющих символов. Иначе используется прежний адрес (`/tasks/<n>` или `/tasks`), а в лог пишется `warn` `[tasks.actions] returnTo rejected`.

### Подзадачи

Подзадача — обычная задача с родителем `Task.parentId`: свой номер, поля, комментарии, вложения, документы и связи с GitHub. У подзадачи могут быть свои подзадачи.

- **Целостность на уровне БД.** Связь с родителем — составной FK `(parentId, workspaceId) → Task(id, workspaceId)` с `ON DELETE CASCADE`: подзадача не может оказаться в чужом пространстве, удаление задачи удаляет всё поддерево. `CHECK` запрещает задаче быть родителем самой себе (миграция `add_task_parent`).
- **Глубина и циклы** — правила модели `models/task-tree.ts`: до `TASK_MAX_DEPTH = 10` уровней, до `TASK_SUBTASKS_LIMIT = 200` прямых подзадач. При смене родителя новый родитель не может быть самой задачей или её потомком, глубина считается с учётом высоты переносимого поддерева.
- **Дерево в запросах** — рекурсивные CTE в `slices/subtask/subtask.repository.ts` (цепочка до корня, предки, поддерево, высота). `workspaceId` проверяется на каждом шаге рекурсии, глубина рекурсии ограничена `TASK_MAX_DEPTH + 1`.
- **Конкурентность.** Создание подзадачи и смена родителя идут в транзакции под `pg_advisory_xact_lock(hashtext('tasks-tree:<workspaceId>'))`, как изменения дерева папок документов. При создании блокировка берётся до счётчика номеров.
- **Доска — по желанию.** По умолчанию подзадача не размещена ни в одном проекте. «Вывести на доску» — обычное размещение (`addToProjectAction`): у подзадачи свой статус в каждом проекте, независимый от родителя. Полная форма (`?task=new&parent=<номер>`) позволяет сразу выбрать проект и статус.
- **Статус родителя не вычисляется.** В задаче и на карточке показывается прогресс «выполнено N из M» по прямым подзадачам. Подзадача выполнена по общему правилу (`isTaskOpen`): размещения есть, и все в категории `done`. Прогресс для доски считается одним запросом (`getSubtaskProgress`) только по карточкам, у которых есть подзадачи.
- **Удаление.** Право проверяется для удаляемой задачи (автор или владелец). Строки поддерева удаляет каскад, ключи вложений всего поддерева собираются заранее, объекты хранилища удаляются после строк. Диалог подтверждения показывает число подзадач всех уровней (`TaskDto.descendantCount`).
- **Права.** Менять родителя может любой участник пространства, как и другие поля задачи.

| Действие | Сервер | Интерфейс |
|----------|--------|-----------|
| Создать подзадачу | `createTask({ parentId })` (`createTaskSchema.parentId`) | Раздел «Подзадачи»: поле «+ Подзадача» (Enter) или «Подробная форма» |
| Сменить родителя / отвязать | `setTaskParentAction` → `setTaskParent()` | Свойство «Родитель» (поиск `searchParentCandidatesAction` без самой задачи и её поддерева), «Отвязать от задачи» в меню строки |
| Вывести на доску | `addToProjectAction` | «Вывести на доску…» в меню строки подзадачи: проект родителя выбран сразу |
| Прочитать | `listSubtasks()`, `TaskDto.ancestors` / `subtaskProgress` / `descendantCount` | Хлебные крошки над названием, список подзадач с прогрессом |

Компоненты — `src/components/tasks/subtasks/`: `TaskSubtasksSection`, `SubtaskRow`, `AddSubtaskForm`, `ParentPicker`, `TaskBreadcrumbs`. Ссылки на подзадачи и родителя открывают задачу в той же панели или на странице задачи (`taskHref` из `TaskDetailsView`). На карточке доски и в строке списка у подзадачи — метка «↳ TSK-12 Название родителя», на карточке задачи с подзадачами — «2/5».

### Перемещение карточек на доске

Сервер — `movePlacementAction({ workspaceId, taskId, projectId, statusId, prevTaskId })` → `movePlacement()` в срезе `placement`:

| Шаг | Что происходит |
|-----|----------------|
| Якорь | Клиент присылает только `prevTaskId` — карточку прямо над местом броска (`null` — верх колонки). Следующую карточку сервер находит сам, поэтому противоречивую пару соседей прислать нельзя |
| Позиция | Колонка читается одним запросом и сортируется `comparePositions`. Новая позиция — `positionBetween(prev, next)`, правило вынесено в модель `resolveMovePosition()`. Меняется одна строка |
| Без изменений | Та же колонка и тот же сосед сверху — ничего не пишется |
| Равные ключи | Если у соседей одинаковые позиции (гонка вставок, слияние колонок при удалении статуса), колонка в той же транзакции перенумеровывается (`rekeyColumn`), `WARN [placement] column rekeyed` |
| Устаревшая доска | Якоря нет в целевой колонке → `CONFLICT` «Доска изменилась, порядок обновлён» |
| Статус удалён | Статус удалили одновременно с броском: FK размещения на статус (P2003) → `NOT_FOUND` |

Правило «статус принадлежит проекту размещения» проверяет `TaskPlacement.moveTo()`. Двигать карточки может любой участник пространства.

Клиент — `KanbanBoard` (`src/components/tasks/kanban-board.tsx`) на `@dnd-kit/core` + `@dnd-kit/sortable`:

- **Оптимистичное состояние.** Карточки лежат в локальном состоянии. При переносе между колонками карточка переходит в новую колонку ещё во время перетаскивания. Новые данные сервера после `revalidatePath` заменяют локальное состояние. При ошибке доска возвращается к данным сервера, показывается toast и вызывается `router.refresh()`. Логика переноса — чистые функции `moveCard()` / `prevTaskIdAt()` из `@/modules/tasks/client`.
- **Ввод.** Указатель — перетаскивание после сдвига на 6px, касание — после удержания 200 мс. Клик и `Enter` открывают задачу, клик сразу после броска гасится. Клавиатура: `Space` — взять или бросить, стрелки — переместить, `Esc` — отменить.
- **Доступность.** Объявления скринридера и инструкции на русском (`board-announcements.ts`). При `prefers-reduced-motion` анимации переноса отключены. У `DndContext` стабильный `id` (`useId`), чтобы не было расхождений при гидрации.
- **Ограничения.** Колонки (статусы) перетаскивать нельзя, их порядок меняется в настройках проекта. Изменения других пользователей видны только после навигации или обновления страницы.

### Список задач

Три страницы показывают одни и те же компоненты (`src/components/tasks/task-list/`) в разных режимах (`TaskListScope`):

| Режим | Страница | Строки | Сортировка по умолчанию |
|-------|----------|--------|-------------------------|
| `workspace` | `/w/[workspaceSlug]/tasks` | Задачи пространства (`listTasks`) | Номер ↓ — новые сверху |
| `project` | `/w/[workspaceSlug]/projects/[projectId]/list` | Размещения проекта (`listProjectTasks`) | Статус ↑ — как на доске: колонка, позиция, `taskId` |
| `mine` | `/my-tasks` | Открытые задачи, где я ответственный, во всех моих активных пространствах (`listMyTasks`) | Срок ↑ |

**Состояние — в URL.** Фильтры, сортировка и страница хранятся в `searchParams`, поэтому ссылкой можно поделиться, а «назад» отменяет последний фильтр. Модель запроса `TaskListQuery` (`models/task-list-query.ts`) общая для клиента и сервера: `parseTaskListParams()` разбирает параметры нестрого (некорректные значения отбрасываются, ошибки нет), `serializeTaskListParams()` собирает адрес без значений по умолчанию.

| Параметр | Значения | Режим |
|----------|----------|-------|
| `q` | Подстрока названия (без учёта регистра) или номер `#42` / `42`, до 100 символов | все |
| `project` | id проектов, `none` — вне проектов | `workspace` |
| `workspace` | id моих пространств; чужие отбрасываются при запросе | `mine` |
| `category` | `todo`, `in_progress`, `done` — хотя бы одно размещение в статусе этой категории; `none` — вне проектов. В `mine` без фильтра показываются только открытые | `workspace`, `mine` |
| `status` | id статусов проекта | `project` |
| `priority` | `none`, `low`, `medium`, `high`, `urgent` | все |
| `assignee` | id участников, `me`, `none` — не назначен | `workspace`, `project` |
| `due` | `overdue`, `today`, `week` (сегодня + 6 дней), `none` — без срока | все |
| `level` | `top` — только задачи верхнего уровня (без подзадач); у подзадач в строке — метка «↳ TSK-12» родителя | все |
| `label` | id меток — задачи с любой из них | `workspace`, `project` |
| `archived` | `1` — только архивные задачи (переключатель «Архив»); без параметра архивные скрыты | `workspace`, `project` |
| `sort`, `dir` | `number`, `title`, `priority`, `due` (пустые сроки всегда в конце), `status` (только `project`); `asc` / `desc` | все |
| `page` | Номер страницы с 1; за пределами — последняя | все |

Списки значений передаются через запятую: `?priority=high,urgent&assignee=me,none`. В одном фильтре — до 20 значений. Любое изменение, кроме номера страницы, возвращает на первую страницу.

- **Сервер.** Чтение — в срезе `views`. Условия `where` и `orderBy` строят чистые функции `task-list.prisma.ts`, `workspaceId` входит в каждое условие. Число строк и страница читаются одной транзакцией (`count` + `findMany` со `skip`/`take`). При равных значениях сортировки порядок задаёт номер задачи. Приоритет сортируется по порядку значений enum `TaskPriority` в Postgres, поэтому новые значения добавляются только в конец.
- **Клиент.** `TaskListShell` получает уже разобранный запрос от страницы (без `useSearchParams`) и переходит по новому адресу внутри `useTransition`. Выбранные значения отмечаются сразу (`useOptimistic`), а таблица на время загрузки приглушается (`data-pending`). Поиск применяется через 300 мс и заменяет запись в истории (`router.replace`), фильтры и сортировка добавляют новую.
- **«Мои задачи».** Пространства — `listMyWorkspaces` (неархивные), пересечённые с `workspace=` из URL. Условие: `assigneeId` — я, `archivedAt IS NULL`, без фильтра категории — общий `openTaskWhere()` (нет размещений или хотя бы одно не «Готово»; его же используют сводка участника и обзор). Строка знает своё пространство (колонка «Пространство») и ведёт на `/w/<slug>/tasks/<номер>`: панели задачи здесь нет. Ссылки — пункт меню пользователя, кнопка на главной, команда палитры и `g m`.
- **Ограничения.** Поиск `ILIKE` не использует индекс. Пагинация — offset: при одновременных изменениях строки могут сдвинуться между страницами.

### Сохранённые фильтры

Кнопка «Фильтры» в тулбаре списка (`saved-views-menu.tsx`): список сохранённых, «Сохранить текущий…» (доступно при активных фильтрах), переименование и удаление. Фильтры личные: их видит только автор.

- **Модель.** `SavedTaskView`: `userId`, `scope` (`workspace` / `project` / `mine`), `workspaceId` и `projectId` (составной FK на `Project`), `name` (1–40), `params` (до 2 000 символов), `position`. CHECK в миграции: `mine` ⇔ без пространства, `project` ⇔ с проектом. Имя уникально в области без учёта регистра — частичный индекс по `COALESCE` nullable-колонок. Триггер на удаление из `WorkspaceMember` удаляет фильтры ушедшего участника в этом пространстве; проект и пространство удаляют свои каскадом.
- **Параметры.** Хранится каноническая строка `canonicalViewParams()` = `serializeTaskListParams(parseTaskListParams(…))` без `page`: чужие и некорректные параметры отбрасываются, порядок ключей стабилен. Фильтр отмечен активным, когда текущие параметры совпадают со строкой.
- **Сервис** (`slices/saved-view`). Для `workspace` и `project` — `requireWorkspaceAccess`, проект проверяется через `getProject` (чужой — `NOT_FOUND`). До 20 фильтров в области; дубликат имени — ошибка поля `name`. Переименовать и удалить можно только свой фильтр (условие с `userId`, чужой — `NOT_FOUND`).

### Экспорт в CSV

Кнопка «Экспорт CSV» в тулбаре списка пространства и вкладки проекта — обычная ссылка `download` на `GET /api/w/[workspaceSlug]/tasks/export` с текущими параметрами без `page` (см. [HTTP-эндпоинты](#get-apiwworkspaceslugtasksexport)).

- **Сервис** `exportTasks` (срез `views`): те же `where` и `orderBy`, что у страницы, без пагинации, `take` = 10 000 + 1 — лишняя строка означает, что файл обрезан (`truncated`).
- **Формат** (`models/task-csv.ts`): UTF-8 с BOM, разделитель `;` (русская локаль Excel), строки через `
`. Колонки: Ключ, Название, Статус («Проект: статус» через запятую), Приоритет, Ответственный, Срок, Метки, Родитель, Создана, Обновлена (ISO, UTC), Ссылка (от `BETTER_AUTH_URL`).
- **Formula injection.** Текст, начинающийся с `=`, `+`, `-`, `@`, табуляции или ``, получает префикс `'`, поэтому Excel и Google Таблицы не выполняют его как формулу.

### Комментарии

Обсуждение задачи — блок «Комментарии» внизу её страницы и панели. Срез `slices/comment` модуля `tasks`, правила — в модели `models/task-comment.ts`.

| Действие | Кто может | Server Action |
|----------|-----------|---------------|
| Читать и добавлять | Любой участник пространства | `createCommentAction` |
| Редактировать текст | Только автор (владелец пространства — нет) | `updateCommentAction` |
| Удалить | Автор или владелец пространства | `deleteCommentAction` |

- **Целостность на уровне БД.** Комментарий ссылается на задачу составным ключом `(taskId, workspaceId)` и не может оказаться в чужом пространстве. Удаление задачи удаляет её комментарии (каскад). Удаление пользователя оставляет комментарии с `authorId = null` («Удалённый пользователь»): редактировать их нельзя, удалить может владелец. Выход участника из пространства комментарии не трогает.
- **Защита от IDOR.** Каждая операция начинается с `requireWorkspaceAccess`. Комментарий ищется по `id` + `taskId` + `workspaceId`; изменение и удаление идут через `updateMany` / `deleteMany` с тем же условием. Чужой или исчезнувший комментарий → `NOT_FOUND`, невалидный UUID отсекается без запроса к БД.
- **Текст** — простой, до 5000 символов; пустой допустим, только если у комментария есть файлы (см. [Вложения](#вложения)). `normalizeCommentBody()` убирает пробелы по краям и в концах строк, приводит переводы строк к `\n` и оставляет не больше одной пустой строки подряд. Выводится как текст (`whitespace-pre-wrap`), HTML не рендерится. Отметка «изменён» — отдельное поле `editedAt`: `updatedAt` меняется при любом `update`, а сохранение того же текста ничего не пишет.
- **Лента.** `listTaskComments(session, workspaceId, taskId, { all })` отдаёт комментарии от старых к новым. По умолчанию — последние 50 (`TASK_COMMENTS_PAGE_SIZE`) и ссылка «Показать все (N)» на `?comments=all`. Число и строки читаются одной транзакцией, права `canEdit` / `canDelete` вычисляются на сервере.
- **Обновление.** Actions ревалидируют layout пространства (`revalidatePath('/w/[workspaceSlug]', 'layout')`): лента видна и на странице задачи, и в панели поверх доски и списков.
- **Клиент** (`src/components/tasks/comments/`). Блок загружается в отдельном `<Suspense>` и не задерживает поля задачи. Даты форматируются в серверном `CommentList` и передаются в клиентский `CommentItem` строками, чтобы часовой пояс браузера не вызывал расхождений при гидрации. `Ctrl/⌘+Enter` отправляет форму, `Esc` отменяет правку. Форма добавления после успеха сбрасывается встроенным сбросом React, при ошибке текст возвращается в поле.
- **Логи.** `tasks.comment`: `INFO` на создание, правку и удаление (с длиной текста и `byOwner`), `WARN` на «не найдено» и отказ в правах, `DEBUG` с числом упоминаний и получателей уведомлений. Текст комментария в логи не попадает.
- **Ограничения.** Без Markdown. `?comments=all` загружает всё без пагинации. Изменения других пользователей видны после навигации или обновления страницы.

#### @Упоминания

- **Подсказка.** После `@` под полем (в закреплённой форме панели — над ним) открывается список участников пространства. У проектов нет своего состава, поэтому кандидаты — все участники. Набранные буквы фильтруют список: сначала совпадение начала имени, потом начала любого слова имени, потом начала email, потом вхождение (без учёта регистра и «ё/е»). `↑`/`↓` — выбор, `Enter` или `Tab` — вставить `@Имя Фамилия `, `Esc` закрывает только подсказку. Поле — `role="combobox"` со списком `role="listbox"`.
- **Хранение.** Упоминание — обычный текст `@Имя`, без скрытой разметки. `extractMentions(body, members)` (`models/comment-mentions.ts`) после каждого `@` на границе слова ищет самое длинное совпадение с именем участника или локальной частью его email, за которым не идёт буква или цифра. Поэтому выбор из подсказки и ручной ввод работают одинаково, а `user@mail.ru` упоминанием не считается.
- **Отображение.** `TaskCommentDto.mentions` — диапазоны `{ start, end, userId }` по текущему составу пространства. `CommentItem` выделяет их и показывает карточку участника при наведении.
- **Уведомления.** `resolveCommentRecipients()`: упомянутые получают `mention`, ответственный и автор задачи — `task_comment` (если их не упомянули), автор комментария не получает ничего. При правке уведомляются только новые упоминания. Отправка — после сохранения комментария, сбой уведомлений комментарий не отменяет (см. [Уведомления](#уведомления)).
- **Ограничение.** Два участника с одинаковым именем неразличимы: упоминание достаётся первому. Упоминание по email-префиксу (`@ivan.petrov`) работает, но подсказка вставляет имя.

### Вложения

Файлы прикрепляются к задаче (блок «Вложения» на её странице) и к новому комментарию. Срез `slices/attachment` модуля `tasks`, правила — в модели `models/task-attachment.ts`, работа с S3 — в `@/shared/storage`.

| Ограничение | Значение |
|-------------|----------|
| Размер файла | до 25 МБ (`ATTACHMENT_MAX_SIZE`) |
| Файлов в блоке задачи / в комментарии | 20 / 10 |
| Типы | по расширению: `png jpg jpeg gif webp svg pdf txt md csv json zip doc docx xls xlsx ppt pptx odt ods odp` |
| Миниатюры | PNG, JPEG, GIF, WebP. SVG и остальные типы только скачиваются |

**Загрузка идёт из браузера прямо в хранилище**, файл не проходит через сервер приложения:

1. `requestAttachmentUploadAction` проверяет доступ, задачу, тип, размер и лимит. Затем создаёт строку `pending` и возвращает presigned POST на 5 минут. Политика POST фиксирует ключ, `Content-Type` и точный размер, поэтому другой файл хранилище не примет.
2. Браузер отправляет `multipart/form-data` на `S3_PUBLIC_ENDPOINT` (`XMLHttpRequest`, с прогрессом). Одновременно загружаются не больше трёх файлов.
3. `completeAttachmentUploadAction` вызывает `HeadObject` и сверяет размер. У картинок дополнительно проверяется сигнатура по первым 16 байтам. Если проверка не прошла, объект и строка удаляются, пользователь видит ошибку. Иначе статус меняется на `ready`.

**Скачивание** — `GET /api/attachments/[attachmentId]` (см. [HTTP-эндпоинты](#get-apiattachmentsattachmentid)): проверка доступа и редирект 302 на presigned GET со сроком 60 секунд.

| Действие | Кто может | Server Action |
|----------|-----------|---------------|
| Прикрепить к задаче или комментарию | Любой участник пространства | `requestAttachmentUploadAction`, `completeAttachmentUploadAction` |
| Скачать | Любой участник; черновик — только загрузивший | — |
| Удалить | Загрузивший или владелец пространства; черновик — только загрузивший | `deleteAttachmentAction` |

- **Тип файла** определяется по расширению из allowlist, `file.type` браузера игнорируется: на Windows CSV приходит как `application/vnd.ms-excel`, а у части файлов тип пустой. `Content-Type` ответа берётся из БД.
- **Имя файла** санитизируется (`sanitizeFileName`): путь, управляющие символы и кавычки убираются, имя приводится к NFC и обрезается до 200 символов с сохранением расширения. В ключ хранилища имя не попадает. Ключ имеет вид `ws/<workspaceId>/tasks/<taskId>/<случайный UUID>`.
- **Защита от XSS через файлы.** Файлы отдаются с origin хранилища, а не приложения. SVG отдаётся только с `Content-Disposition: attachment`, `inline` разрешён лишь картинкам с проверенной сигнатурой. Имя в заголовке кодируется по RFC 5987 (`filename*=UTF-8''…`).
- **Целостность на уровне БД.** Вложение ссылается на задачу ключом `(taskId, workspaceId)` и на комментарий ключом `(commentId, taskId)`, поэтому не может оказаться в чужом пространстве или в комментарии другой задачи. `CHECK` запрещает `commentId` у вложения блока задачи. Удаление пользователя оставляет файлы с `uploaderId = null`.
- **Файлы комментария.** Форма загружает файлы сразу, получаются черновики (`target = comment`, `commentId = null`), которые видит только загрузивший. `createCommentAction` принимает их `attachmentId` и в одной транзакции создаёт комментарий и привязывает черновики. Если привязалось меньше файлов, чем передано, комментарий не создаётся. Добавить файлы к уже отправленному комментарию нельзя. Удалять отдельные файлы можно в режиме правки, кроме последнего файла комментария без текста.
- **Удаление объектов.** Строки вложений удаляются каскадом вместе с задачей и комментарием. Объекты хранилища удаляют `deleteTask`, `deleteComment` и `deleteAttachment`, уже после удаления строк (`DeleteObjects` пачками по 1000). Сбой хранилища не ломает операцию пользователя: остаётся «сирота», а в лог пишется `ERROR`.
- **Ленивая очистка.** При каждом запросе слота загрузки удаляются неподтверждённые загрузки и неотправленные черновики этого пользователя старше 24 часов, не больше 50 за раз.
- **Обновление.** Подтверждение файла задачи и удаление ревалидируют layout пространства — страницу задачи и панель поверх доски и списков. Черновики комментария страницу не меняют.
- **Логи.** `tasks.attachment`: `INFO` на выдачу слота, подтверждение, удаление и очистку; `WARN` на отказ с причиной (`type`, `size`, `limit`, `size-mismatch`, `signature`, `missing-object`), «не найдено» и запрет; `ERROR` на сбой очистки хранилища. Подписанные URL и поля политики в логи не попадают, из имени файла пишется только расширение.
- **Ограничения.** Лимит на задачу проверяется без блокировки: две параллельные загрузки могут превысить его на 1–2 файла. Объекты, оставшиеся после сбоя `DeleteObjects`, ленивая очистка не находит. При удалении пространства объекты пока не удаляются. Антивирусной проверки и превью PDF и офисных файлов нет.

### История изменений

Срез `tasks/slices/history`. Каждое изменение задачи пишет запись `TaskHistoryEntry` **в той же транзакции**, что и само изменение: сбой записи откатывает изменение.

| Вид (`kind`) | Когда | Данные |
|--------------|-------|--------|
| `created` | Создание задачи | — |
| `title`, `priority`, `due_date` | Правка поля | `{ from, to }` |
| `description` | Правка описания | Только было ли описание до и после — текст не хранится |
| `assignee` | Смена ответственного | `{ from, to }` — `{ id, name }` участника |
| `status` | Смена статуса (пользователь, агент, автосмена GitHub; перенос в другую колонку на доске) | Проект и оба статуса по именам. Перенос внутри колонки не пишется |
| `project_added`, `project_removed` | Добавление в проект и удаление из него | Проект |
| `parent` | Смена родителя | Ключ и название родителя до и после |
| `labels` | Смена меток | `{ added, removed }` |
| `archived`, `restored` | Архив и восстановление (у корневой задачи операции) | — |

- **Снимок имён.** В `data` лежат имена (статусов, проектов, участников, меток), а не только id: история переживает переименования и удаления — как payload уведомлений. Схемы `data` по виду — `models/task-history.ts` (Zod); некорректная запись при чтении пропускается.
- **Слияние.** Подряд идущие правки одного поля (`title`, `description`, `priority`, `due_date`) одним автором через один и тот же токен в пределах 5 минут сливаются: `from` остаётся от первой правки, `to` обновляется (`shouldMergeHistory`, `mergeHistoryChange`).
- **Автор.** `actorId` и `viaTokenId` из сессии: правка по личному токену MCP показывается с пометкой «через Claude Code». Системные изменения (автосмена статуса GitHub) — `source: 'github'`, автор «Система (GitHub)».
- **Интерфейс.** Секция «История» в панели и на странице задачи — между GitHub и комментариями: последние 20 записей, «Показать всю историю» — `?history=all`. Строка — аватар, автор, текст (`describeHistoryChange`) и относительное время.
- **MCP.** `get_task_history` (до 50 записей) и 5 последних записей в `get_task`. Комментарии и вложения в историю не попадают: у них своя лента.

### Метки

Срез `tasks/slices/label`, по образцу тегов документов.

- **Метка** — `TaskLabel` пространства: имя (1–32 символа, уникально без учёта регистра) и цвет из палитры статусов. До 100 меток в пространстве и до 10 на задаче.
- **Права.** Создать метку прямо из задачи может любой участник. Переименовать, сменить цвет и удалить — с правом `manageProjects` в `/w/[workspaceSlug]/settings/labels` (без права страница только показывает метки).
- **Где видно.** Свойство «Метки» в задаче (Popover с поиском, отметкой и «Создать „…“»), до 3 меток на карточке доски («+N» — остальные), колонка и фильтр в списке задач (`label=<id>,<id>` — задачи с любой из меток).
- **Изменение** — `setTaskLabels` в транзакции: метки только из этого пространства, история `labels`.
- **MCP.** `update_task` с `labels` — полный набор по именам, недостающие метки создаются; `list_tasks` фильтрует по `labels`.

### Наблюдатели

Срез `tasks/slices/watcher`. Наблюдатели (`TaskWatcher`) получают уведомления о комментариях (`task_comment`), смене статуса (`task_status_changed`) и о просрочке (`task_overdue`).

- **Автоподписка:** автор задачи, назначенный ответственный, автор комментария и упомянутые в нём. Агенты пространства не подписываются: их уведомления получает ответственный за агента.
- **Вручную:** кнопка «Следить / Вы следите» с числом наблюдателей в тулбаре задачи, по клику — список наблюдателей. Подписаться и отписаться можно только за себя.
- **Смена статуса** уведомляет всех наблюдателей, кроме автора действия; при автосмене GitHub (автора нет) — всех.
- **Выход из пространства** снимает наблюдение триггером БД на `WorkspaceMember` (миграция `add_task_watchers`), как у ответственного.

### Архив

Удаление заменено архивом: архивные сущности скрыты из списков, но открываются по ссылке только для чтения и восстанавливаются. «Удалить навсегда» доступно только у архивной сущности.

| Что | Кто архивирует | Что происходит |
|-----|----------------|----------------|
| Задача | Любой участник | Вся ветка подзадач получает один `archivedAt`; восстановление возвращает задачи этой операции. Скрыта с досок, из списков (кроме переключателя «Архив», `archived=1`), поиска, MCP `list_tasks` и автосмены статуса GitHub. По ссылке — баннер «В архиве с … (кто)», поля только для чтения, без формы комментария. Любое изменение архивной задачи → `VALIDATION_ERROR` (`assertTaskActive`). Подзадачу архивного родителя отдельно не восстановить |
| Проект | Право `manageProjects` (раздел «Архив» в настройках проекта) | Скрыт из списков и фильтров, не предлагается в «Добавить в проект». Доска — баннер, без перетаскивания и быстрого создания; размещения задач сохраняются. Добавить задачу в архивный проект или сменить в нём статус нельзя |
| Пространство | Владелец (подтверждение названием) | Заморожено: guard-функции отвечают `NOT_FOUND`, кроме настроек у владельца (`allowArchived`). Токены MCP не работают, вебхуки GitHub и напоминания его пропускают. На главной — раздел «Архивные пространства» с «Восстановить» и «Удалить навсегда» |

MCP: `archive_task` / `restore_task` (область `tasks`), `list_tasks` с `archived: true` — только архивные.

### Напоминания о сроке

Срез `tasks/slices/reminder` — системная функция `sendDueReminders({ now, timeZone })` без сессии. Её вызывает только `POST /api/cron/reminders` с проверенным секретом планировщика (см. [HTTP-эндпоинты](#post-apicronreminders)).

- **Кому.** `task_due_soon` — срок завтра, ответственному. `task_overdue` — срок раньше сегодняшнего, ответственному и наблюдателям. «Сегодня» и «завтра» считаются в `REMINDERS_TIMEZONE` (`reminderDates`).
- **Какие задачи.** Не в архиве, пространство не в архиве, есть ответственный, задача открыта (нет размещений или хотя бы в одном проекте статус не «Готово»).
- **Один раз.** Перед уведомлением вставляется `TaskDueReminder` (`createManyAndReturn` с `skipDuplicates`, уникальность `(taskId, kind, dueDate)`), уведомление уходит только по реально вставленным строкам. Повторный запуск в тот же день ничего не шлёт, а перенос срока даёт новое напоминание.
- **Порции.** По 200 задач по курсору `id`; сбой порции логируется (`[reminders] batch failed`) и не прерывает остальные. Ответ — `{ dueSoon, overdue, skipped, failedBatches }`.
- **Каналы** по умолчанию — в приложении и письмом (настраиваются в профиле). `notify` вызывается отдельно на каждую задачу: модуль уведомлений маршрутизирует агентов по пространству события.

## Обзор пространства

Страница `/w/[workspaceSlug]/overview` — первая вкладка шапки («Обзор»). Её видит любой участник.

- **Данные.** `getWorkspaceDashboard(session, workspaceId)` (срез `tasks/slices/dashboard`) делает одну транзакцию: счётчики, `groupBy` по ответственным и проектам, просроченные задачи (до `DASHBOARD_OVERDUE_LIMIT = 8`). Сборка и сортировка — чистая `buildDashboard` в `models/dashboard.ts`. «Сегодня» считается в часовом поясе напоминаний (`REMINDERS_TIMEZONE`).
- **Счётчики.** Открыто, просрочено, срок на неделе (сегодня + 6 дней), без ответственного, закрыто за 7 дней (задача выполнена, и её размещение в статусе `done` обновлено за неделю). Каждое число — ссылка на список задач с тем же фильтром (`dashboardTasksHref`).
- **Блоки.** Нагрузка по участникам и открытые задачи по проектам — полосы одного цвета на общей шкале, число рядом с полосой; просрочка — текстом с иконкой, не только цветом. Список просроченных задач открывает панель задачи.
- **Обновление.** `LiveRefresh tasksOnly` с задержкой 2 с: обзор пересчитывается после изменений задач в пространстве.
- **Пустое пространство** — подсказка и кнопка создания проекта.

## Обновления в реальном времени

Доска, списки задач, обзор и панель задачи обновляются сами, когда задачу меняет другой участник или агент.

```
сервис задач ──pg_notify('tasker_events')──▶ Postgres ──LISTEN──▶ hub (один на процесс)
                                                                    │
                       /api/realtime/w/[slug] (SSE) ◀──подписка─────┘
                                │
              RealtimeProvider (EventSource) ──▶ useLiveRefresh ──▶ router.refresh()
```

- **Публикация.** Срез `tasks/slices/realtime` (`task-events.service.ts`) после успешной записи вызывает `pg_notify` для создания, изменения и архивации задачи, перемещения размещений, комментариев и вложений. Ошибка публикации логируется и не ломает операцию.
- **Событие** (`src/shared/realtime/realtime-event.ts`, схема Zod, `v: 1`) содержит только идентификаторы: `workspaceId`, `kind`, `taskId`, `taskNumber`, `projectIds`, `actorId`, `at`. Текстов задач и комментариев в канале нет — клиент перечитывает данные обычными запросами с проверкой доступа. Payload ограничен 7500 байтами (лимит `pg_notify` — 8000): лишние `projectIds` отбрасываются, и событие получает `truncated: true`.
- **Hub** (`hub.ts`, `listener.ts`) держит одно `LISTEN`-подключение `pg` на процесс (singleton через `globalThis`, чтобы HMR не плодил подключения) и раздаёт события подписчикам по `workspaceId`. Без подписчиков подключение закрывается через 60 с. При обрыве — переподключение с задержкой от 1 до 30 с, после восстановления подписчики получают `resync` (события за время разрыва могли потеряться).
- **SSE** (`sse.ts`): не больше 6 потоков на пользователя (7-й — `429`), `retry: 5000`, комментарий-пинг каждые 25 с (прокси не рвут соединение). Раз в 5 минут доступ к пространству проверяется заново; если его нет, поток получает событие `revoked` и закрывается.
- **Клиент.** `RealtimeProvider` в layout пространства открывает один `EventSource`. Страницы подписываются через `useLiveRefresh` / `<LiveRefresh>` с фильтром (`projectId`, `taskId`, `tasksOnly`) и задержкой: по умолчанию 400 мс, списки — 1 с, обзор — 2 с. Несколько событий подряд дают один `router.refresh()`. Доска откладывает обновление, пока карточку перетаскивают. Свои изменения тоже приходят — обновление идемпотентно.
- **Несколько экземпляров приложения** получают события через общий Postgres, отдельный брокер не нужен. На проде прокси не должен буферизовать поток — см. [«Реалтайм через Caddy»](production.md#реалтайм-через-caddy).

## Горячие клавиши

Каталог — `src/components/hotkeys/shortcuts.ts` (`SHORTCUTS`): одна запись служит обработчику, справке и подсказкам у кнопок. Разбор и сопоставление — `src/lib/hotkeys.ts`, подписка — хук `useHotkeys` (`src/lib/use-hotkeys.ts`).

| Клавиши | Действие | Где |
|---------|----------|-----|
| `?` | Справка по клавишам | Везде (также пункт «Горячие клавиши» в меню пользователя) |
| `Ctrl/⌘ K` | Поиск и команды | Везде |
| `C` | Новая задача | В пространстве |
| `/` | Поиск в списке задач | Списки задач |
| `G` → `O` / `P` / `T` / `D` | Обзор, Проекты, Задачи, Документы | В пространстве |
| `G` → `M` | Мои задачи | Везде |
| `G` → `H` | Справка | Везде |
| Стрелки, `Enter`, `Space` | Выбор карточки, открыть задачу, взять и положить карточку | Доска |
| `J` / `K` | Следующая / предыдущая задача | Панель задачи |
| `I` | Назначить на себя | Панель задачи |
| `S`, `P`, `D`, `L`, `A` | Статус, приоритет, срок, метки, ответственный | Панель задачи |
| `W` | Следить / не следить | Панель задачи |
| `Esc` | Закрыть панель | Панель задачи |

- **Раскладка.** Сравнение идёт по `event.code` (физическая клавиша), поэтому клавиши работают и в русской раскладке.
- **Последовательности** (`G`, затем `T`) ждут вторую клавишу 1 с.
- **Поля ввода и диалоги.** В полях ввода (`input`, `textarea`, `select`, `contenteditable`) и при открытом диалоге клавиши не срабатывают, кроме явно разрешённых (`allowInEditable`, `allowInDialog` — например, клавиши панели задачи).
- **Поля задачи** помечены `data-hotkey-field` (`status`, `priority`, `due`, `labels`, `assignee`, `watch`). Клавиша открывает соответствующий контрол на следующем такте, чтобы само нажатие не попало в него. В архивной задаче клавиши правки отключены.
- **Подсказки.** У кнопок полей задачи — `aria-keyshortcuts`; полный список — в справке (`?`).

## Глобальный поиск

Модуль-агрегатор `search` (зависит от `tasks`, `documents`, `workspaces`; от него не зависит никто). Палитра — `CommandPalette` (`components/search/`, `CommandDialog` из shadcn на `cmdk`) — открывается кнопкой «Поиск… Ctrl K» в шапке (на мобильных — иконка) или сочетанием Cmd/Ctrl+K в любом месте, включая поля ввода (`event.code`, работает и в русской раскладке).

| Где открыта | Что ищется | Команды |
|-------------|------------|---------|
| В пространстве (`/w/[slug]/…`) | Задачи (ключ `TSK-42`, `#42`, номер — первой, затем часть названия), документы (часть названия), участники (имя, email) — по 5 в группе | «Новая задача», «Задачи», «Документы», «Участники», «Настройки пространства» (владельцу) |
| Вне пространства | Активные пространства пользователя по названию | «Новое пространство» |

- **Сервер.** `globalSearchAction` → `globalSearch(session, { workspaceId, q })`: три группы параллельно, доступ проверяет каждая (`requireWorkspaceAccess`: чужое или архивное пространство → `NOT_FOUND`). Архивные задачи не находятся, документы — только видимые (заметки и загруженные файлы). Запрос — от 2 символов (номер задачи — с одного), до 100. Текст запроса в логи не пишется — только длина и размеры групп (`[search] query`).
- **Индексы.** `ILIKE '%q%'` по `Task.title` и `LIKE` по `Document.titleKey` идут по GIN-индексам `pg_trgm` (миграция `add_search_indexes`, расширение создаётся в ней же).
- **Клиент.** Запрос — через 200 мс после ввода, ответы устаревших запросов отбрасываются; с приходом результатов выделяется первый. Задача открывается в панели поверх текущей страницы, если та её поддерживает (доска, «Список» проекта, `/tasks`), иначе — на `/tasks?task=<номер>`. Фокус после закрытия возвращается туда, откуда открыли палитру.

## Документы

Модуль `documents`. У каждого пространства своё хранилище: папки, Markdown-заметки и загруженные файлы, теги и связи с задачами. Раздел — `/w/[workspaceSlug]/docs`.

| Путь | Что там | Кто видит |
|------|---------|-----------|
| `/w/[workspaceSlug]/docs` | Дерево папок слева (на узких экранах — кнопка «Папки»), подпапки и документы папки, поиск, фильтры по тегу и виду, сортировка, занятое место | Любой участник |
| `/w/[workspaceSlug]/docs/new` | Новая заметка (`?folder=`, `?linkTask=` — сразу привязать к задаче) | Право `manageDocuments` (иначе 404) |
| `/w/[workspaceSlug]/docs/[documentId]` | Просмотр заметки или файла, свойства, теги, блок «Задачи» | Любой участник |
| `/w/[workspaceSlug]/docs/[documentId]/edit` | Редактор заметки (файл — редирект на просмотр) | Право `manageDocuments` (иначе 404) |

**Модель данных** (миграция `add_documents`):

| Таблица | Что хранит |
|---------|-----------|
| `DocumentFolder` | Дерево папок: `parentId` (null — корень), `name` и `nameKey` (без учёта регистра). Глубина — до 8 уровней |
| `Document` | `kind = note` (Markdown в `content`, до 200 000 символов, `version` для правки) или `kind = file` (`fileName`, `extension`, `contentType`, `size`, `storageKey`, `status pending/ready`) |
| `DocumentTag`, `DocumentTagAssignment` | Теги пространства (имя до 32 символов, цвет из палитры статусов) и теги документа (до 10) |
| `TaskDocumentLink` | Связь документ ↔ задача (M:N, до 50 документов на задачу) |

- **Изоляция.** Все связи — составные FK `(…, workspaceId)`: папка, документ, тег и связь не окажутся в чужом пространстве. Вручную в SQL миграции: уникальность имени папки в родителе `NULLS NOT DISTINCT` (иначе в корне допускались бы дубликаты), запрет папке быть своим родителем и `CHECK` полей заметки и файла.
- **Права.** Читать, скачивать и привязывать документы к задачам (это правка задачи) может любой участник. Создавать, менять, переносить и удалять папки, документы и теги — владелец или участник с правом `manageDocuments` («Управление документами» на странице «Участники»).
- **Папки.** Перенос в себя или во вложенную папку и превышение глубины запрещает модель (`assertCanMoveFolder`); цепочку предков и высоту поддерева сервис читает рекурсивным CTE. Изменения дерева в пространстве идут по очереди (`pg_advisory_xact_lock`), чтобы два параллельных переноса не создали цикл. Удаление папки удаляет подпапки и документы каскадом; ключи файлов собираются до удаления строк, объекты удаляются после.
- **Заметки.** Сохранение — `updateNoteAction` с версией: `UPDATE … WHERE version = <ожидаемая>`. Если заметку успели изменить, ответ `CONFLICT`, редактор предлагает скопировать свой текст и загрузить актуальную версию — чужие правки не перезаписываются. Заметку можно скачать как `.md`.
- **Файлы** загружаются так же, как вложения: presigned POST (до 50 МБ, на 10 минут) → подтверждение `HeadObject` и сигнатуры (PNG, JPEG, GIF, WebP, PDF). Ключ — `ws/<workspaceId>/docs/<случайный UUID>`. Тип — по расширению из allowlist (`document-type.ts`); HTML, XML и код хранятся как `text/plain`, SVG только скачивается. Брошенные загрузки старше 24 часов удаляются при следующем запросе слота; отмена в очереди удаляет слот сразу.
- **Квота пространства** — `DOCUMENTS_WORKSPACE_QUOTA_MB` (по умолчанию 1 ГБ). Учитываются подтверждённые файлы и незавершённые загрузки. Проверка идёт при выдаче слота под блокировкой пространства (`pg_advisory_xact_lock`), поэтому параллельные загрузки квоту не превысят. Занятое место — под деревом папок.
- **Просмотр.** `pickViewer()` выбирает просмотрщик: картинки (`<img>`, «Вписать / 100%»), PDF (`<iframe>` со встроенным просмотрщиком браузера и ссылкой «Открыть в новой вкладке»), аудио и видео (нативные плееры, ссылка на 1 час — для перемотки), Markdown-файлы, CSV/TSV (таблица до 500 строк, разделитель `;` или `,` определяется по заголовку), JSON (форматирование), текст и код (номера строк, перенос). Текстовые файлы сервер читает из хранилища — не больше 1 МБ, длиннее показывается начало. Офисные файлы и архивы — карточка со скачиванием.
- **Безопасный Markdown** (`MarkdownView`, `react-markdown` + `remark-gfm`: таблицы, чек-листы, зачёркивание). Сырой HTML не рендерится (`skipHtml`). Адреса проходят через `safeMarkdownUrl`: только `http(s)`, `mailto` и относительные, `javascript:` и `data:` вырезаются. Картинки показываются только из `/api/documents/` и `/api/attachments/` — внешние выводятся ссылкой (нет трекинга). Внешние ссылки открываются с `rel="noopener noreferrer nofollow"`.
- **Редактор** — текстовое поле и панель форматирования (`applyMarkdownFormat`: заголовок, жирный, курсив, списки, чек-лист, цитата, код, ссылка, таблица; повторное нажатие снимает), «Ссылка на документ» (поиск по пространству), вкладки «Редактор / Просмотр / Рядом», `Ctrl+B/I/K/S`, предупреждение о несохранённых изменениях при закрытии вкладки.
- **Связь с задачами.** В задаче — раздел «Документы» (панель и страница задачи): список с путём папки и тегами, «Привязать документ» (поиск), «Создать заметку и привязать», «Отвязать». В документе — блок «Задачи» с поиском по номеру (`#42`) или названию. Связи удаляются каскадом вместе с задачей или документом.
- **Поиск** — по названию (`titleKey contains`), тегу и виду по всему пространству; без фильтров — обзор одной папки. Состояние в URL (`folder`, `q`, `tag`, `kind`, `sort`, `dir`, `page`), страница по 50.
- **Логи.** `documents.folder`, `documents.document`, `documents.file`, `documents.tag`, `documents.taskLink`, `documents.views`: `INFO` на изменения, `WARN` на отказы (дубликат имени, перенос в потомка, квота, сигнатура, конфликт версий), `ERROR` на сбой удаления объектов. Текст заметок, строки поиска и presigned URL в логи не попадают.
- **Ограничения.** Нет корзины и истории версий заметок, поиска по содержимому, превью офисных файлов. При удалении пространства объекты хранилища пока не удаляются (как и у вложений). Предупреждения о несохранённых изменениях при переходе внутри приложения нет — только при закрытии вкладки.

## Профили

Модуль `profiles`. Поля Better Auth (`User`) не расширяются: должность и описание лежат в отдельной таблице `UserProfile` (1:1, каскад при удалении пользователя). Имя, email и фото (`User.name`, `User.email`, `User.image`) приходят из IdP и обновляются при каждом входе (см. [«Вход через plwedding ID»](#вход-через-plwedding-id)); в Tasker их не меняют.

| Путь | Что там |
|------|---------|
| `/profile` | «Имя и фото» — только чтение, ссылка «Изменить в plwedding ID»; «О себе» — должность (до 80), описание (до 1000) |
| `/profile/notifications` | Настройки уведомлений: событие × канал, каждый переключатель сохраняется сразу |
| `/profile/account` | Имя и email (только чтение, ссылка «Учётная запись plwedding ID»), дата регистрации, глобальная роль, пространства с ролью и ссылкой на свой профиль в каждом, привязка GitHub |
| `/profile/security` | Ссылка на пароль, 2FA и сессии в plwedding ID, «Сеансы в Tasker», «Журнал безопасности» |
| `/w/[workspaceSlug]/members/[userId]` | Публичный профиль участника (из вкладки «Участники») |

- **Публичный профиль.** Доступен только в рамках пространства: смотрящий и цель должны быть его участниками, иначе `404` (кто есть в чужих пространствах, не раскрывается). Показывает фото, должность, описание, роль и права «Управление проектами» и «Управление документами», email, даты вступления и регистрации, последнюю активность, счётчики (открытые, просроченные, выполненные за 30 дней задачи, комментарии, созданные задачи) и до 10 ближайших открытых задач. Сводку считает `getMemberTaskSummary()` модуля `tasks` одной транзакцией. Задача «открыта», если у неё нет размещений или хотя бы в одном проекте статус не «Готово» (`isTaskOpen`).
- **Карточка при наведении.** `UserHoverCard` на ответственном (доска, список, свойства задачи), авторе комментария и упоминаниях. Имя и фото видны сразу из `TaskUserDto`, остальное (должность, роль, email, открытые задачи) загружается при открытии из `GET /api/w/[workspaceSlug]/members/[userId]/card` и кешируется на время жизни страницы. Пространство берётся из адреса страницы. На карточке доски триггер не фокусируемый: карточка задачи — ссылка, вложенную ссылку делать нельзя.
- **Фото.** Своей загрузки нет: фото загружают в IdP. При входе claim `picture` превращается в адрес приложения `/api/idp-avatar/<sub>?v=<версия>` (только фото из IdP этого же пользователя; иначе — инициалы), а [`GET /api/idp-avatar/[sub]`](#get-apiidp-avatarsub) перенаправляет на IdP. У агентов — статичный робот `/agent-avatar.svg`. Кадрирование — `object-cover`.
- **Чужие адреса в `User.image`.** `UserAvatar` и сервисы показывают только `/api/idp-avatar/…` и `/agent-avatar.svg` (`isAvatarUrl`), поэтому внешний трекер не загрузится у других участников.
- **Логи.** `profiles`: `INFO` на изменение профиля (только список полей, без значений).

## Уведомления

Модуль `notifications`. Другие модули вызывают `notify(events)` или `notifyByEmail(email, event)` после того, как проверили доступ и сохранили изменение. Обе функции **никогда не бросают**: сбой пишется в лог как `ERROR`, исходное действие не откатывается.

| Тип | Когда | В приложении | Email по умолчанию |
|-----|-------|--------------|--------------------|
| `mention` | Вас упомянули в комментарии | ✓ | ✓ |
| `task_assigned` | Вас назначили ответственным (при создании или смене) | ✓ | ✓ |
| `task_comment` | Новый комментарий к задаче, за которой вы следите ([наблюдатели](#наблюдатели)) | ✓ | — |
| `task_status_changed` | Сменился статус задачи, за которой вы следите | ✓ | — |
| `task_due_soon` | Завтра срок задачи, где вы ответственный ([напоминания](#напоминания-о-сроке)) | ✓ | ✓ |
| `task_overdue` | Прошёл срок задачи, где вы ответственный или наблюдатель | ✓ | ✓ |
| `workspace_invitation` | Вас пригласили в пространство (если вы уже зарегистрированы) | ✓ | недоступно: письмо отправляет само приглашение |

- **Данные.** `Notification(userId, workspaceId, type, actorId, taskId, commentId, invitationId, payload, readAt)`. `payload` — снимок на момент события (slug и имя пространства, номер и название задачи, фрагмент комментария до 140 символов, имя автора), проверяется Zod-схемой типа при чтении. Задача и комментарий — ссылки без FK: после удаления задачи уведомление ведёт на её `404`. Настройки — `NotificationPreference(userId, type, inApp, email)`; нет строки — значения по умолчанию из `NOTIFICATION_TYPE_INFO`.
- **Получатели.** `dedupeRecipients()`: автор действия исключается, одному получателю — одно уведомление на действие, самое важное (`mention` важнее `task_comment`). Удалённые и заблокированные пользователи не получают ничего. Уведомление агенту пространства получает его ответственный (или владельцы) с пометкой «(для агента …)» — см. [Агенты пространства](#агенты-пространства).
- **Письма** уходят через `after()` из `next/server` — после ответа пользователю. Вне запроса Next.js (скрипты) — сразу в фоне. Ссылка в письме абсолютная, от `BETTER_AUTH_URL`, плюс ссылка на настройки. Пользовательские данные экранируются (`escapeHtml`).
- **Выход из пространства.** Триггер БД `WorkspaceMember_remove_notifications` (миграция `add_profiles_and_notifications`) удаляет уведомления этого пространства у вышедшего участника, кроме приглашений. Как и снятие ответственного, это делает БД: участника удаляет плагин Better Auth вне транзакций приложения.
- **Интерфейс.** Колокольчик в шапке (`NotificationBell`): счётчик непрочитанных рендерится на сервере и обновляется опросом `GET /api/notifications/unread-count` раз в 60 секунд, пока вкладка видима, и при возврате на неё. Список (10 последних) загружается при открытии. Клик отмечает уведомление прочитанным и ведёт к задаче (комментарий — с якорем `#comment-<id>`) или приглашению. Страница `/notifications`: «Все / Непрочитанные» (`?filter=unread`), «Прочитать все», «Показать ещё» по курсору `createdAt + id`.
- **Доступ.** Все чтения и изменения фильтруются по `userId` текущего пользователя; чужое уведомление → `NOT_FOUND`.
- **Логи.** `notifications`: `INFO` `[notification] created` (типы, число получателей, сколько в приложении и сколько писем), `[notification] read`; `notifications.preference`: `INFO` на изменение настройки; `ERROR` на сбой создания или отправки письма (без email адресата).
- **Ограничения.** Без realtime: новые уведомления появляются при опросе. Старые уведомления не удаляются автоматически. Письма не группируются в дайджест.

## Интеграция с GitHub

Модуль `src/modules/integrations/github` (подробности для пользователя и настройка приложения — [Интеграция с GitHub](github.md)). Включается переменными `GITHUB_*` или приложением, созданным в админке (`/admin/integrations`, срез `app-setup`, манифест GitHub App). Конфиг читает `@/shared/github-app`: сначала окружение, затем запись `GithubAppConfig` из БД (секреты — AES-256-GCM, ключ HKDF от `BETTER_AUTH_SECRET`) с кешем процесса на минуту. `isGithubEnabled()` асинхронная: загружает конфиг, без него страницы и запросы модуля ничего не делают. `getSession()` и `/api/auth/*` загружают конфиг до `getAuth()`, а `getAuth()` и клиент GitHub App пересоздаются, когда экземпляр конфига сменился, — так приложение, созданное или отключённое в админке, включается без перезапуска.

| Срез | Что делает |
|------|------------|
| `identity` | Привязка GitHub к пользователю (`Account`, `providerId = 'github'`): `getGithubUserToken` через `auth.api.getAccessToken`, `findUsersByGithubIds` |
| `installation` | Подключение установки (подписанный `state`, проверка `GET /user/installations`), синхронизация репозиториев, выбор репозиториев пространства |
| `webhook` | Подпись, идемпотентность (`GithubWebhookDelivery`), реестр обработчиков по `X-GitHub-Event`, транзакция и действия после коммита |
| `pull-request` | Сохранение PR (защита от устаревших событий по `updated_at`), итог ревью и CI, чтения для задачи и индикаторов |
| `link` | Распознавание `KEY-N`, автосвязи PR, ветки и коммиты, ручная привязка по ссылке, «Отвязать» |
| `automation` | Настройка проекта и автосмена статуса по переходу PR |
| `notify` | Уведомления `pr_linked`, `pr_merged`, `pr_review` через `notify()` |
| `summary` | Сводка для любого участника (`getWorkspaceGithubSummary`): включена ли интеграция, выбранные репозитории, автосмена статуса по проектам — для агентов MCP |

`github-api.ts` — единственная точка работы с GitHub API (пакет `octokit`): ленивый `App` (кеш токенов установок), клиент пользователя, `callGithub()` переводит ошибки Octokit в доменные (404 → `NotFoundError`, 401/403 → `ForbiddenError`), тело ответа GitHub не логируется.

- **Ключ задач** — поле `Workspace.taskKey` (плагин `organization`, `input: false`). Его ставит сервис пространств сразу после создания: при конфликте добавляется цифра, до 5 попыток. Если ключа нет, пространство работает, а задачи показываются как `#42`. Ключ выводит `formatTaskKey(number, taskKey)` в `tasks`; DTO получают `taskKey` через связь `workspace` в выборках.
- **Системные функции без сессии** — только для вызывающих с проверенным источником (подписанный вебхук): `resolveTaskRefs` / `resolveTaskRefsByIds`, `listPlacementsForAutomation`, `changePlacementStatusBySystem` из `tasks` и `findWorkspacesByTaskKeys` из `workspaces`. Проверки «статус ∈ проект», «задача в проекте» и пространство в `where` остаются.
- **Данные чужих репозиториев не хранятся.** События репозитория, который не выбран ни в одном пространстве (или установка приостановлена), отвечают `ignored` и ничего не пишут.
- **Таблицы** (`GithubInstallation`, `GithubRepository`, `GithubPullRequest`, `TaskPullRequest`, `TaskGithubBranch`, `TaskGithubCommit` и др.) — в разделе `// ── GitHub ──` схемы. Id GitHub — `BigInt`, в DTO — строкой. Связи задач ссылаются на `Task(id, workspaceId)` с каскадом; удаление установки каскадом удаляет её репозитории, PR и связи.
- **Порядок после коммита вебхука:** автосмена статусов → уведомления → `revalidatePath('/w/[workspaceSlug]', 'layout')`. Сбой любого шага логируется и не меняет ответ.

## Журнал действий

Одна таблица `AuditEvent` для событий Tasker. Модуль `audit` читает её, а пишет `recordAuditEvent()` из `shared/audit`: события возникают во всех модулях и в хуках Better Auth. События учётной записи (входы, пароль, 2FA, действия администратора над учётной записью) пишет IdP: Tasker читает их через [API журнала IdP](#события-учётной-записи-из-idp) и сливает со своими в ленты.

- **Каталог** (`shared/audit/audit-catalog.ts`): тип события → категория и Zod-схема снимка `data`. Снимок хранит имена и названия на момент события (до 200 символов, длиннее — обрезается), поэтому событие удалённой задачи или пользователя остаётся читаемым. Свободный текст — только причина блокировки (до 500 символов). Текст для ленты строит чистая функция `describeAuditEvent` (`modules/audit/models`) только из `kind`, `data` и снимков — событие из другого источника с теми же полями выглядит так же.
- **Владелец типа** (`AUDIT_EVENT_OWNERS`): `identity` — события учётной записи (`auth.*`, кроме привязки GitHub и сеансов Tasker, и действия администратора над учётной записью: блокировка, роль в IdP, все сессии, 2FA, email, письма); их пишет IdP, Tasker их больше не пишет, а старые записи перенесены в IdP с теми же `id`. В каталоге они остались для старых записей и общего журнала. `app` — сеансы Tasker (`auth.sessions_revoked`, `admin.user_session_revoked`), GitHub, токены, пространства, содержимое, агенты, имперсонация, роль в Tasker (старые записи), настройки.
- **Категория определяет видимость** — пользователь её не выбирает:

  | Категория | Что в ней | Кто видит |
  |-----------|-----------|-----------|
  | `security` | В Tasker: завершение своих сеансов Tasker, GitHub-аккаунт, выпуск и отзыв токенов. Из IdP: регистрация, входы (в том числе «Вход в Tasker»), неудачные попытки, пароль, 2FA, сессии IdP, профиль | Сам пользователь (`/profile/security`, «Журнал безопасности») и администратор |
  | `workspace` | Пространство (создание, переименование, архив, удаление), участники, роли и права, приглашения, агенты, проекты | Участники пространства — в профиле участника (`/w/[slug]/members/[userId]`, «Последние действия»: только его действия в этом пространстве) — и администратор |
  | `content` | Задача создана, в архиве, восстановлена, удалена; документ создан, удалён | Как `workspace` |
  | `admin` | Все действия администратора | Только администратор |

- **Автор** — `auditActorFromSession(session)`: пользователь, токен MCP (`viaTokenId`) и администратор под имперсонацией (`impersonatorId`; в ленте — «через администратора …»). `targetUserId` — над кем действие (например, блокировка).
- **IP и User-Agent** сохраняются только у событий `security` и показываются только самому пользователю и администратору.
- **Никогда не бросает.** Неверный снимок — `ERROR` в логе без содержимого, сбой БД — `ERROR`; действие пользователя не ломается (как `notify`). Вызывается после успешного изменения.
- **Что не пишется:** чтение; правки полей задач, комментарии, вложения, перемещения по доске (для них есть [история задачи](#история-изменений) и журнал MCP); регистрация, вход и выход (их пишет IdP: «Вход в Tasker» — `auth.oidc_authorized`); действия администратора над учётной записью (их пишет Admin API IdP). Начало и конец имперсонации пишет сервис имперсонации.
- **Удалённые сущности.** Событие удаления пишется без внешнего ключа на удалённую запись, снимок — в `data`. Ссылки на пользователя и пространство — `SET NULL`.
- **Срок хранения** — `AUDIT_RETENTION_DAYS` (по умолчанию 180 дней). Старые события удаляет [`POST /api/cron/cleanup`](#post-apicroncleanup) пачками.
- **Чтение** — курсорная пагинация (`createdAt`, `id`): по 20 в профиле участника, 30 в журнале безопасности, 50 в админке. `listMemberWorkspaceActivity` (участник пространства), `listMySecurityEvents` (сам пользователь), `listAdminAuditEvents` (администратор, фильтры). Лента — `components/audit/audit-event-list.tsx`.

### События учётной записи из IdP

Клиент — `src/shared/idp` (`idpRequest`: `Authorization: Basic` с `OIDC_CLIENT_ID` и `OIDC_CLIENT_SECRET`, таймаут 5 с, `no-store`; ошибки — `IdpApiError` с кодом из `{ error: { code, message } }`). Пользователь в IdP — его `sub` = `Account.accountId` провайдера `plwedding` (`findIdpSubject`, обратно — `findUsersByIdpSubjects`). Контракт — `docs/oidc-clients.md` («API журнала безопасности») в `leha-creator/auth`.

| Лента | Локально | Из IdP |
|-------|----------|--------|
| `/profile/security` | `security` пользователя, только типы `app` | `GET /api/audit/users/<sub>/events` |
| Карточка пользователя и `/admin/activity?user=` (без фильтра по пространству) | События пользователя, только типы `app` | `GET /api/audit/admin/users/<sub>/events?actor=<sub администратора>` — с причиной бана; категория, тип и период фильтруются в Tasker |
| `/admin/activity` без пользователя, карточка пространства, профиль участника | Все события по фильтрам | — (общей ленты у IdP нет) |

- **Слияние** — чистая `mergeAuditFeed` (`modules/audit/models/audit-feed.ts`): обе ленты новые сверху, событие с одинаковым `id` (перенесённая история) показывается один раз — из IdP. Курсор страницы из двух частей: `<локальный>~<IdP>`, пустая часть — с начала, `-` — сторона закончилась. Если буфер одной стороны кончился раньше неё самой, страница обрывается, чтобы не нарушить порядок.
- **Текст** событий IdP готов (`text`, `details` — только администратору), ссылок нет. Автор — пользователь Tasker по `sub`, иначе имя из IdP.
- **IdP недоступен** (таймаут, ошибка, неожиданный ответ) — лента из локальных событий и `Callout` «plwedding ID не ответил…» (`identityUnavailable`), `WARN` `[audit.identity]`. Пользователь без связи с IdP — только локальные события.

## Администрирование

Раздел `/admin` доступен только глобальной роли `admin`; остальным — 404. Первый администратор назначается через `ADMIN_EMAILS` при первом входе, остальных назначают в админке.

| Путь | Что там |
|------|---------|
| `/admin` | Обзор ресурса: счётчики, регистрации за 30 дней, состояние, хранилище, тестовое письмо |
| `/admin/users` | Все пользователи: поиск по имени и email, фильтры по роли и статусу, сортировка, пагинация по 50. Состояние — в URL (`?q=&role=&status=&sort=&dir=&page=`) |
| `/admin/users/[userId]` | Карточка пользователя: сведения (email и 2FA — из IdP), пространства с ролями, сеансы в Tasker, токены доступа, журнал (с событиями из IdP) |
| `/admin/workspaces` | Все пространства: поиск, «активные / в архиве», сортировка, пагинация по 50 |
| `/admin/workspaces/[workspaceId]` | Карточка пространства: участники, счётчики, квота, журнал, действия |
| `/admin/activity` | Журнал ресурса: фильтры по пользователю, категории, типу, пространству и периоду (`?user=&category=&kind=&workspace=&from=&to=`) |
| `/admin/integrations` | GitHub App Tasker: создание по манифесту, сведения, отключение (если не задано переменными `GITHUB_*`) |
| `/admin/settings` | Настройки ресурса: квота хранилища по умолчанию |

Колонки списка пользователей: имя и email, роль, статус (активен / заблокирован до … / бессрочно, с причиной), число пространств, дата регистрации. Имя ведёт в карточку. Действия — меню в строке и в карточке:

| Действие | Что происходит |
|----------|----------------|
| Заблокировать | Причина (до 500 символов, видна только администраторам, хранится в журнале IdP) и срок: бессрочно, 1, 7 или 30 дней. Блокирует в IdP, затем локально (плагин удаляет сеансы Tasker) |
| Разблокировать | Снимает блокировку в IdP и локально |
| Сделать администратором / Снять роль | Меняет роль в IdP (нужна для Admin API, журнала IdP и `groups`) и `User.role` в Tasker |
| Завершить все сессии | Принудительный выход без блокировки: сессии IdP, затем сеансы Tasker |
| Сбросить 2FA | Только если 2FA включена в IdP. IdP удаляет секрет и резервные коды и завершает свои сессии, Tasker — свои |
| Отправить ссылку сброса пароля | Письмо от IdP; текущий пароль действует до нового |
| Отправить письмо подтверждения / Подтвердить email вручную | Только если email в IdP не подтверждён |
| Удалить | Подтверждение вводом email. Удаляются учётная запись Tasker, сессии, участие в пространствах, профиль и уведомления; задачи и комментарии остаются без автора и ответственного (`SET NULL`). Учётная запись в IdP не удаляется: чтобы человек не вошёл снова, его блокируют, а не удаляют |
| Войти от имени… | [Имперсонация](#имперсонация) |

Все действия над учётной записью, кроме удаления и имперсонации, идут в [Admin API IdP](https://github.com/leha-creator/auth/blob/main/docs/admin-api.md) (`modules/admin/admin-api.ts`: `resolveIdpSubjects`, `callIdpAdmin`), от имени администратора (`actor` — его `sub`). IdP сам проверяет правила (не над собой, не блокировать администратора) и роль `admin` администратора в IdP, а события `admin.*` пишет в свой журнал. Ошибки IdP становятся доменными (`mapIdpAdminError`): 400 → `ValidationError` с текстом IdP, 403 → `ForbiddenError`, 404 → `NotFoundError`, 429 → `RateLimitError` (не больше 10 писем в час от администратора), сбой связи, 5xx и 401 → 503 «plwedding ID сейчас недоступен…». Пользователь без связи с IdP (не входил и не перенесён) — «Пользователь ещё не связан с plwedding ID». Пункты 2FA, писем и подтверждения email меню показывает только в карточке, по состоянию из `GET /api/admin/users/<sub>`; если IdP не ответил, их нет. Одну сессию в карточке Tasker завершает сам (сеансы Tasker), событие `admin.user_session_revoked` пишет локально.

В карточке пользователя дополнительно: завершить одну сессию (список — IP, браузер, «вход от имени»; токены сессий не показываются) и отозвать токен доступа (`revokeApiTokenBySystem`).

### Имперсонация

«Войти от имени» — `impersonateUser` плагина `admin`: администратор получает сессию пользователя на час (`impersonationSessionDuration`), его собственная сессия сохраняется в cookie `admin_session`. Сценарии — поддержка («что видит пользователь») и доступ к чужому пространству: режима «только просмотр» без членства нет.

- **Кого нельзя:** себя, другого администратора, заблокированного, агента (`assertCanImpersonate`). Лимит `admin-impersonate`: 30 входов в час.
- **Баннер** над шапкой: «Вы действуете от имени … до …» и кнопка «Вернуться» (`stopImpersonating` → карточка пользователя в админке).
- **Пометки.** События под имперсонацией пишутся с `impersonatorId`; в ленте участника — «через администратора …». Начало и конец — события `admin.impersonation_started` / `stopped`.
- **Что недоступно** (`requireNotImpersonating`): завершение сессий пользователя, выпуск токенов (личных и агентских), привязка и отвязка GitHub — ответ `FORBIDDEN` «Недоступно при входе от имени пользователя».

### Пространства

Системные функции модуля `workspaces` (`listAllWorkspaces`, `getWorkspaceForAdmin`, `setWorkspaceArchivedBySystem`, `deleteWorkspaceBySystem`, `transferWorkspaceOwnership`, `setWorkspaceStorageQuota`) не проверяют сессию — их вызывает только `admin` после `requireAdmin()`. Занятое хранилище — `getStorageUsageByWorkspaces` модуля `documents` одним запросом на страницу.

| Действие | Что происходит |
|----------|----------------|
| В архив / Восстановить | Как у владельца: архивное пространство только для чтения, токены MCP не работают |
| Удалить навсегда | Только из архива, подтверждение вводом названия. Каскадом удаляются проекты, задачи, документы и токены |
| Назначить владельца | Из участников-людей. Прежние владельцы остаются владельцами или становятся участниками (флажок). Одна транзакция |
| Квота хранилища | Своя квота пространства, МБ; пусто — по умолчанию ресурса |

**Квота пространства** по приоритету: `Workspace.storageQuotaMb` → «Квота по умолчанию» в настройках ресурса → `DOCUMENTS_WORKSPACE_QUOTA_MB` (`resolveWorkspaceQuotaMb`).

### Настройки ресурса

Одна строка `ResourceSettings` (`id = 'default'`), код — `shared/resource-settings`: настройки нужны `documents`, а `shared` не зависит от модулей. Осталась одна группа — «Хранилище» (`storage-settings.ts`: `getStorageSettings`, `saveStorageSettings`, квота по умолчанию). Группа «Регистрация» (режим регистрации, домены email) удалена: кто может зарегистрироваться, решает IdP. Чтение кешируется в процессе на 30 секунд; сохранение сбрасывает кеш своего процесса, остальные увидят изменения в течение 30 секунд. Ошибка БД при чтении — прежнее значение или значения по умолчанию.

- Изменения — событие `admin.settings_changed` со списком изменённых полей.

### Обзор

`getResourceOverview()` собирает параллельно: пользователи (всего, администраторы, заблокированные сейчас; без агентов), пространства (всего, в архиве), действующие сессии (и сколько из них — имперсонация), регистрации (первые входы) по дням за 30 дней (дни без регистраций — нули, `fillDailySeries`), хранилище документов и вложений, `checkHealth()`. Метрики учётных записей (пользователи, сессии, регистрации) отдаёт `getAccountMetrics` модуля `auth`, а не запросы `admin` к `User` и `Session`. Плитки ведут в отфильтрованные списки. «Отправить тестовое письмо» шлёт письмо на email администратора (лимит `admin-mail`); ошибка SMTP — понятное сообщение, детали — в логе `[admin.testMail] failed`.

### Правила

Правила живут в модели `modules/admin/models/admin-user.ts` и проверяются сервисом до вызова плагина:

- **Не над собой.** Администратор не может заблокировать, удалить, понизить себя или завершить свои сессии. Поэтому в системе всегда остаётся хотя бы один администратор.
- **Администратора — сначала снять роль.** Заблокировать или удалить пользователя с ролью `admin` нельзя: сначала снимите роль (явный двухшаговый сценарий).
- **Единственный владелец.** Пользователя, который единственный владелец хотя бы одного пространства, удалить нельзя — иначе пространство останется без владельца. Ошибка `CONFLICT` перечисляет такие пространства; вместо удаления пользователя можно заблокировать.
- **Истёкшая блокировка.** Плагин сбрасывает флаг `banned` только при следующем входе, поэтому список считает блокировку с прошедшим `banExpires` снятой (и фильтр «Заблокированные» её не показывает).

### Как устроен модуль `admin`

- **Чтение** — свой репозиторий (`slices/user/user.repository.ts`): поиск по имени **или** email и фильтр по сроку блокировки встроенный `listUsers` плагина не умеет. Число пространств и единоличное владение дают функции модуля `workspaces` (`countWorkspacesByUsers`, `listSoleOwnedWorkspaces`) — без проверки сессии, только для модулей, уже проверивших права.
- **Изменения** — через `auth.api.*` плагина `admin` (`callAdminApi` в `admin-api.ts`): `banUser`, `unbanUser`, `setRole`, `revokeUserSessions`, `removeUser`, `impersonateUser`, `stopImpersonating`. Ошибки плагина переводятся в доменные (`admin.errors.ts`). Список сессий и завершение одной — системные функции модуля `auth` (`slices/account`: `listUserSessionsBySystem`, `revokeUserSessionBySystem`). Операции над учётной записью идут только через этот порт и `callAdminApi`.
- Срезы: `user`, `impersonation`, `workspace`, `settings`, `overview`. Каждый сервисный метод первым делом вызывает `requireAdmin()` (`stopImpersonation` — `requireUser()`: его вызывает пользовательская сессия). Действия над пространствами ревалидируют всё приложение, над пользователями — `/admin`.
- Без причины плагин записал бы «No reason», поэтому в конфиге задан `defaultBanReason: 'Причина не указана'`.
- **Ограничение.** Проверка «единственный владелец» и удаление не атомарны: плагин не принимает транзакцию. Окно мало и требует действий самого пользователя.
- Каждое действие пишет событие категории `admin` в [журнал](#журнал-действий); в логах `admin.*` причина блокировки не пишется, email — через `maskEmail()`.

## Агенты пространства

Агент — служебный участник пространства для Claude Code (модуль `agents`). Для пользователя: [Агенты пространства](agents.md#агенты-пространства).

- **Агент = `User` + `WorkspaceAgent`.** `User.isAgent` — поле Better Auth (`additionalFields`, `input: false`), служебный email `agent-<id>@agents.tasker.invalid` (домен `.invalid`, RFC 2606: Better Auth требует уникальный email). `User.image` — статичный робот `/agent-avatar.svg` (`public/agent-avatar.svg`). `WorkspaceAgent`: пространство, ответственный, описание, кто создал, `disabledAt`. Агент принадлежит ровно одному пространству.
- **Членство в обход плагина.** Строку `WorkspaceMember` (роль `member` и флаги прав) сервис агентов создаёт сам, в одной транзакции с `User` и `WorkspaceAgent`: у плагина `organization` нет API «добавить без приглашения». Это задокументированное исключение, как с флагами прав.
- **Нет сессии.** У агента нет `Account`, поэтому войти через IdP он не может. Хук `databaseHooks.session.create.before` (`shared/auth/agent-session-guard.ts`) отклоняет любую сессию пользователя с `isAgent`, в том числе impersonation из админки. Вторая линия — `requireUser` и `requireUserOrRedirect` отклоняют сессию агента.
- **Видимость.** В списке участников — метка «Агент», вместо роли, прав и «Исключить» — ссылка в раздел «Агенты»; `removeMember`, `changeMemberRole` и `setMemberPermission` для агента возвращают `VALIDATION_ERROR`. Счётчик участников в списке пространств — без агентов. Приглашение на служебный домен отклоняется. В админке ресурса агентов нет (`isAgent: false` в списке, действия → `NOT_FOUND`). В выборе ответственного и подсказке `@` — подпись «(агент)», служебный email в поиске не участвует.
- **Отключение вместо удаления.** `disableAgent` снимает членство (триггер БД снимает задачи и уведомления, как при выходе участника), ставит `disabledAt` и отзывает все токены агента. Строка `User` остаётся: авторство в истории не превращается в «удалённого пользователя». `enableAgent` возвращает членство без дополнительных прав.
- **Уведомления ответственному.** `notify()` находит среди получателей включённых агентов (`findAgentRoutes`) и чистой функцией `routeAgentRecipients` заменяет агента на ответственного, если тот ещё участник, иначе на владельцев пространства. Автор действия исключается до и после замены, дубли схлопываются. В payload добавляется `forAgent: { name }` — текст «… (для агента …)». `sendMail` пропускает адреса `*.invalid` (WARN, без ошибки).

## MCP-сервер для агентов

Агенты (Claude Code) работают с задачами и документами через MCP — `POST /api/mcp`. Для пользователя: [Claude Code и MCP](agents.md).

- **Токены** — модуль `api-tokens`, модель `ApiToken`:
  - токен `tkr_` + 32 случайных байта (base64url), в БД — SHA-256 (`tokenHash`, уникальный) и префикс для списка;
  - токен привязан к пользователю (человеку или агенту) и одному пространству, каскадно удаляется вместе с ними; `issuedById` — кто выпустил;
  - личный токен выпускает сам пользователь (`/profile/tokens`), токен агента — только владелец пространства агента (`createAgentToken`, `listAgentTokens`, `revokeAgentToken` на странице агента); лимит — 20 действующих токенов на пользователя или агента;
  - `scopes` — области `read` (всегда), `tasks`, `documents`; `normalizeScopes` добавляет `read` и убирает повторы. Существующим токенам миграция поставила все области.
- **Токен → сессия.** `authenticateApiToken(header)` строит `AuthSession`:
  - пользователь читается при каждом запросе, блокировка действует сразу;
  - `role` всегда `user`, поэтому `requireAdmin` для токена не сработает;
  - `session.id` = `api-token:<id>`;
  - `session.via = { tokenId, tokenName, scopes, agent }` — по нему сервисы ставят пометку «через агента», MCP проверяет области и описывает агенту, от чьего имени он действует;
  - для агента дополнительно: `WorkspaceAgent` не отключён и принадлежит пространству токена (иначе `reason: 'agent_disabled'`);
  - членство проверяет `requireWorkspaceAccess`, вышедший из пространства получает `401`;
  - все причины отказа дают одно сообщение, причина пишется в лог (`reason`);
  - `lastUsedAt` обновляется не чаще раза в минуту, без ожидания.

  `getSession()` и cookie не меняются: bearer принимается только в `/api/mcp`.
- **Сервер** — модуль `agent-mcp`, `@modelcontextprotocol/sdk`, транспорт `WebStandardStreamableHTTPServerTransport`:
  - без сессий (`sessionIdGenerator: undefined`), ответы JSON (`enableJsonResponse`), тело до 1 МБ;
  - на каждый запрос создаётся новый `McpServer`, инструменты замыкают контекст токена;
  - `workspaceId` берётся только из токена, агент его не передаёт;
  - инструменты вызывают **те же сервисы**, что Server Actions (`createTask`, `changeStatus`, `addToProject`, `setTaskParent`, `createComment`, `createNote`, `updateNote`, `requestDocumentUpload`…), поэтому проверки прав (в том числе «Управление документами»), уведомления и `@`-упоминания работают одинаково.
- **Области.** Карта `TOOL_SCOPES` (`models/tool-scopes.ts`) — инструмент → область. `createTaskerMcpServer` регистрирует инструмент и сразу удаляет его (`RegisteredTool.remove()`), если области нет: `tools/list` его не вернёт. Промпты регистрируются только с областью `tasks`. `runTool` проверяет область ещё раз (`FORBIDDEN`, WARN `[mcp.tool] scope denied`).
- **Пометка «через агента».** `createTask`, `createComment`, `createNote` и `requestDocumentUpload` пишут `createdViaTokenId = session.via?.tokenId` (FK на `ApiToken`, `SET NULL`). DTO отдают `createdVia: { tokenName } | null` — только если автор не агент.
- **Журнал** — модель `McpActivity`, срез `activity` модуля `api-tokens`. Инструмент изменения возвращает `{ text, activity: { summary, targetKey } }`, `runTool` после успеха вызывает `recordActivity` без ожидания (сбой записи не влияет на ответ). Изредка (1%) удаляются записи старше 90 дней. Чтение: `listAgentActivity` — владелец пространства, `listTokenActivity` — владелец личного токена; курсор `createdAt + id`, по 50 записей.
- **Документы** — инструменты `tools/document-tools.ts` (чтение) и `tools/document-write-tools.ts` (изменение) поверх публичного API `documents`. Текст файла — `getDocumentText` (до 1 МБ), в ответе MCP обрезается до 100 КБ по границе символа; бинарные файлы — ссылкой `getDocumentFile`. `update_note` при `CONFLICT` возвращает подсказку перечитать документ. Папка и тег задаются id, именем или путём папки (`resolveFolder`, `resolveTag`). `get_task` дописывает раздел «Документы» (`listTaskDocuments`).
- **Ответы** — компактный Markdown. `runTool` логирует вызов и длительность. `AppError` превращается в `isError: true` с текстом, неожиданная ошибка — в общий текст и `ERROR` в лог.
- **Правила GitHub для агента** собирают чистые функции `models/github-guide.ts` из `getWorkspaceGithubSummary` (модуль `integrations/github`, доступна любому участнику: выбранные репозитории и автосмена статуса, без установок и секретов). `preview_github_links` использует тот же `findTaskReferences`, что и вебхук.
- **Промпты** `start_task` и `finish_task` строятся из задачи и автосмены её проектов (`models/prompts.ts`).
- **Вложения** — тот же путь, что у браузера: `requestAttachmentUpload` (слот и presigned POST) → агент сам отправляет файл `curl` в хранилище → `completeAttachmentUpload` (размер, сигнатура картинок). Файл через MCP не проходит, лимит тела `/api/mcp` его не касается. Команду `curl` собирает `buildUploadCommand` (поля — `--form-string`, файл последним). Скачивание — `getAttachmentDownload`, presigned GET на 60 секунд.

## Справка

Раздел `/help` со сценариями работы и скриншотами, только для вошедших пользователей (страницы в `src/app/(app)/help/`). `proxy.ts` смотрит лишь на наличие cookie, поэтому `layout.tsx` справки сам вызывает `requireUserOrRedirect` под `Suspense`: тело статьи остаётся в кеше, а по запросу проверяется только сессия.

- **Модуль `help`** (`src/modules/help/`). Каталог статей — чистый TS (`models/help-catalog.ts`): разделы, порядок, заголовок, описание, аудитория («Участник», «Владелец», «Агенты»). `models/help-content.ts` достаёт из Markdown заголовки для оглавления, картинки и ссылки на статьи. `getHelpArticle(slug)` читает `content/help/<slug>.md` через `fs` с `'use cache'` и `cacheLife('max')`: статьи меняются только с деплоем.
- **Страницы.** `/help` — карточки статей по разделам. `/help/[slug]` генерируется статически (`generateStaticParams`): слева навигация (на мобильных — `<details>`), справа на `xl` оглавление по `##`/`###`, внизу «Предыдущая / Следующая». Компоненты — `src/components/help/`.
- **Рендер** — общий `MarkdownView`. Проп `imagePrefixes` задаёт разрешённые адреса картинок; справка передаёт `['/help-media/']`, и картинка выводится на всю ширину с подписью из `title`. В заметках и комментариях список прежний, картинки справки там не показываются.
- **Скриншоты** лежат в `public/help-media/<article>/` (не в `public/help/`, чтобы не пересекаться с маршрутом). Их снимает `pnpm help:screenshots` (см. [Разработка](development.md#справка-и-скриншоты)).
- **Сборка.** Markdown-файлы попадают в standalone через `outputFileTracingIncludes` в `next.config.ts`, `public/` копируется в образ отдельной строкой Dockerfile.
- **Входы:** пункт «Справка» в меню пользователя, сочетание `g h`, команда в палитре Cmd/Ctrl+K, ссылка «Подробнее в справке» в окне «Горячие клавиши».
- **Тест целостности** `src/modules/help/help-content-integrity.test.ts`: у каждой статьи есть файл, картинки существуют, ссылки `/help/<slug>#<якорь>` ведут на существующие заголовки, id оглавления совпадают с id заголовков в `MarkdownView`.

## Раскладка, навигация и тема

- **Ширина страниц.** `PageContainer` (`src/components/layout/page-container.tsx`) задаёт горизонтальные границы: `narrow` (`max-w-3xl`), `default` (`max-w-5xl`), `wide` (`max-w-7xl`), отступы `px-4 sm:px-6`. Шапка, главная, админка и страницы пространства используют `wide`, поэтому края логотипа и контента совпадают. Формы и настройки ограничивают себя сами (`max-w-3xl`, `max-w-md`). `main` всегда с `id="main-content"`, на него ведёт skip-link «Перейти к содержимому».
- **Шапка.** `src/app/(app)/layout.tsx`: закреплена сверху (`sticky`), слева логотип и переключатель пространств, затем разделы текущего пространства (`WorkspaceSections`: Обзор, Проекты, Задачи, Документы, Участники, Настройки — последние только владельцу), справа меню пользователя. На мобильных разделы уходят второй строкой с горизонтальной прокруткой. Отдельной навигации пространства на странице нет. Роль в пространстве видна в переключателе.
- **Активный раздел.** Ссылки и правила активности — чистые функции в `src/components/layout/nav-items.ts` (`getWorkspaceSections`, `getProjectTabs`, `currentWorkspaceSlug`), покрыты тестами. Вкладки во всём приложении рисует `TabLink`: текст и акцентная полоса снизу у активной, `aria-current="page"`.
- **Шапка проекта.** `ProjectNav`: крошка «Проекты», название (`h1`), описание в одну строку, «Новая задача» и вкладки «Доска · Список · Настройки». На каждой странице ровно один `h1`.
- **Меню пользователя.** Фото (или инициалы) открывает список: имя и email, «Профиль», «Мои задачи», «Уведомления», «Горячие клавиши», «Справка», «Администрирование» (только администратору), выбор темы, «Выйти». Слева от меню — колокольчик уведомлений. Server Action выхода передаётся в клиентский компонент пропсом из серверного `UserMenu`.
- **Тема.** Палитра в `src/app/globals.css`: холодные нейтральные цвета одной гаммы и приглушённый индиго-акцент, тени карточек `shadow-card` / `shadow-card-hover`. Тёмная тема — класс `dark` на `<html>` через `next-themes` (`ThemeProvider` в `src/app/layout.tsx`), по умолчанию «как в системе», выбор хранится в `localStorage`.
- **Дизайн-система.** Правила — [`docs/design.md`](design.md), живой UI-кит — `/admin/design` (только администратору).
  - *Токены.* Кроме токенов shadcn в `globals.css` есть семантические `--success`, `--warning`, `--info` (с `*-foreground`), цвет бренда `--brand`, тона статусов `--tone-{gray,blue,green,amber,red,violet}` (и `-strong` под белый текст) и размер `text-2xs`. Каталог с подписями — `src/components/design-system/token-catalog.ts`; там же `STATIC_HEX` для писем, фавикона и `themeColor`. Тест сверяет каталог с CSS и пересчитывает HEX из OKLCH.
  - *Тона.* `src/components/design-system/tones.ts` переводит смысл в классы: `statusTone`, `pullRequestTone`, `reviewTone`, `checksTone`, `priorityTone` и карты `TONE_TEXT` / `TONE_FILL` / `TONE_SOFT`. Компоненты статусов, PR и приоритетов берут цвет только отсюда.
  - *Общие компоненты.* `layout/page-header.tsx` — `PageHeader` (единственный способ вывести `h1`) и `SectionHeading` (`h2`); `feedback/` — `EmptyState`, `Callout`, `ToneBadge` / `ToneDot`; загрузка — `ui/skeleton`.
  - *Бренд.* `src/components/brand/` — `Logo`, `LogoMark` и геометрия знака (`mark-geometry.ts`); файлы — `public/brand/`, иконки приложения — `src/app/icon.svg`, `favicon.ico`, `apple-icon.png`, `manifest.ts`. PNG и ICO собирает `pnpm brand:icons` (`scripts/brand/`); тест сверяет SVG-файлы с геометрией.
  - *Письма.* Общий шаблон `renderMailLayout` (`src/shared/mail/mail-layout.ts`): логотип, текст, кнопка цвета бренда, подвал.
  - *Защита от расхождений.* `style-guard.test.ts` в `pnpm check` запрещает в `src/**/*.tsx` цвета палитры Tailwind, цвета в скобках, HEX в `style` и `text-[11px]`. Исключения — `ALLOWED_FILES` с причиной (сейчас только `entity-icon.tsx`). Правила для агентов — `.ai-factory/rules/design.md` (`rules.frontend` в `.ai-factory/config.yaml`).
- **Доска.** На ширине от `sm` доска занимает высоту экрана под шапкой (правило `main:has([data-board])` в `globals.css`, высота шапки — `--app-header-h`), у колонок своя вертикальная прокрутка. Края ленты колонок затухают (`edge-fade-x`), если колонки не помещаются. Приоритет на карточке — индикатор из трёх делений (`priority-level.ts`); цветом и подписью выделены только «Высокий» и «Срочный».
- **Полоса прокрутки.** `scrollbar-gutter: stable` на `<html>`: контент не сдвигается между страницами с прокруткой и без. Отступ, который Radix добавляет при открытом меню, отключён в `globals.css`.
- **404.** `src/app/not-found.tsx` — для неизвестных адресов (без шапки). `src/app/(app)/w/[workspaceSlug]/not-found.tsx` — для `notFound()` внутри пространства: шапка остаётся, ссылка ведёт к проектам пространства.

## HTTP-эндпоинты

### `/api/auth/*`

Обработчик Better Auth (`getAuth().handler`, методы `GET` и `POST`). UI использует Server Actions, а этот эндпоинт нужен для колбэков OAuth: входа через IdP (`/api/auth/callback/plwedding`) и привязки GitHub (`/api/auth/callback/github`). Перед обработкой запроса загружаются конфиг GitHub App и discovery IdP. `/sign-in/social` принимает только провайдер `plwedding` (иначе `403 SIGN_IN_PROVIDER_NOT_ALLOWED`). Запросы ограничены лимитом Better Auth в БД (см. [«Лимиты попыток»](#лимиты-попыток)). Ошибки отдаются в формате Better Auth, а не в едином формате `{ error: { code, message } }`.

### `GET /api/attachments/[attachmentId]`

Скачивание вложения. proxy не обрабатывает `/api`, поэтому сессию проверяет сам обработчик. Нет сессии, нет доступа к пространству, файл не подтверждён, черновик другого пользователя — во всех случаях ответ `404`, существование файла не раскрывается. Иначе ответ `302` на presigned GET (60 секунд) с `Cache-Control: private, no-store` и `Referrer-Policy: no-referrer`. `?inline=1` открывает картинку в браузере (миниатюры); для остальных типов параметр игнорируется.

### `GET /api/documents/[documentId]/file`

Файл документа. Как у вложений: сессию проверяет сам обработчик; нет сессии, нет доступа к пространству документа или загрузка не подтверждена — `404`. Файл — `302` на presigned GET (60 секунд, медиа `inline` — 1 час). `?inline=1` открывает в браузере картинки, PDF, аудио и видео; остальные типы всегда скачиваются. Заметка отдаётся как `text/markdown` с `Content-Disposition: attachment` (`<название>.md`). Заголовки: `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, у заметки — `X-Content-Type-Options: nosniff`.

### `GET /api/idp-avatar/[sub]`

Фото профиля из IdP (`User.image = /api/idp-avatar/<sub>?v=<версия>`). Нужна сессия Tasker; без неё или с неверными `sub` и `v` — `404`. Иначе `302` на `<OIDC_ISSUER>/api/users/<sub>/avatar?v=<версия>` с `Cache-Control: private, max-age=86400` и `Referrer-Policy: no-referrer`: `v` меняется при смене фото, поэтому редирект можно кешировать сутки. Фото агентов — статичный `/agent-avatar.svg`, без этого эндпоинта.

### `GET /api/w/[workspaceSlug]/members/[userId]/card`

Данные карточки участника при наведении: `{ userId, name, email, image, position, role, isAgent, responsibleName, openCount, overdueCount }`. Пространство ищется по slug только среди пространств смотрящего, участник — как на странице профиля. Чужое пространство, не участник или нет сессии — `404`. `Cache-Control: private, no-store`.

### `GET /api/realtime/w/[workspaceSlug]`

Поток событий пространства (`text/event-stream`), см. [«Обновления в реальном времени»](#обновления-в-реальном-времени). Пространство ищется по slug только среди активных пространств пользователя. Нет сессии — `401`, чужое пространство — `404`, больше 6 потоков у пользователя — `429`. В событиях только идентификаторы; раз в 5 минут доступ проверяется заново, при его потере приходит `revoked` и поток закрывается.

### `GET /api/w/[workspaceSlug]/tasks/export`

Экспорт списка задач в CSV, см. [«Экспорт в CSV»](#экспорт-в-csv). Параметры — как у списка задач пространства, плюс `projectId` для вкладки проекта. Нет сессии — `401`, чужое пространство или неверный `projectId` — `404`, больше 10 выгрузок в минуту — `429`. Ответ: `text/csv; charset=utf-8`, `Content-Disposition: attachment` с `filename*`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`; если задач больше 10 000 — `X-Tasker-Truncated: 1`.

### `GET /api/notifications`

Последние 10 уведомлений текущего пользователя и число непрочитанных: `{ items, hasMore, unreadCount }`. Без сессии — `401`. `GET /api/notifications/unread-count` → `{ unreadCount }` для опроса счётчика. Ответы не кешируются.

### `POST /api/mcp`

MCP-сервер (Streamable HTTP, без сессий) для агентов, см. [MCP-сервер для агентов](#mcp-сервер-для-агентов). Заголовок `Authorization: Bearer tkr_…`.

| Ответ | Когда |
|-------|-------|
| `200` | JSON-RPC ответ |
| `401` | Нет токена, неверный, отозван, истёк, пользователь заблокирован или не участник, агент отключён. JSON-RPC ошибка `-32001` и `WWW-Authenticate: Bearer` |
| `413` | Тело больше 1 МБ |
| `405` | `GET` и `DELETE` — сервер без сессий и SSE, `Allow: POST` |

Ответы не кешируются (`Cache-Control: no-store`).

### `POST /api/webhooks/github`

Вебхуки GitHub App. Сессии нет — доверие только подписи `X-Hub-Signature-256` по сырому телу. Интеграция не настроена — `404`, тело больше 10 МБ — `413`, неверная подпись — `401`, некорректные заголовки или JSON — `400`. Иначе `200 { "result": "handled" | "ignored" | "duplicate" }`; ошибка обработки — `500` в едином формате (доставку можно повторить из GitHub). Подробнее — [Интеграция с GitHub](github.md#вебхук).

### `POST /api/cron/reminders`

Запуск [напоминаний о сроке](#напоминания-о-сроке) планировщиком (systemd-таймер на сервере, `pnpm reminders:run` локально). Сессии нет — доверие только заголовку `Authorization: Bearer <CRON_SECRET>`; секрет сравнивается по SHA-256 через `timingSafeEqual`.

| Статус | Когда |
|--------|-------|
| `404` | `CRON_SECRET` не задан — эндпоинт выключен |
| `401` | Нет заголовка или секрет неверный (`WARN` `[cron.reminders] unauthorized`, без значения) |
| `200` | `{ "result": { "dueSoon": 1, "overdue": 2, "skipped": 0, "failedBatches": 0 } }` |
| `500` | Непредвиденная ошибка, единый формат |

Ответы не кешируются (`Cache-Control: no-store`). Повторный вызов безопасен: уже отправленные напоминания пропускаются (`skipped`).

### `POST /api/cron/cleanup`

Ежедневная очистка планировщиком (systemd-таймер `tasker-cleanup`, `pnpm cleanup:run` локально): события [журнала](#журнал-действий) старше `AUDIT_RETENTION_DAYS` и истёкшие счётчики `ActionRateLimit` (их чистит и сам лимитер — в фоне, на 1 из 50 вызовов). Авторизация и коды `404` / `401` / `500` — как у `/api/cron/reminders` (общий `src/app/api/cron/cron-auth.ts`).

| Статус | Когда |
|--------|-------|
| `200` | `{ "result": { "auditDeleted": 120, "auditCutoff": "2026-04-22T00:00:00.000Z", "rateLimitDeleted": 37 } }` |

Повторный вызов безопасен.

### `GET /api/integrations/github/setup`

Setup URL GitHub App: `installation_id`, `setup_action`, `state`. Без сессии — `303` на `/login?returnTo=…`. Успех — `303` на `/w/<slug>/settings/github?connected=1`, ошибка — `?error=state|forbidden|failed` без деталей. Без `state` («Redirect on update») — `303` на `/`. Адреса редиректов строятся от `BETTER_AUTH_URL`: за прокси `request.url` указывает на внутренний хост.

### `GET /api/integrations/github/manifest`

`redirect_url` манифеста GitHub App: `code`, `state`. Без сессии — `303` на `/login?returnTo=…`. Только администратор (state подписан, живёт час, привязан к начавшему администратору). Обмен `POST /app-manifests/{code}/conversions` → сохранение ключей → `303` на `/admin/integrations?created=1`; ошибка — `?error=state|forbidden|conflict|failed` без деталей.

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
- [Конфигурация](configuration.md): SMTP (письма-приглашения и уведомления), настройки плагина `organization`, хранилище и CORS для вложений и документов, вход через IdP
- [Разработка](development.md): линтеры, тесты, ручные правки миграций
- [Интеграция с GitHub](github.md): GitHub App, вебхуки, связи с задачами
- [Claude Code и MCP](agents.md): токены доступа, инструменты и промпты агента
- [`.ai-factory/ARCHITECTURE.md`](../.ai-factory/ARCHITECTURE.md): полные правила и примеры кода
