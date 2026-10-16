# План реализации: доступ агента Claude Code к задачам (MCP-сервер и токены)

Branch: none (git.create_branches = false — работа в текущей ветке)
Created: 2026-10-16

## Settings

- Testing: yes — Vitest (`environment: node`) рядом с кодом: чистые модели (токен, разбор ссылок на задачу, выбор статуса, текст инструкций по GitHub), сервис токенов на моках репозитория, обработчики MCP-инструментов на моках сервисов, Route Handler `/api/mcp` (401, `initialize`, `tools/list`, `tools/call`). Образец — существующие `*.service.test.ts` и тесты route handlers.
- Logging: verbose — через `createLogger(scope)`. DEBUG на чтениях и разборе запросов MCP (метод, имя инструмента, `tokenId`, `workspaceId`). INFO на изменениях: выпуск и отзыв токена, создание задачи, смена статуса, комментарий через агента. WARN на отказах: неверный, отозванный или истёкший токен, нет членства, ошибка валидации аргументов инструмента. ERROR на неожиданных сбоях обработчика. **Никогда не логировать** сам токен, его хеш, заголовок `Authorization`, тексты задач и комментариев. Логировать только `tokenId`, префикс токена, `userId`, `workspaceId`, `taskId`, номер задачи, имя инструмента.
- Docs: yes — обязательный docs-checkpoint в конце (Task 10).

## Roadmap Linkage

Milestone: "none"
Rationale: В `.ai-factory/ROADMAP.md` нет подходящего этапа. После реализации можно добавить этап «Доступ для AI-агентов (MCP)» через `/aif-roadmap`.

## Предусловия

- Перед кодом прочитать документацию из `node_modules`:
  - Next.js 16: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (Route Handlers, чтение тела запроса, заголовки ответа), `.../02-route-segment-config/` (динамичность маршрута при Cache Components), `.../04-functions/after.md`.
  - MCP TypeScript SDK (`@modelcontextprotocol/sdk`): `McpServer`, `registerTool`, `registerPrompt`, параметр `instructions`, транспорт Streamable HTTP для Web Standard `Request`/`Response` (`WebStandardStreamableHTTPServerTransport`) в режиме без сессий (`sessionIdGenerator: undefined`, `enableJsonResponse: true`). Проверить, какую версию Zod принимает SDK (в проекте Zod 4).
- Версию SDK закрепить точной, не моложе двух недель (на 2026-10-16 последняя — `1.32.1`; проверить дату публикации через `npm view @modelcontextprotocol/sdk time`).
- Claude Code подключается к удалённому MCP-серверу так: `claude mcp add --transport http tasker <URL>/api/mcp --header "Authorization: Bearer <токен>"`, либо через `.mcp.json` с подстановкой `${TASKER_TOKEN}` из окружения. Сверить синтаксис с актуальной документацией Claude Code при написании docs.

## Требования

1. Агент Claude Code, работающий в **другом репозитории**, через MCP:
   - смотрит задачи: список с фильтрами и задачу целиком (поля, статусы в проектах, комментарии, привязанные PR, ветки, коммиты);
   - создаёт задачи (проект и статус, приоритет, срок, ответственный);
   - меняет поля задачи и её статус в проекте;
   - пишет комментарии (Markdown, `@Имя` для упоминаний работает как в интерфейсе).
2. Агент **понимает интеграцию с GitHub** и сам ставит нужные «метки»: называет ветку `tsk-42-…`, пишет `TSK-42` в коммитах, заголовке и описании PR. Задача должна гарантированно сматчиться с веткой и PR.
3. Доступ — по личному токену, выпущенному пользователем в профиле. Токен привязан к **одному пространству** и действует с правами владельца токена в этом пространстве. Админских прав у токена нет никогда.
4. Пользователь видит свои токены, может отозвать любой. Сам токен показывается один раз при создании.

## Ключевые решения

