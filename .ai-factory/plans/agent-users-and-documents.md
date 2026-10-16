# План реализации: агенты как участники пространства и документы через MCP

Branch: none (git.create_branches = false — работа в текущей ветке)
Created: 2026-10-17

## Settings

- Testing: yes — Vitest (`environment: node`) рядом с кодом:
  - модели агентов и областей токена;
  - сервисы агентов, токенов и журнала на моках репозиториев;
  - перенаправление уведомлений агента;
  - инструменты документов и проверка областей в MCP;
  - запрет сессии для агента.
- Logging: verbose — через `createLogger(scope)`.
  - DEBUG: чтения и разбор запросов.
  - INFO: создание, изменение и отключение агента; выпуск и отзыв токена агента; перенаправление уведомления; запись в журнал; создание и изменение документов через MCP.
  - WARN: отказ (не владелец, агент отключён, нет области токена, попытка входа агентом, конфликт версии заметки).
  - **Никогда не логировать** токены, содержимое заметок и файлов, тексты комментариев и адреса presigned-ссылок. Логировать только id, ключи задач, длины и размеры.
- Docs: yes — обязательный docs-checkpoint в конце (Task 14).

## Roadmap Linkage

Milestone: "none"
Rationale: Продолжение плана `agent-mcp-access`. В `.ai-factory/ROADMAP.md` нет этапа; можно добавить «Доступ для AI-агентов (MCP)» через `/aif-roadmap`.

## Требования

1. **Агент — отдельный участник пространства.** Владелец создаёт агента в настройках пространства, например «Claude — backend». Агент — это служебный пользователь:
   - без почты и пароля, войти в интерфейс не может;
   - со своими правами в пространстве («Управление проектами», «Управление документами»);
   - со своими токенами.

   Автором задач, комментариев, файлов и документов, которые создаёт агент, становится он сам, с меткой «Агент» и роботом вместо фото. На агента можно назначать задачи и упоминать его в комментариях. В пространстве может быть несколько агентов, например по агенту на репозиторий.
2. **Ответственный человек.** У каждого агента есть ответственный участник. Ему приходят уведомления, адресованные агенту: упоминание, назначение, комментарий к задаче агента.
3. **Личные токены остаются.** С личным токеном агент действует от имени человека. Задачи, комментарии и документы, созданные через личный токен, помечаются «через агента» с названием токена.
4. **Области токена (scopes)** задаются при выпуске любого токена:
   - `read` — чтение, есть всегда;
   - `tasks` — изменение задач, комментариев и вложений;
   - `documents` — изменение документов.

   Инструменты вне областей токена агенту не показываются и не выполняются.
5. **Журнал действий** — все изменения, сделанные через MCP: что, когда, каким токеном (например, «Перевёл TSK-42: К выполнению → В работе»). Журнал агента видит владелец пространства, журнал личного токена — его владелец.
6. **Документы через MCP:**
   - список и поиск, папки и теги;
   - чтение заметок и текстовых файлов, ссылка на скачивание остальных;
   - создание и правка заметок с защитой версией;
   - загрузка файлов;
   - папки, теги, связи документов с задачами.

   Документы, связанные с задачей, видны в `get_task`.

## Ключевые решения

- **Агент = `User` + `WorkspaceAgent`.**
  - Поле `User.isAgent` объявляется как `additionalFields` Better Auth с `input: false`, тот же приём, что у `taskKey`.
  - Email служебный и заведомо недоставляемый: `agent-<id>@agents.tasker.invalid` (домен `.invalid`, RFC 2606). Better Auth требует уникальный email.
  - У агента нет `Account`, поэтому вход по паролю и через GitHub невозможен. Хук `databaseHooks.session.create.before` дополнительно отклоняет любую сессию пользователя с `isAgent`, в том числе impersonation из админки.
  - Модель `WorkspaceAgent`: `userId` (PK), `workspaceId`, `responsibleUserId`, `description`, `createdById`, `disabledAt`. Агент принадлежит ровно одному пространству.
  - Членство — обычная строка `WorkspaceMember` с ролью `member` и флагами прав. Её создаёт сервис агентов в транзакции, минуя плагин `organization`: у плагина нет API «добавить без приглашения». Это задокументированное исключение, как с флагами прав.
