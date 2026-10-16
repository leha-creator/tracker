# AGENTS.md

> Структурная карта проекта для AI-агентов и новых разработчиков. Обновляйте при существенных изменениях структуры.

## Обзор проекта

Tasker — простой таск-трекер с рабочими пространствами, ролями (admin / владелец пространства / участник), канбан-доской и списком задач; задача может находиться в нескольких проектах со своим статусом в каждом и иметь подзадачи любой вложенности (по желанию — на доске). Регистрация с подтверждением email, сброс пароля, необязательная 2FA (TOTP) и список активных сессий; лимиты попыток входа в БД. Есть профили пользователей (фото, должность, описание), @упоминания в комментариях и уведомления (в приложении и письмом). Необязательная интеграция с GitHub: GitHub App, вход через GitHub, привязка PR, веток и коммитов к задачам по ключу `TSK-42`, автосмена статуса. Агенты (Claude Code) работают с задачами и документами через MCP-сервер `/api/mcp` — как агенты пространства (отдельные участники со своими токенами, правами и ответственным) или по личному токену; у токена есть области, изменения пишутся в журнал. У каждого пространства — раздел «Документы»: папки, теги, Markdown-заметки и файлы с просмотром, привязка к задачам. Подробности — в [`.ai-factory/DESCRIPTION.md`](.ai-factory/DESCRIPTION.md).

## Технологический стек