- **Транспорт — MCP Streamable HTTP внутри Tasker** (`POST /api/mcp`), без отдельного процесса. Ставить в другой репозиторий ничего не нужно: Claude Code подключает удалённый сервер по URL и токену. Режим stateless: на каждый запрос создаётся новый `McpServer`, ответ — JSON (`enableJsonResponse`), без SSE и без хранения сессий. Так работает за edge-прокси Caddy и в нескольких репликах. `GET` и `DELETE` отвечают `405`.
- **Свои токены, а не плагин Better Auth.** В `better-auth@1.7.6` нет плагина API-ключей: он вынесен в `@better-auth/api-key`, и нам не нужна его модель. Модель `ApiToken`: токен `tkr_` + 32 случайных байта (base64url). В БД хранится только SHA-256: у токена высокая энтропия, медленный хеш не нужен. Поиск идёт по уникальному индексу хеша. Префикс (первые 12 символов) хранится для показа в списке.
- **Токен → `AuthSession`.** Все сервисы модулей уже принимают `session: AuthSession` явно и сами проверяют доступ (`requireWorkspaceAccess`). Поэтому `authenticateApiToken()` строит синтетическую сессию:
  - `user` берётся из БД при каждом запросе: блокировка действует сразу;
  - `role` всегда `'user'`: `requireAdmin` для токена не сработает;
  - `session.id` = `api-token:<tokenId>`.

  После этого инструменты MCP вызывают **те же сервисы**, что и Server Actions, со всеми проверками и уведомлениями. `getSession()` и cookie не меняются: bearer принимается только в `/api/mcp`.
- **Пространство берётся из токена.** Ни один инструмент не принимает `workspaceId` от агента: `workspaceId` всегда из токена. Если пользователь вышел из пространства, токен перестаёт работать: `requireWorkspaceAccess` отдаёт NOT_FOUND, и маршрут отвечает 401. Удаление пространства удаляет токены каскадом.
- **Ссылки на задачи — как в GitHub:** `TSK-42`, `tsk-42`, `#42` или `42`. Ключ должен совпадать с ключом пространства. Проекты и статусы задаются по id или по имени без учёта регистра. Для статуса можно передать категорию (`todo` / `in_progress` / `done`): берётся первый статус этой категории в проекте. Неоднозначное имя → ошибка со списком вариантов.
- **Ответы инструментов** — компактный Markdown (`content: text`). `structuredContent` не отдаём: Claude Code показывает модели текст, дубль в JSON только раздувал бы ответ. Ошибки домена (`AppError`) возвращаются как `isError: true` с русским сообщением, чтобы агент мог исправиться. Неожиданные ошибки → общий текст и ERROR в лог.
- **Знания об интеграции с GitHub даём агенту тремя путями:**
  1. `instructions` MCP-сервера: Claude Code показывает их модели при подключении. Это короткая выжимка правил.
  2. Инструмент `get_workspace_context`: ключ пространства, подключённые репозитории, автосмена статуса по проектам, полные правила.
  3. Инструмент `preview_github_links(text)`: показывает, какие задачи сматчит имя ветки, заголовок PR или сообщение коммита. Работает на той же чистой функции `findTaskReferences`, что и вебхук, так что расхождений нет.

  Текст правил собирает чистая функция `buildGithubGuide()` из данных пространства. Правила те же, что в `docs/github.md`, и покрыты тестом.
- **MCP-промпты** `start_task` и `finish_task` в Claude Code доступны как `/mcp__tasker__start_task TSK-42`. Это сценарии работы:
  - `start_task`: прочитать задачу, перевести в «в работе» (если не настроена автосмена), создать ветку `suggestBranchName`, коммитить с ключом;
  - `finish_task`: открыть PR с `TSK-42` в заголовке, оставить комментарий-итог, не трогать статус, если его двинет автоматика.
- **Новые модули:**
  - `src/modules/api-tokens`: токены, зависит от `workspaces`;
  - `src/modules/agent-mcp`: сервер, инструменты, промпты, зависит от `tasks`, `projects`, `workspaces`, `integrations/github`, `api-tokens`.

  Ядро от них не зависит. Чтобы MCP мог вызывать сервисы `tasks`, их `index.ts` дополнительно экспортирует `createTask`, `updateTask`, `addToProject`, `changeStatus`, `createComment` (сейчас они доступны только через actions).
- **Подзадачи** (план `subtasks`, коммит `fb7f026`) поддерживаются агентом наравне с интерфейсом. Подзадача — обычная задача с `parentId` и своим ключом (`TSK-43`):
  - `create_task` принимает `parent`;
  - `set_task_parent` переносит задачу к другому родителю или в верхний уровень (сервис `setTaskParent` с проверкой циклов и глубины);
  - `get_task` показывает предков, прямые подзадачи и прогресс «N из M»;
  - `list_tasks` показывает родителя и умеет фильтр «только верхний уровень» (`topLevelOnly`).

  По умолчанию подзадача не размещена ни в одном проекте. Поэтому `set_task_status` для неразмещённой задачи требует `project`. Агент работает в ветке своей подзадачи и ставит в ветке и PR **только её ключ**: ключ родителя в тексте PR привяжет PR и к родителю.