- **Отключение вместо удаления.** «Отключить» отзывает токены, удаляет строку `WorkspaceMember` (агент пропадает из выбора ответственного и упоминаний) и ставит `disabledAt`. Строка `User` остаётся, поэтому авторство в истории не превращается в «удалённого пользователя». Повторное включение возвращает членство.
- **Аватар агента без правки DTO.** `User.image` агента — обычный адрес `/api/users/<id>/avatar`. `getAvatarDownload` для агента отдаёт статический `public/agent-avatar.svg` (робот) вместо presigned-ссылки. Робот появляется везде, где уже показывается фото. Метку «Агент» и ответственного показывают участники пространства, карточка при наведении и профиль участника — там DTO получают `isAgent` и `responsible`.
- **Токены агента.**
  - Это те же `ApiToken`, у которых `userId` указывает на агента. Новое поле `issuedById` хранит человека, выпустившего токен.
  - Выпускает и отзывает токены агента только владелец пространства, на странице агента.
  - Личный токен по-прежнему выпускает сам пользователь в профиле.
  - `authenticateApiToken` для агента проверяет, что `WorkspaceAgent` не отключён.
  - Сессия получает необязательное поле `AuthSession.via = { tokenId, tokenName, scopes, agent }`. По нему сервисы ставят пометку, а MCP проверяет области.
- **Пометка «через агента»** — колонка `createdViaTokenId` (FK на `ApiToken`, `SetNull`) у `Task`, `TaskComment` и `Document`. Сервисы ставят её из `session.via`. Если автор — сам агент, пометку не показываем: и так видно. Остальные изменения (статус, правки, вложения) видны только в журнале — истории изменений в Tasker нет.
- **Журнал** — модель `McpActivity`:
  - поля: `workspaceId`, `userId` (кто действовал), `tokenId` (`SetNull`), `tool`, `summary` (готовая строка), `targetKey` (`TSK-42` или id документа), `createdAt`;
  - пишет обёртка `runTool` после успешного инструмента изменения: инструмент возвращает `{ text, activity }`;
  - записи старше 90 дней удаляются по ходу записи;
  - читать журнал могут владелец пространства (по агенту) и владелец личного токена (по токену).
- **Уведомления агенту.** `notify()` модуля `notifications` заменяет получателя-агента:
  - на ответственного, если тот ещё участник пространства;
  - иначе на владельцев пространства.

  В payload добавляется `forAgent: { name }`, текст звучит как «… (для агента Claude — backend)». Себе по-прежнему не отправляется. `sendMail` дополнительно не отправляет письма на `*.invalid` — защита на случай, если агент попадёт в получатели писем по другому пути. `notifications` читает `WorkspaceAgent` в своём репозитории — задокументированное чтение чужой таблицы, такое же, как чтение `User` для email.
- **Видимость агентов:**
  - назначение ответственным и `@`-упоминания — да, агент выбирается как обычный участник, в списке с подписью «(агент)»;
  - список участников — да, с меткой «Агент»; удаление и права агента — только в разделе «Агенты», в списке участников — ссылка туда;
  - админка (`/admin/users`) — агенты скрыты, действия над ними отклоняются;
  - счётчик участников в списке пространств — без агентов;
  - приглашения на домен `agents.tasker.invalid` отклоняются.
- **Области токена:**
  - `ApiToken.scopes String[]`, по умолчанию все три;
  - `read` обязателен;
  - `createTaskerMcpServer` регистрирует только разрешённые инструменты и промпты (`start_task` и `finish_task` требуют `tasks`);
  - `runTool` проверяет область ещё раз (`ForbiddenError`);
  - существующим токенам миграция ставит все области.
- **Документы в MCP** вызывают сервисы модуля `documents` (`createNote`, `updateNote`, `requestDocumentUpload` и т. д.) с сессией токена. Право «Управление документами» проверяет сервис. Агенту его выдаёт владелец при создании, токену дополнительно нужна область `documents`.
  - Заметки правятся только с `version` из `get_document`. При конфликте агент получает понятную ошибку «перечитайте документ».
  - Текстовые файлы читаются через `getDocumentText` (до 1 МБ, в ответе MCP обрезка до 100 КБ с пометкой). Остальные отдаются ссылкой на скачивание.