- **Язык программирования:** TypeScript (strict)
- **Фреймворк:** Next.js 16 (App Router, Cache Components)
- **База данных:** PostgreSQL 17
- **ORM:** Prisma 7 (генератор `prisma-client`, driver adapter `@prisma/adapter-pg`)
- **Аутентификация:** Better Auth 1.7 — email + пароль с подтверждением email и сбросом по почте, плагин `admin` (глобальная роль `user` / `admin`), плагин `organization` (пространства: роли `owner` / `member`, приглашения), плагин `twoFactor` (TOTP + резервные коды; QR — пакет `qrcode`); rate limit в БД
- **UI:** Tailwind CSS v4 + shadcn/ui (radix)
- **Хранилище файлов:** S3 API, локально MinIO (`pgsty/minio`)
- **Почта:** SMTP через nodemailer, локально Mailpit (UI http://localhost:8025)
- **GitHub:** пакет `octokit` (GitHub App, вебхуки); включается из админки (манифест GitHub App) или переменными `GITHUB_*`
- **MCP:** `@modelcontextprotocol/sdk` (Streamable HTTP без сессий) — сервер для AI-агентов
- **Инфраструктура кода:** pino (логи), Zod (валидация), Vitest, ESLint + Prettier, husky + lint-staged
- **Пакетный менеджер:** pnpm (через corepack)
- **Контейнеры и CI:** Docker (multi-stage, standalone Next.js, `node:24-alpine`), GitHub Actions

## Структура проекта

```
tasker/
├── .ai-factory/              # Контекст AI Factory (описание, архитектура, правила, планы)
├── .claude/                  # Скиллы и субагенты
├── .github/workflows/ci.yml  # CI/CD: pnpm check + build, миграции на чистом Postgres, образ и smoke-тест; на main — GHCR и деплой
├── prisma/
│   ├── schema.prisma         # Схема БД: модели Better Auth (User, Session, …), пространств (Workspace, WorkspaceMember, WorkspaceInvitation), проектов (Project, ProjectStatus), задач (Task, TaskPlacement, WorkspaceTaskCounter, TaskComment, TaskAttachment), профилей (UserProfile), уведомлений (Notification, NotificationPreference), документов (DocumentFolder, Document, DocumentTag, DocumentTagAssignment, TaskDocumentLink), GitHub (GithubInstallation, GithubRepository, GithubPullRequest, TaskPullRequest, TaskGithubBranch, TaskGithubCommit, GithubWebhookDelivery, GithubProjectAutomation, GithubAppConfig), токенов (ApiToken: области, issuedById), безопасности входа (TwoFactor, User.twoFactorEnabled, RateLimit — лимит Better Auth, ActionRateLimit — лимит Server Actions), агентов (WorkspaceAgent, User.isAgent), журнала MCP (McpActivity), пометки «через агента» (createdViaTokenId у Task, TaskComment, Document); Workspace.taskKey — ключ задач (TSK-42); Task.parentId — подзадачи (составной FK, каскад)
│   └── migrations/
├── prisma.config.ts          # Подключение Prisma CLI (DATABASE_URL, миграции)
├── src/
│   ├── proxy.ts              # Оптимистичный редирект на /login по session-cookie (не авторизация)
│   ├── app/                  # Представление (Next.js): страницы, layout, route handlers
│   │   ├── (auth)/           # /login (+ two-factor — второй шаг 2FA), /register, /forgot-password, /reset-password, /verify-email
│   │   ├── not-found.tsx     # 404 для неизвестных адресов (+ w/[workspaceSlug]/not-found.tsx внутри пространства)
│   │   ├── (app)/            # Защищённая зона: sticky-шапка (переключатель и разделы пространства, колокольчик уведомлений, меню пользователя, skip-link), /, /admin (→ /admin/users, + integrations — GitHub App),
│   │   │                     # / (+ ?create=workspace — панель «Новое пространство»), /w/[workspaceSlug] (+ ?create=project — панель «Новый проект»; settings, settings/members, settings/github, settings/agents, settings/agents/[agentId]), /invite/[invitationId],
│   │   │                     # /w/[workspaceSlug]/projects/[projectId]/{board,list,settings} (/workspaces/new и projects/new — редиректы на панели),
│   │   │                     # /w/[workspaceSlug]/tasks (+ new, [taskNumber]), /w/[workspaceSlug]/members/[userId] (публичный профиль),
│   │   │                     # /w/[workspaceSlug]/docs (+ new, [documentId], [documentId]/edit) — документы пространства,
│   │   │                     # /profile (+ notifications, account, security — пароль, 2FA, сессии; tokens, tokens/[tokenId] — журнал токена), /notifications
│   │   └── api/
│   │       ├── auth/[...all]/ # Better Auth handler
│   │       ├── attachments/[attachmentId]/ # GET — проверка доступа и 302 на presigned-ссылку файла
│   │       ├── documents/[documentId]/file/ # GET — файл документа (302 на presigned-ссылку) или Markdown заметки
│   │       ├── users/[userId]/avatar/ # GET — фото профиля (общее пространство или admin), 302 на presigned-ссылку
│   │       ├── w/[workspaceSlug]/members/[userId]/card/ # GET — данные карточки участника при наведении
│   │       ├── notifications/ # GET — последние уведомления и счётчик (+ unread-count для опроса)
│   │       ├── mcp/          # POST — MCP-сервер для агентов (Bearer-токен, JSON без SSE); GET/DELETE — 405
│   │       ├── webhooks/github/ # POST — вебхуки GitHub App: подпись, идемпотентность, обработчики событий
│   │       ├── integrations/github/setup/ # GET — Setup URL GitHub App: проверка state и доступа, подключение установки
│   │       ├── integrations/github/manifest/ # GET — возврат после создания GitHub App из админки: обмен code на ключи
│   │       └── health/       # GET /api/health — состояние БД и хранилища
│   ├── modules/              # Доменные модули
│   │   ├── auth/             # Вход, регистрация, выход; срезы password (сброс и смена), verification (повторное письмо), two-factor (шаг входа и управление), session (активные сессии); models — returnTo, TOTP, User-Agent (client.ts — для клиентских компонентов)
│   │   ├── workspaces/       # Пространства, участники (+ права «Управление проектами» и «Управление документами»), приглашения (index.ts — сервер, client.ts — клиент)
│   │   ├── projects/         # Проекты и статусы-колонки: модели (StatusSet), срезы project/status
│   │   ├── tasks/            # Задачи: модели (TaskPlacement, позиции, запрос списка TaskListQuery, права на комментарии, правила вложений, дерево подзадач task-tree), @упоминания (comment-mentions), срезы task/placement/subtask/comment/attachment/views; зависит от projects, workspaces и notifications
│   │   ├── profiles/         # Профиль: UserProfile (должность, описание, ключ фото), фото по presigned POST, имя и User.image через auth.api.updateUser; зависит от workspaces
│   │   ├── notifications/    # Уведомления: notify/notifyByEmail для других модулей (никогда не бросают), настройки «тип × канал», письма через after(); ни от кого не зависит
│   │   ├── documents/        # Документы пространства: папки (дерево), Markdown-заметки (версия), файлы (presigned POST, квота), теги, связи с задачами; зависит от tasks
│   │   ├── integrations/github/ # GitHub App (пакет octokit): установки и репозитории, вебхуки, PR (ревью, CI), ветки и коммиты задач, ручная привязка, автосмена статуса, уведомления о PR, привязка GitHub-аккаунта, создание GitHub App из админки по манифесту (app-setup); зависит от tasks, projects, workspaces, notifications
│   │   ├── agents/           # Агенты пространства: служебный User (isAgent) + WorkspaceAgent, членство в обход плагина, ответственный, права, отключение/включение; зависит от api-tokens
│   │   ├── api-tokens/       # Токены доступа (личные и агентов): области (scopes), выпуск, отзыв, authenticateApiToken → AuthSession (роль user, via); срез activity — журнал действий MCP; зависит только от shared
│   │   ├── agent-mcp/        # MCP-сервер: инструменты задач (чтение, создание, статус, родитель, комментарии, вложения через presigned POST и curl) и документов (поиск, чтение, заметки с версией, загрузка, папки, теги, связи), области токена (TOOL_SCOPES), журнал, правила GitHub, промпты start_task/finish_task; зависит от api-tokens, tasks, projects, workspaces, documents, integrations/github
│   │   └── admin/            # Администрирование ресурса: модели (правила над пользователями, запрос списка), срез user (чтение — репозиторий, изменения — плагин admin через callAdminApi); зависит от workspaces и profiles
│   ├── components/
│   │   ├── layout/           # Каркас: PageContainer (ширина страниц), WorkspaceSections и TabLink (навигация),
│   │   │                     # nav-items.ts (чистые функции активного раздела), ThemeProvider (next-themes), NotFoundMessage, SettingsSection (секция настроек без карточки: заголовок слева, поля справа, разделитель), SidePanel (модальная панель справа) и create-panel-href (адреса панелей создания)
│   │   ├── auth/             # Формы входа/регистрации, «Забыли пароль?», новый пароль, повторное письмо, шаг 2FA, меню пользователя (аватар, тема, выход)
│   │   ├── forms/            # FormField, FormError, ConfirmActionDialog (подтверждение; управляемый режим open/onOpenChange)
│   │   ├── admin/            # Навигация админки; github-app-setup — мастер GitHub App; users/ — таблица пользователей, фильтры (URL), меню действий, диалоги блокировки и удаления
│   │   ├── workspaces/       # Список, переключатель, участники, приглашения
│   │   ├── projects/         # Список проектов, навигация проекта, настройки проекта и статусов (settings-draft — общее сохранение настроек плавающей панелью снизу)
│   │   ├── tasks/            # Канбан-доска (dnd-kit), карточка, быстрое создание, поля задачи (режим чтения), размещения;
│   │                         # task-panel/ — панель задачи справа (?task=<номер> / ?task=new): оболочка, просмотр и создание (общие с /tasks/[n] и /tasks/new), адреса панели;
│   │                         # task-list/ — список задач: фильтры, сортировка, пагинация (состояние в URL);
│   │                         # comments/ — комментарии на странице задачи: лента, добавление, правка, удаление, файлы, подсказка @ и подсветка упоминаний;
│   │                         # attachments/ — вложения: очередь загрузки (presigned POST), зона перетаскивания, список, миниатюры;
│   │                         # subtasks/ — подзадачи: раздел в задаче, строка (вывести на доску, отвязать), быстрое добавление, выбор родителя, хлебные крошки
│   │   ├── entity-icon/      # EntityIconTile (иконка пространства или проекта на цветной плитке), EntityIconPicker (выбор в формах)
│   │   ├── users/            # UserAvatar (фото или инициалы), UserHoverCard (карточка участника при наведении, данные — по запросу)
│   │   ├── profile/          # Свой профиль: вкладки, фото, форма «О себе», матрица настроек уведомлений; security/ — смена пароля, мастер 2FA (QR, резервные коды), активные сессии
│   │   ├── api-tokens/       # Токены доступа (профиль и страница агента): таблица, выпуск с областями и командами подключения, отзыв, лента журнала
│   │   ├── agents/           # Раздел «Агенты» (таблица, диалог создания и правки), ViaAgentBadge — пометка «через Claude Code»
│   │   ├── notifications/    # Колокольчик (опрос счётчика), элемент и лента уведомлений
│   │   ├── github/           # Раздел GitHub задачи, индикатор PR (доска, список), настройки GitHub пространства и проекта, привязка аккаунта, кнопка «Войти через GitHub»
│   │   ├── documents/        # Раздел «Документы»: дерево папок, список и фильтры (URL), загрузка, диалоги; markdown/ — безопасный рендер;
│   │   │                     # note-editor/ — редактор заметки; viewers/ — просмотр картинок, PDF, текста, CSV, JSON, медиа; task-documents/ — раздел в задаче
│   │   └── ui/               # shadcn/ui (генерируется CLI, вручную не править)
│   ├── lib/                  # utils.ts — cn() для shadcn; use-prefers-reduced-motion.ts — общий хук (доска, статусы); format-relative-time.ts — «2 часа назад» (уведомления, карточки проектов)
│   ├── generated/prisma/     # Сгенерированный Prisma Client (в .gitignore)
│   ├── shared/               # Сквозная инфраструктура
│   │   ├── auth/             # Конфиг Better Auth (getAuth), getSession() → DTO, getFreshSession() (в обход cookie-кеша); письма аутентификации (auth-emails), чистые опции (auth-options: лимиты /api/auth/*, синтетический пользователь)
│   │   ├── access/           # Глобальные роли, роли и права пространства, requireUser/requireAdmin, requireWorkspaceAccess(BySlug), requireWorkspacePermission
│   │   ├── env/              # Валидация переменных окружения (Zod, ленивая)
│   │   ├── logger/           # pino: createLogger(scope), redact секретов, maskEmail()
│   │   ├── errors/           # AppError, доменные ошибки, toActionError, toErrorResponse
│   │   ├── types/            # ActionResult<T>, FormState<T> для useActionState
│   │   ├── db/               # Prisma singleton, checkDatabase(), isUniqueViolation()
│   │   ├── github-app/       # Конфиг GitHub App: GITHUB_* или запись из админки (зашифрована), кеш процесса
│   │   ├── entity-icon/      # Каталог предустановленных иконок пространств и проектов: ключи, подписи, resolveEntityIcon (иконка по id, если не выбрана)
│   │   ├── text/             # transliterate() — для slug, ключей задач и имён веток
│   │   ├── storage/          # S3-клиенты (сервер и подпись ссылок), presigned POST/GET, HeadObject, удаление пачками, checkStorage()
│   │   ├── mail/             # sendMail() (nodemailer), sendMailInBackground() (after()), escapeHtml()
│   │   ├── rate-limit/       # enforceRateLimit(action, { ip, email?, userId? }) — лимиты Server Actions (ActionRateLimit), getClientIp(), правила RATE_LIMITS
│   │   └── health/           # checkHealth() — агрегирует проверки
│   └── test/                 # Вспомогательное для Vitest
├── deploy/                   # Сервер (https://tracker.plwedding.ru), см. docs/production.md
│   ├── bootstrap-server.sh   # Разовая подготовка сервера: /opt/edge, /opt/tasker, сеть edge, ключ деплоя, .env, таймеры бэкапов
│   ├── host/                 # Настройки хоста: docker-mss-clamp.service (MSS clamping, MTU сервера 1450)
│   ├── edge/                 # Общий edge-прокси (Caddy на 80/443 для всех проектов сервера), применяется вручную
│   └── tasker/               # Прод-стек: compose.yml, tracker.caddy (сайт), .env.example, backup.sh, systemd/
├── scripts/smoke-health.sh   # Ожидание 200 и {"status":"ok"} от /api/health (CI и ручная проверка)
├── compose.yml               # Postgres (порт 5433) + MinIO (9000/9001) + создание бакета + Mailpit (1025/8025)
├── compose.app.yml           # Оверлей: сервисы migrate (prisma migrate deploy) и app (образ runner)
├── Dockerfile                # Multi-stage: base → deps → builder → runner; отдельный лёгкий target migrate (Prisma CLI)
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
| `src/modules/projects/index.ts` | Проекты и статусы: actions и read-функции (`listProjects`, `getProject`, `listStatuses`, `listWorkspaceStatuses`; `client.ts` — для клиентских компонентов, в т.ч. `moveStatusAction` и чистая функция `reorderStatuses`) |
| `src/modules/tasks/index.ts` | Задачи, размещения, комментарии и вложения: actions и read-функции (`getTaskByNumber`, `listSubtasks`, `listTaskComments`, `listTaskAttachments`, `getAttachmentDownload`, `listTasks`, `listProjectTasks`, `getBoardCards`, `getMemberTaskSummary`, `getTaskSummaries`, `parseTaskListParams`; сервисы изменения для agent-mcp — `createTask`, `updateTask`, `addToProject`, `changeStatus`, `setTaskParent`, `createComment`; чистые функции упоминаний `extractMentions`, `filterMentionCandidates`, `findMentionQuery`; `client.ts` — для клиентских компонентов, в т.ч. `movePlacementAction`, `setTaskParentAction`, `searchParentCandidatesAction` и чистые функции переноса карточек) |
| `src/modules/documents/index.ts` | Документы пространства: `listDocuments`, `parseDocumentListParams`, `listFolderTree`, `getDocument`, `getDocumentText`, `getDocumentFile` (для `/api/documents/[id]/file`), `getWorkspaceStorageUsage`, `listTags`, `listTaskDocuments`, `listDocumentTasks`; сервисы изменения для agent-mcp — `createNote`, `updateNote`, `createFolder`, `setDocumentTags`, `linkDocumentToTask`, `unlinkDocumentFromTask`, `requestDocumentUpload`, `completeDocumentUpload`; actions папок, заметок, загрузки, тегов и связей с задачами (`client.ts` — в т.ч. `applyMarkdownFormat`, `parseDelimited`) |
| `src/modules/profiles/index.ts` | Профили: `getMyProfile`, `getProfileCards`, `getAvatarDownload`, `prepareAvatarCleanup`; actions профиля и фото (`client.ts` — в т.ч. `isAvatarUrl`) |
| `src/modules/notifications/index.ts` | Уведомления: `notify`, `notifyByEmail` (для модулей), `listMyNotifications`, `countMyUnreadNotifications`, `getMyNotificationPreferences`; actions прочтения и настроек (`client.ts`) |
| `src/modules/admin/index.ts` | Пользователи ресурса: `listAdminUsers`, `parseAdminUserListParams`; actions блокировки, роли, сессий и удаления (`client.ts` — для клиентских компонентов) |
| `src/modules/integrations/github/index.ts` | GitHub: `isGithubEnabled`, `handleGithubWebhook`, `verifyGithubWebhookSignature`, `completeInstallation`, `getGithubSettings`, `listTaskPullRequests`, `listTaskBranchesAndCommits`, `getPullRequestBadges`, `getProjectAutomation`, `getMyGithubAccount`, `getGithubAppSetup`, `completeGithubAppManifest`, `getWorkspaceGithubSummary` (сводка для любого участника), `findTaskReferences` (`client.ts` — actions установки, привязки, автоматизации, типы DTO, `suggestBranchName`) |
| `src/modules/agents/index.ts` | Агенты пространства: `listAgents`, `getAgent` (`client.ts` — actions создания, правки, отключения и включения) |
| `src/modules/api-tokens/index.ts` | Токены: `authenticateApiToken`, `listMyApiTokens`, `listAgentTokens`, `revokeAllUserApiTokens` (для agents), `hasScope`, журнал — `recordActivity`, `listAgentActivity`, `listTokenActivity`, `parseActivityCursor` (`client.ts` — actions выпуска и отзыва личных и агентских токенов, области, `buildClaudeMcpCommand`, `buildMcpJson`) |
| `src/modules/agent-mcp/index.ts` | `handleMcpRequest` — MCP-сервер Tasker (инструменты в `tools/`, области, правила GitHub, документы и промпты — чистые функции в `models/`) |
| `src/shared/auth/agent-session-guard.ts` | Хук Better Auth: агенту пространства сессия не выдаётся |
| `src/app/api/mcp/route.ts` | MCP-эндпоинт для агентов |
| `src/app/api/webhooks/github/route.ts` | Вебхуки GitHub App |
| `src/modules/auth/index.ts` | Вход, регистрация, выход; сброс и смена пароля, подтверждение email, 2FA (`getMyTwoFactorState`, `hasPendingTwoFactorSignIn`), сессии (`listMySessions`); `client.ts` — actions и типы для клиентских компонентов |
| `src/shared/rate-limit/index.ts` | `enforceRateLimit`, `getClientIp`, `RATE_LIMITS` — лимиты попыток для Server Actions |
| `src/proxy.ts` | Оптимистичный редирект неавторизованных на `/login` |
| `src/app/api/health/route.ts` | Health check инфраструктуры |
| `compose.yml` | Локальная инфраструктура |
| `Dockerfile` / `compose.app.yml` | Образ приложения и миграций, запуск стека в Docker |
| `.github/workflows/ci.yml` | GitHub Actions: проверки, публикация образов, деплой и откат |
| `deploy/tasker/compose.yml` | Прод-стек на сервере (без портов на хост, сеть `edge`) |
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
| Конфигурация | `docs/configuration.md` | Переменные окружения, docker-compose, порты, хранилище и CORS |
| Архитектура | `docs/architecture.md` | Слои, границы ESLint, аутентификация и её безопасность (подтверждение email, сброс пароля, 2FA, сессии, лимиты попыток), пространства, проекты, задачи, доска, список, комментарии, @упоминания и вложения, профили, уведомления, администрирование, раскладка, навигация и тема, доступ, HTTP-эндпоинты |
| Логирование и ошибки | `docs/logging-and-errors.md` | `createLogger`, `AppError`, `ActionResult` |
| Разработка | `docs/development.md` | Команды, линтеры, тесты, Prisma |
| Docker-образ и CI | `docs/deployment.md` | Dockerfile, `compose.app.yml`, миграции, smoke-скрипт, GitHub Actions |
| Продакшен | `docs/production.md` | Сервер, edge-прокси, прод-стек, CD и откат, резервные копии, почта |, GitHub App на сервере |
| Интеграция с GitHub | `docs/github.md` | GitHub App, вебхуки, ключ задач, привязка PR, автосмена статуса |
| Claude Code и MCP | `docs/agents.md` | Токены доступа, подключение агента, инструменты и промпты; шаблоны для другого репозитория — `docs/agents/` |

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