- **Миграция** `add_api_tokens` получила метку `20261017090000` — позже уже закоммиченной `add_task_parent`, чтобы на сервере миграции шли по порядку.
- **Вне рамок** (записать в docs как ограничения): удаление задач и вложений через агента (прикрепление и чтение файлов добавлены в Task 11), отметка «создано агентом» в интерфейсе, rate limiting токенов, OAuth-авторизация MCP (вместо bearer-токена).

## Commit Plan

- **Commit 1** (после задач 1–3): `feat(api-tokens): personal access tokens scoped to a workspace`
- **Commit 2** (после задач 4–6): `feat(mcp): MCP endpoint with task read and write tools`
- **Commit 3** (после задач 7–8): `feat(mcp): GitHub conventions, link preview and workflow prompts`
- **Commit 4** (после задач 9–10): `docs: connect Claude Code to Tasker via MCP`

## Tasks

### Фаза 1. Токены доступа

- [x] **Task 1: Модель `ApiToken` и миграция**
  - `prisma/schema.prisma`: модель `ApiToken`:
    - `id` — `uuid(7)`;
    - `userId` → `User`, `onDelete: Cascade`;
    - `workspaceId` → `Workspace`, `onDelete: Cascade`;
    - `name` (до 60 символов), `prefix`, `tokenHash` (`@unique`);
    - `expiresAt?`, `lastUsedAt?`, `revokedAt?`, `createdAt`;
    - индексы `[userId, createdAt]` и `[workspaceId]`;
    - обратные связи в `User` и `Workspace`, `///`-комментарии в стиле схемы.
  - Миграция `pnpm db:migrate --name add_api_tokens`.
  - Логирование: не требуется (схема).

- [x] **Task 2: Модуль `api-tokens` — модели и сервис** (зависит от Task 1)
  - `src/modules/api-tokens/models/api-token.ts`, чистые функции:
    - `generateApiToken()` → `{ token, prefix, hash }` (`node:crypto` `randomBytes(32)`, base64url, префикс `tkr_`);
    - `hashApiToken(token)`;
    - `parseBearer(header)` → токен или `null` (схема `Bearer`, формат `^tkr_[A-Za-z0-9_-]{43}$`);
    - сроки `API_TOKEN_EXPIRY_OPTIONS` (30 / 90 / 365 дней / бессрочно), `isApiTokenActive(row, now)`;
    - `API_TOKENS_PER_USER_LIMIT = 20`.
  - `slices/token/`:
    - `token.schema.ts` (Zod: имя, `workspaceId`, срок);
    - `token.repository.ts`;
    - `token.service.ts`;
    - `token.actions.ts` (`createApiTokenAction`, `revokeApiTokenAction`, `revalidatePath('/profile', 'layout')`);
    - `token.dto.ts`.
  - Сервис:
    - `createApiToken(session, input)`: `requireWorkspaceAccess`, проверка лимита → `ValidationError`. Возвращает DTO и **открытый токен один раз**.
    - `listMyApiTokens(session)`: с названием пространства, без хеша.
    - `revokeApiToken(session, tokenId)`: только свой токен, чужой → `NotFoundError`. Повторный отзыв ничего не меняет.
    - `authenticateApiToken(authorizationHeader)` → `{ session: AuthSession, workspace: { id, slug, name, taskKey }, tokenId }`. Одна причина отказа для всех случаев → `UnauthorizedError`: нет заголовка, неверный формат, не найден, отозван, истёк, пользователь заблокирован. Членство проверяется через `requireWorkspaceAccess`, его `NotFoundError` превращается в `UnauthorizedError`. `lastUsedAt` обновляется не чаще раза в минуту, через `updateMany` с условием, без ожидания ответа.
  - `index.ts` (сервер) и `client.ts` (типы DTO, варианты сроков, actions). Добавить модуль в ESLint-границы, если там есть явный список.
  - Логирование: `createLogger('api-tokens')`:
    - INFO `[api-token] created` / `[api-token] revoked` (`tokenId`, `userId`, `workspaceId`, `prefix`);
    - WARN `[api-token.authenticate] rejected` (`reason`: `malformed` | `unknown` | `revoked` | `expired` | `banned` | `not_member`, `tokenId` если известен);
    - DEBUG `[api-token.authenticate] ok` (`tokenId`, `userId`, `workspaceId`).
  - Тесты:
    - модели: формат, хеш, `parseBearer` (регистр схемы, лишние пробелы, мусор), активность по сроку и отзыву;
    - сервис на моках: лимит, отзыв чужого, все причины отказа, роль всегда `user`, троттлинг `lastUsedAt`.