- **Новый модуль** `src/modules/agents`. Зависит от `workspaces` (проверка владельца, участники) и `api-tokens` (выпуск и отзыв токенов агента). `agent-mcp` дополнительно зависит от `documents`. `notifications` по-прежнему ни от кого не зависит.

## Commit Plan

- **Commit 1** (после задач 1–4): `feat(agents): workspace agents as service members`
- **Commit 2** (после задач 5–7): `feat(api-tokens): agent tokens and scopes`
- **Commit 3** (после задач 8–10): `feat(agents): via-agent marks, notifications to the responsible and activity log`
- **Commit 4** (после задач 11–13): `feat(mcp): documents tools`
- **Commit 5** (после задачи 14): `docs: workspace agents and documents via MCP`

## Tasks

### Фаза 1. Агенты как участники

- [x] **Task 1: Схема и миграция**
  - `prisma/schema.prisma`:
    - `User.isAgent Boolean @default(false)`;
    - модель `WorkspaceAgent`: `userId` (PK, FK `User` Cascade), `workspaceId` (FK Cascade), `responsibleUserId?` (FK `User` SetNull), `description?`, `createdById?` (SetNull), `disabledAt?`, `createdAt`, индекс `[workspaceId]`;
    - `ApiToken`: `issuedById?` (FK `User` SetNull), `scopes String[] @default(["read", "tasks", "documents"])`;
    - `createdViaTokenId String? @db.Uuid` (FK `ApiToken` SetNull) у `Task`, `TaskComment` и `Document`;
    - модель `McpActivity`: `id` uuid7, `workspaceId` (FK Cascade), `userId` (FK `User` Cascade), `tokenId?` (FK `ApiToken` SetNull), `tool`, `summary`, `targetKey?`, `createdAt`; индексы `[workspaceId, userId, createdAt]`, `[tokenId, createdAt]`, `[createdAt]`.
  - Миграция `pnpm db:migrate --name add_workspace_agents`. В SQL дописать вручную: `UPDATE "ApiToken" SET "issuedById" = "userId"`.
  - `///`-комментарии в стиле схемы. Регенерировать клиент, проверить `pnpm typecheck`.
  - Логирование: не требуется (схема).

- [x] **Task 2: Better Auth — поле `isAgent` и запрет сессии агента** (зависит от Task 1)
  - `src/shared/auth/auth.ts`:
    - `user.additionalFields.isAgent` (`type: 'boolean'`, `input: false`, `defaultValue: false`);
    - `databaseHooks.session.create.before`: загрузить пользователя, если `isAgent` — вернуть `false` (сессия не создаётся). Это закрывает и impersonation.
  - `AuthUser` получает `isAgent` (`toAuthSession`). `requireUser` отклоняет агентов с `ForbiddenError` (вторая линия обороны).
  - Логирование: WARN `[auth.hooks] agent session blocked` (`userId`).
  - Тесты: хук отклоняет агента и пропускает человека; `requireUser` с `isAgent`.

- [x] **Task 3: Модуль `agents`** (зависит от Task 1, Task 2)
  - `src/modules/agents/models/agent.ts`:
    - `agentEmail(id)`, `isAgentEmail(email)`;
    - имя агента 1–60 символов, описание до 500;
    - `AGENTS_PER_WORKSPACE_LIMIT = 20`.
  - `slices/agent/`: `agent.schema.ts`, `agent.repository.ts`, `agent.service.ts`, `agent.actions.ts`, `agent.dto.ts`. Все изменения — только владелец пространства (`requireWorkspaceAccess(session, ws, 'owner')`).
    - `createAgent` — в транзакции создаёт `User` (`isAgent`, служебный email, `image = /api/users/<id>/avatar`), `WorkspaceMember` (`member`, флаги прав) и `WorkspaceAgent`. Ответственный должен быть участником, иначе `ValidationError`.
    - `updateAgent` — имя, описание, ответственный, права.
    - `disableAgent` / `enableAgent` — отзыв всех токенов агента, удаление или восстановление членства, `disabledAt`.
    - `listAgents(session, ws)` — для любого участника (имя, ответственный, отключён ли). Токены и журнал — только владельцу.
    - `getAgentRouting(workspaceId, userIds)` — системное чтение для `notifications`: агент → ответственный.
  - `index.ts` / `client.ts`; ESLint-границы — через публичный API.
  - Логирование: `createLogger('agents')`:
    - INFO `[agent] created` / `updated` / `disabled` / `enabled` (`agentId`, `workspaceId`, `by`);
    - WARN на отказ (не владелец, лимит, ответственный не участник).
  - Тесты: сервис на моках (права, лимит, транзакция создания, отключение отзывает токены и снимает членство, повторное включение).