- [x] **Task 3: Вкладка «Токены доступа» в профиле** (зависит от Task 2)
  - Страница `src/app/(app)/profile/tokens/page.tsx` и вкладка в навигации профиля (рядом с «Уведомления» и «Аккаунт»).
  - `src/components/profile/api-tokens/`:
    - таблица: имя, пространство, префикс `tkr_abc…`, создан, последнее использование, истекает, статус;
    - диалог создания: имя, пространство из `listMyWorkspaces`, срок;
    - экран «скопируйте сейчас» с токеном и готовыми фрагментами: команда `claude mcp add --transport http tasker <BETTER_AUTH_URL>/api/mcp --header "Authorization: Bearer ${TASKER_TOKEN}"` и `.mcp.json` с `${TASKER_TOKEN}`; кнопки копирования;
    - отзыв через `ConfirmActionDialog`.
  - Базовый URL — из `env.BETTER_AUTH_URL` на сервере (передаётся пропом).
  - Состояние форм — `useActionState`, ошибки — `FormError`. Компоненты shadcn берутся из `src/components/ui`, недостающие ставятся через CLI.
  - Логирование: в клиентских компонентах `console.*` запрещён. Серверные события пишет сервис (Task 2).

### Фаза 2. MCP-сервер

- [x] **Task 4: Эндпоинт `/api/mcp` и каркас модуля `agent-mcp`** (зависит от Task 2)
  - Добавить `@modelcontextprotocol/sdk` точной версией (см. Предусловия).
  - `src/modules/agent-mcp/`:
    - `server.ts`: `createTaskerMcpServer(ctx)`, где `ctx = { session, workspace, tokenId }`. Регистрирует инструменты и промпты (Task 5–8) и задаёт `instructions` из Task 7;
    - `tool-result.ts`: обёртка `runTool(name, ctx, fn)`. Логирует вызов и длительность, переводит `AppError` → `isError: true` с `message`, неожиданную ошибку → общий текст и ERROR;
    - `index.ts`: `handleMcpRequest(request)`.
  - `handleMcpRequest`:
    - `authenticateApiToken(request.headers.get('authorization'))`, ошибка → `401` с `WWW-Authenticate: Bearer realm="tasker"` и JSON-RPC-ошибкой;
    - лимит тела 1 МБ → `413`;
    - новый `McpServer` и транспорт `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })`, затем `server.connect(transport)` и `transport.handleRequest(request)`;
    - сервер и транспорт закрываются после ответа.
  - `src/app/api/mcp/route.ts`: `POST` → `handleMcpRequest`; `GET` и `DELETE` → `405` с `Allow: POST`. Маршрут динамический: свериться с docs Next.js 16 и Cache Components; учесть урок из `4eac7f4`, где пришлось явно делать маршрут setup динамическим. `proxy.ts` не трогать: `/api` уже исключён из matcher.
  - Модели модуля (`models/`):
    - `parseTaskRef(input, taskKey)`: `TSK-42` / `tsk-42` / `#42` / `42` → номер. Чужой ключ → `ValidationError` с подсказкой правильного ключа;
    - `resolveProject(projects, ref)` и `resolveStatus(statuses, ref)`: id, имя без учёта регистра и «ё/е», категория. Неоднозначность или не найдено → `ValidationError` со списком вариантов.
  - `tasks/index.ts`: дополнительно экспортировать `createTask`, `updateTask`, `addToProject`, `changeStatus`, `createComment`, `setTaskParent` (`listSubtasks` уже экспортирован).
  - Логирование: `createLogger('mcp')`:
    - DEBUG `[mcp.request]` (`method` JSON-RPC, если разобран; `tokenId`, `workspaceId`);
    - DEBUG `[mcp.tool] call` / `done` (`tool`, `durationMs`);
    - WARN `[mcp.tool] rejected` (`tool`, `code` из `AppError`);
    - ERROR `[mcp.tool] failed` (`tool`, `err`).
  - Тесты:
    - `parseTaskRef`, `resolveProject`, `resolveStatus`;
    - route: без токена → 401 и заголовок; `GET` → 405; `initialize` и `tools/list` с валидным токеном (мок `authenticateApiToken`) → список инструментов.