- [x] **Task 4: Агент в интерфейсе и в чужих модулях** (зависит от Task 3)
  - Страница `/w/[workspaceSlug]/settings/agents`, вкладка «Агенты» в настройках пространства (только владелец). Компоненты `src/components/agents/`:
    - список агентов;
    - диалог создания и правки: имя, описание, ответственный, права;
    - «Отключить» и «Включить» через `ConfirmActionDialog`.
  - `profiles`: `getAvatarDownload` для `isAgent` возвращает `/agent-avatar.svg`; добавить `public/agent-avatar.svg` (робот в стиле lucide `Bot`). Карточка участника и публичный профиль: метка «Агент», «Отвечает: Имя».
  - `workspaces`:
    - участники: `MemberDto.isAgent`, метка «Агент», для агента вместо удаления и прав — ссылка «Настроить в разделе Агенты»; сервис `removeMember` и `setMemberPermission` для агента возвращают `ValidationError`;
    - `membersCount` без агентов;
    - приглашение на `isAgentEmail` → `ValidationError`.
  - Выбор ответственного в задаче и подсказка `@`: подпись «(агент)» (`MemberIdentityDto.isAgent`).
  - `admin`: `listAdminUsers` фильтрует `isAgent: false`, действия над агентом → `NotFoundError`.
  - Логирование: серверные события пишут сервисы. WARN `[member] agent change rejected`, `[admin.user] agent hidden`.
  - Тесты: `removeMember` для агента, фильтр админки, приглашение на служебный домен, аватар агента.

### Фаза 2. Токены агентов и области

- [x] **Task 5: Токены агента и области в `api-tokens`** (зависит от Task 3)
  - Модели: `API_TOKEN_SCOPES = ['read', 'tasks', 'documents']`, подписи, `normalizeScopes` (`read` добавляется всегда, без повторов).
  - `createApiToken` принимает `scopes`. Новые функции `createAgentToken`, `listAgentTokens` и `revokeAgentToken` — только владелец пространства агента, `issuedById` = владелец. Личные токены — как раньше: `issuedById` = сам пользователь, токен агента в профиле не виден.
  - `authenticateApiToken`:
    - для агента — `WorkspaceAgent` активен и это пространство токена;
    - в контекст и в `AuthSession.via` — `{ tokenId, tokenName, scopes, agent: { name, responsibleUserId } | null }`.
  - Логирование: INFO `[api-token] agent token created` / `revoked` (`tokenId`, `agentId`, `by`, `scopes`); WARN `reason: 'agent_disabled'`.
  - Тесты: области по умолчанию и нормализация, токен отключённого агента → 401, чужой владелец не выпускает токен агенту, `via` в сессии.

- [x] **Task 6: Интерфейс токенов** (зависит от Task 4, Task 5)
  - Страница агента (`/w/[workspaceSlug]/settings/agents/[agentId]`):
    - токены агента: выпуск с областями и сроком, экран «скопируйте сейчас» с командами подключения (переиспользовать `CodeSnippet` и `buildClaudeMcpCommand`), отзыв;
    - журнал (Task 10).
  - Профиль → «Токены доступа»: чекбоксы областей при выпуске, колонка «Области».
  - Общий компонент выбора областей в `src/components/api-tokens/scope-fields.tsx`. Существующие компоненты профиля переносятся туда же, если это упрощает переиспользование.
  - Логирование: только серверное (сервисы).

- [x] **Task 7: Области в MCP** (зависит от Task 5)
  - `agent-mcp`:
    - карта `TOOL_SCOPES` (инструмент → область);
    - `createTaskerMcpServer` регистрирует только разрешённые инструменты, промпты — при `tasks`;
    - `runTool` проверяет область (`ForbiddenError('Токен не даёт права …')`).
  - `buildServerInstructions` и `get_workspace_context` сообщают, от чьего имени действует агент: «You act as agent "Claude — backend" (responsible: Анна)» или «as Анна via personal token», и список областей.
  - Логирование: WARN `[mcp.tool] scope denied` (`tool`, `scope`, `tokenId`).
  - Тесты: `tools/list` для токена только с `read`, вызов инструмента вне области → `isError`, инструкции для агента и для личного токена.

### Фаза 3. Атрибуция, уведомления и журнал

- [x] **Task 8: Пометка «через агента»** (зависит от Task 5)
  - Сервисы `createTask`, `createComment`, `createNote` и `completeDocumentUpload` (создание файла-документа) пишут `createdViaTokenId = session.via?.tokenId`.
  - DTO: `TaskDto.createdVia`, `TaskCommentDto.createdVia`, `DocumentDto.createdVia` — `{ tokenName } | null`. Показываются только если автор — не агент.
  - UI: в шапке комментария, в «Создал» задачи и в мете документа — метка «через Claude Code» с подсказкой (название токена). Компонент `src/components/agents/via-agent-badge.tsx`.
  - Логирование: DEBUG в существующих логах создания — `via: tokenId | null`.
  - Тесты: сервисы ставят `createdViaTokenId` при `session.via` и не ставят без него; маппер скрывает пометку у автора-агента.

- [x] **Task 9: Уведомления ответственному** (зависит от Task 3)
  - `notifications`:
    - репозиторий читает получателей с `isAgent` и `WorkspaceAgent` (ответственный, членство ответственного, владельцы пространства);
    - чистая функция `routeAgentRecipients(events, routing)` заменяет агента на ответственного, а если тот не участник — на владельцев, убирает себя и дубли;
    - payload получает `forAgent: { name }`, тексты уведомлений и писем — суффикс «(для агента …)».
  - `src/shared/mail`: `sendMail` пропускает адреса `*.invalid` (WARN, без исключения).
  - Логирование: INFO `[notification] rerouted from agent` (`agentId`, `to`, `type`, `workspaceId`); WARN `[mail] undeliverable address skipped` (адрес маскировать через `maskEmail`).
  - Тесты: `routeAgentRecipients` — ответственный, ответственный вышел (→ владельцы), актор = ответственный (не себе), несколько агентов в одном событии; `sendMail` и `.invalid`.

- [x] **Task 10: Журнал действий MCP** (зависит от Task 5, Task 7)
  - `agent-mcp`:
    - инструменты изменения возвращают `{ text, activity: { summary, targetKey } }`;
    - `runTool` после успеха пишет `McpActivity` через новый срез `activity` модуля `api-tokens` (`recordActivity`), без ожидания и без влияния на ответ;
    - записи старше 90 дней удаляются по ходу записи (вероятностно, как доставки GitHub).
  - Чтение:
    - `listAgentActivity(session, agentId, cursor)` — владелец пространства;
    - `listTokenActivity(session, tokenId, cursor)` — владелец личного токена.

    Пагинация по курсору `createdAt + id`, по 50 записей.
  - UI: лента на странице агента и в профиле (ссылка «Журнал» у токена, `/profile/tokens/[tokenId]`): время, токен, действие, ссылка на задачу или документ.
  - Логирование: DEBUG `[mcp.activity] recorded` (`tool`, `tokenId`); WARN `[mcp.activity] record failed`.
  - Тесты: `runTool` пишет журнал только при успехе инструмента изменения, сбой записи не ломает ответ, тексты `summary` для основных инструментов, права чтения журнала.

### Фаза 4. Документы через MCP