- [x] **Task 5: Инструменты чтения** (зависит от Task 4)
  - `src/modules/agent-mcp/tools/read-tools.ts`.
  - `get_workspace_context`: пространство (имя, slug, ключ задач, URL), участники (id, имя, email — для ответственного и `@`-упоминаний), проекты со статусами (id, имя, категория, порядок), GitHub (Task 7). Источники: `listProjects`, `listWorkspaceStatuses`, участники из `workspaces`, `getGithubSettings` и `getProjectAutomation`.
  - `list_tasks`. Аргументы:
    - `query` — текст или `TSK-42`;
    - `project`, `status` (имя, id или категория);
    - `assignee` (`me` | userId | `none`), `priority`;
    - `topLevelOnly` — без подзадач (`TaskListQuery.topLevelOnly`);
    - `sort`, `page`.

    Собирает `TaskListQuery` и вызывает `listTasks`. Ответ: ключ, название, родитель (`↳ TSK-12`), приоритет, ответственный, статусы по проектам, срок, значок PR, общее число и страница.
  - `get_task(task)`: `getTaskByNumber` (в нём уже `ancestors`, `descendantCount`, `subtaskProgress`) + `listSubtasks` (прямые подзадачи со статусами и числом их подзадач) + `listTaskComments` (последние 30, с авторами) + `listTaskPullRequests` + `listTaskBranchesAndCommits` + рекомендованное имя ветки (`suggestBranchName`) + URL задачи `<BETTER_AUTH_URL>/w/<slug>/tasks/<n>`.
  - Все инструменты с `annotations: { readOnlyHint: true }`. Описания инструментов на английском (агенту так надёжнее), ответы — на языке данных.
  - Логирование: через `runTool`, плюс DEBUG `[mcp.list_tasks] query` (фильтры без текста поиска, `page`, `total`).
  - Тесты: сборка `TaskListQuery` из аргументов (в том числе `topLevelOnly`), форматирование ответа `get_task` (с GitHub и без него, с предками и подзадачами), неизвестная задача → `isError`.

- [x] **Task 6: Инструменты изменения** (зависит от Task 4)
  - `src/modules/agent-mcp/tools/write-tools.ts`.
  - `create_task`:
    - аргументы: `title`, `description` (Markdown), `priority`, `dueDate` (`YYYY-MM-DD`), `assignee` (`me` | userId), `parent` (ссылка на задачу → `parentId`), `project` и `status` (по умолчанию — первый статус категории `todo`);
    - без `project`: задача верхнего уровня встаёт в единственный проект пространства, если он один; иначе и для подзадач — без размещения (как в интерфейсе);
    - вызывает `createTask`;
    - ответ: ключ `TSK-43`, родитель, URL, рекомендованное имя ветки.
  - `set_task_parent(task, parent | null)` → `setTaskParent`: перенос к другому родителю или в верхний уровень. Ошибки цикла и глубины возвращаются агенту текстом.
  - `update_task(task, …)`: `title` / `description` / `priority` / `dueDate` / `assignee`, `null` очищает поле → `updateTask`.
  - `set_task_status(task, status, project?)`:
    - `project` можно не указывать, если задача в одном проекте; если в нескольких или ни в одном (частый случай у подзадач) — ошибка со списком проектов;
    - задача не в проекте → `addToProject`, иначе `changeStatus`;
    - ответ: «было → стало».
  - `add_comment(task, body)` → `createComment`. Упоминания `@Имя` разбираются сервисом как в интерфейсе, и уведомления уходят. В описании инструмента подсказать брать имена из `get_workspace_context`.
  - `annotations`: `destructiveHint: false`, у `set_task_status` и `update_task` — `idempotentHint: true`.
  - Логирование: INFO `[mcp.create_task] created` (`taskId`, `number`, `parentId`, `tokenId`), `[mcp.set_task_parent] changed` (`taskId`, `parentId`), `[mcp.set_task_status] changed` (`taskId`, `projectId`, `from`, `to`), `[mcp.add_comment] created` (`taskId`, `commentId`). Без текстов.
  - Тесты на моках сервисов:
    - статус по умолчанию при создании, подзадача без проекта не размещается;
    - выбор проекта при нуле, одном и нескольких размещениях;
    - `set_task_parent`: `null` → верхний уровень, ошибка цикла → `isError`;
    - добавление в проект;
    - `null` очищает поле;
    - `ForbiddenError` и `ValidationError` → `isError` с текстом.

### Фаза 3. GitHub и сценарии работы агента

- [x] **Task 7: Правила GitHub для агента и `preview_github_links`** (зависит от Task 5)
  - `src/modules/agent-mcp/models/github-guide.ts`: `buildGithubGuide({ taskKey, githubEnabled, repositories, automations })` → Markdown. Содержание:
    - ветка: `suggestBranchName` → `tsk-42-short-slug`, можно с префиксом `feature/TSK-42-…`;
    - коммит: `TSK-42: что сделано`;
    - заголовок PR: `TSK-42: …`, описание PR со ссылкой на задачу;
    - границы слова, без ведущих нулей (`TSK-012` не сработает), без учёта регистра;
    - **любой** другой ключ в тексте PR тоже привяжет PR к той задаче — чужие ключи не упоминать;
    - правка PR пересчитывает связи;
    - репозиторий должен быть выбран в пространстве (список выбранных); если репозитория нет в списке, агент сообщает пользователю, а не надеется на автопривязку;
    - автосмена статуса по проектам: «PR открыт → X, PR слит → Y», только вперёд. Если автосмена настроена, агент **не** двигает статус вручную на этих шагах, иначе ставит «в работе» при старте и нужный статус после слияния;
    - GitHub не подключён → ключ в ветках всё равно ставить, но привязки не будет, сообщить пользователю;
    - подзадачи: у каждой свой ключ. Работа над подзадачей — в ветке с её ключом. В PR не упоминать ключ родителя (иначе PR привяжется и к нему); связь с родителем видна в Tasker.
  - Короткая версия (5–8 строк) для `instructions` сервера, полная — в `get_workspace_context.github.guide` и в отдельном инструменте `get_github_conventions`.
  - Экспорт из `integrations/github/index.ts` (или `client.ts`): `findTaskReferences`, `suggestBranchName` (уже в `client.ts` — проверить), чтение выбранных репозиториев и автоматизаций без UI-специфики. Если `getGithubSettings` требует права владельца, добавить сервисную функцию `getWorkspaceGithubSummary(session, workspaceId)` для любого участника: включено ли, `fullName` выбранных репозиториев, автоматизации по проектам. Секретов и установок в ответе нет.
  - Инструмент `preview_github_links(text, repository?)`: `findTaskReferences` → какие ссылки распознаны, какие относятся к этому пространству, существуют ли задачи, подключён ли репозиторий. Предупреждения: чужой ключ, несуществующая задача, больше одной задачи, репозиторий не выбран.
  - Логирование: DEBUG `[mcp.preview_github_links]` (`refs` — число, `matched` — число). Текст не логировать.
  - Тесты: `buildGithubGuide` для трёх случаев (GitHub выключен; без автоматизации; с автоматизацией в двух проектах), `preview_github_links` — смешанные ключи, `TSK-012`, ключ другого пространства.

- [x] **Task 8: MCP-промпты `start_task` и `finish_task`** (зависит от Task 6, Task 7)
  - `src/modules/agent-mcp/prompts.ts`, `registerPrompt` с аргументом `task`.
  - `start_task`: текст-сценарий с данными задачи (ключ, название, описание, предки, подзадачи с прогрессом, текущие статусы, рекомендованная ветка, правила GitHub):
    1. прочитать задачу; если она большая — разбить на подзадачи через `create_task` с `parent`, каждую вести в своей ветке;
    2. если автосмены нет — `set_task_status` в категорию `in_progress`;
    3. `git switch -c <ветка>`;
    4. коммиты с `TSK-42:`;
    5. по ходу — `add_comment` о существенных решениях.
  - `finish_task`:
    1. проверить `preview_github_links` для заголовка PR;
    2. `gh pr create --title "TSK-42: …"`;
    3. `add_comment` с итогом и ссылкой на PR;
    4. статус — по правилам автосмены.
  - Логирование: DEBUG `[mcp.prompt]` (`name`, `taskId`).
  - Тесты: текст промпта содержит ключ, ветку и правильную ветку сценария (с автосменой и без).