- [x] **Task 11: Чтение документов** (зависит от Task 7)
  - `agent-mcp/tools/document-tools.ts`, область `read`:
    - `list_documents(query, folder, tag, kind, page)` — `listDocuments` + `parseDocumentListParams`;
    - `list_document_folders` — `listFolderTree`, дерево с id;
    - `list_document_tags` — `listTags`;
    - `get_document(document)` — `getDocument`:
      - для заметки — содержимое и `version`;
      - для текстового файла — `getDocumentText`, обрезка до 100 КБ с пометкой;
      - для остальных — ссылка `getDocumentFile`;
      - плюс связанные задачи `listDocumentTasks`.
  - `get_task`: раздел «Документы» (`listTaskDocuments`) с id.
  - Ссылка на документ — id (uuid). Папка и тег задаются по имени или id (переиспользовать `pickByIdOrName` из `models/catalog.ts`).
  - Логирование: DEBUG `[mcp.get_document]` (`documentId`, `kind`, `length`, `truncated`). Содержимое не логировать.
  - Тесты: форматирование списка и документа (заметка, текст с обрезкой, бинарный файл), разбор фильтров.

- [x] **Task 12: Изменение документов** (зависит от Task 11, Task 10)
  - Область `documents`; право «Управление документами» проверяет сервис:
    - `create_note(title, content, folder?, tags?, tasks?)` — `createNote`, затем `setDocumentTags` и `linkDocumentToTask`;
    - `update_note(document, version, title?, content?)` — `updateNote`; `ConflictError` → текст «Документ изменили: вызовите get_document и примените правку к новой версии»;
    - `create_document_folder(name, parent?)` — `createFolder`;
    - `set_document_tags(document, tags)` — `setDocumentTags`, только существующие теги;
    - `link_document_to_task(document, task)` / `unlink_document_from_task`;
    - загрузка файла в два шага, как вложения: `request_document_upload(fileName, size, folder?)` → `curl` → `complete_document_upload(documentId)`. Ошибка квоты — понятным текстом.
  - Каждый инструмент возвращает `activity` для журнала («Создал заметку «…»», «Изменил заметку «…» (v3 → v4)»).
  - Логирование: INFO `[mcp.create_note] created` / `[mcp.update_note] updated` (`documentId`, `version`, `length`), `[mcp.document_upload] slot issued` / `uploaded`.
  - Тесты: на моках сервисов — создание с тегами и связями, конфликт версии → `isError` с подсказкой, нет права → `isError`, загрузка файла.

- [x] **Task 13: Сценарии и правила агента для документов** (зависит от Task 12)
  - `buildServerInstructions`, `get_workspace_context` и промпты: где искать спецификации («перед работой проверь документы, связанные с задачей»), что результаты (ADR, отчёты, заметки по реализации) сохраняются заметкой и связываются с задачей, правка заметки — только с актуальной `version`.
  - `start_task`: шаг «прочитай связанные документы». `finish_task`: шаг «если появились решения или инструкции — заметка в документах, связанная с задачей».
  - `docs/agents/CLAUDE.snippet.md`: строки про документы.
  - Логирование: не требуется (тексты).
  - Тесты: промпты содержат шаги про документы; инструкции без области `documents` не предлагают их менять.

### Фаза 5. Документация

- [x] **Task 14: Документация** (зависит от всех)
  - `docs/agents.md`:
    - раздел «Агенты пространства»: создание, права, ответственный, отключение, токены агента, чем агент отличается от личного токена;
    - области токена, журнал, пометка «через агента»;
    - инструменты документов;
    - обновить «Ограничения» и «Частые проблемы» (нет области, нет права «Управление документами», конфликт версии, квота).
  - `docs/architecture.md`: модуль `agents`, `User.isAgent` и запрет сессии, членство агента в обход плагина, перенаправление уведомлений, `McpActivity`, области в MCP, документы в `agent-mcp`, таблица зависимостей модулей.
  - `AGENTS.md`, `.ai-factory/DESCRIPTION.md`, `.ai-factory/ARCHITECTURE.md`: модуль `agents`, новые маршруты (`settings/agents`, `profile/tokens/[tokenId]`), модели схемы, правило зависимостей.
  - `README.md`: дополнить пункт про Claude Code (агенты, документы).
  - Этап в `.ai-factory/ROADMAP.md` — через `/aif-roadmap`, не вручную.
  - Логирование: не требуется.