### Фаза 4. Подключение и документация

- [x] **Task 9: Шаблоны для другого репозитория** (зависит от Task 8)
  - `docs/agents/CLAUDE.snippet.md`: блок для `CLAUDE.md` целевого репозитория:
    - задачи живут в Tasker, MCP-сервер `tasker`;
    - начинать с `/mcp__tasker__start_task <KEY>`;
    - ключ задачи обязателен в ветке, коммитах и PR;
    - не упоминать чужие ключи;
    - завершать через `/mcp__tasker__finish_task`.
  - `docs/agents/mcp.json.example`: `.mcp.json` с `"type": "http"`, URL и `"headers": { "Authorization": "Bearer ${TASKER_TOKEN}" }`.
  - Те же фрагменты показывает диалог токена (Task 3): общий источник — константы в `api-tokens/client.ts`.
  - Логирование: не требуется.

- [x] **Task 10: Документация** (зависит от всех)
  - `docs/agents.md` — новая страница «Claude Code и MCP»:
    - выпуск токена;
    - подключение (`claude mcp add` и `.mcp.json`, переменная `TASKER_TOKEN`, проверка через `/mcp`);
    - список инструментов и промптов с примерами;
    - как агент работает с GitHub-ключами;
    - безопасность: токен = права пользователя в одном пространстве, без админки, отзыв, срок, хранить вне репозитория;
    - ограничения (вне рамок);
    - частые проблемы (401, задача из другого пространства, PR не привязался).
  - `docs/architecture.md`: модули `api-tokens` и `agent-mcp`, синтетическая сессия токена, эндпоинт `/api/mcp` в таблице HTTP-эндпоинтов.
  - `docs/github.md`: ссылка на `docs/agents.md` в «See Also».
  - `docs/production.md`: `/api/mcp` за Caddy — ответы JSON, SSE не нужен, проверить, что заголовок `Authorization` проходит.
  - `AGENTS.md`: модули, маршруты `/api/mcp` и `/profile/tokens`, точки входа, модель `ApiToken` в описании схемы.
  - `README.md`: пункт «Работа с задачами из Claude Code (MCP)» в возможностях.
  - Этап в `.ai-factory/ROADMAP.md` — через `/aif-roadmap`, не вручную.
  - Логирование: не требуется.

### Фаза 5. Вложения (дополнение после реализации)

- [x] **Task 11: Прикрепление и чтение файлов через MCP** (зависит от Task 6)
  - Путь тот же, что у браузера: файл не проходит через MCP, агент отправляет его в хранилище сам.
  - `tasks/index.ts`: экспорт `requestAttachmentUpload` и `completeAttachmentUpload` (алиасы `requestUpload` / `completeUpload`).
  - `agent-mcp/tools/attachment-tools.ts`:
    - `request_attachment_upload(task, fileName, size, target)` — слот presigned POST и готовая команда `curl` (`models/upload.ts`: поля через `--form-string`, файл последним);
    - `complete_attachment_upload(task, attachmentId)` — проверка размера и сигнатуры сервисом;
    - `get_attachment_url(attachmentId)` — presigned GET на 60 секунд.
  - `add_comment` принимает `attachmentIds`, текст при файлах необязателен. `get_task` показывает вложения задачи и комментариев с id.
  - Логирование: INFO `[mcp.request_attachment_upload] slot issued` и `[mcp.complete_attachment_upload] uploaded` (`taskId`, `attachmentId`, `target`, `size`), DEBUG `[mcp.get_attachment_url] issued`. Адреса и поля подписи не логируются.
  - Тесты: `models/upload.test.ts` (кавычки shell, порядок полей), инструменты вложений и `add_comment` с файлами в `tools.test.ts`, список инструментов в `mcp-handler.test.ts`.
  - Документация: `docs/agents.md` (раздел «Вложения», частые проблемы), `docs/architecture.md`, `AGENTS.md`, `docs/agents/CLAUDE.snippet.md`.
