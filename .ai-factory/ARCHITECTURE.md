# Архитектура: Structured Modules (Vertical Slices)

## Обзор

Tasker строится как модульный монолит на Next.js. Код разделён на доменные модули (`workspaces`, `projects`, `tasks`, `documents`, `integrations/github`). Внутри модуля код сгруппирован в срезы по сущностям: `task`, `placement`, `comment`, `attachment` и т.д. В каждом срезе лежат свои Server Actions, сервис и репозиторий. Бизнес-правила и инварианты сосредоточены в «богатых» доменных моделях, а сервисы только оркестрируют сценарии: загрузить, проверить доступ, вызвать метод модели, сохранить.

Паттерн выбран потому, что домен средней сложности: двухуровневые роли, задача в нескольких проектах со своим статусом в каждом, документы и интеграция с GitHub. Для плоских слоёв это слишком сложно, а полноценная Explicit Architecture с портами избыточна на старте. Структура позволяет позже вынести модуль в Explicit Architecture, не переписывая остальные.

## Обоснование решения

- **Тип проекта:** веб-приложение таск-трекер, мультиарендность через workspace
- **Стек:** TypeScript, Next.js (App Router), PostgreSQL, Prisma, Better Auth
- **Ключевой фактор:** независимые доменные области (задачи, документы, GitHub) с жёсткими границами и единым слоем авторизации при сохранении скорости разработки

## Структура папок

```
tasker/
├── prisma/
│   ├── schema.prisma                 # Единая схема БД
│   └── migrations/
├── src/
│   ├── app/                          # ── ПРЕДСТАВЛЕНИЕ (Next.js) — тонкий слой ──
│   │   ├── (auth)/                   # login, register, accept-invite
│   │   ├── (app)/
│   │   │   ├── w/[workspaceSlug]/
│   │   │   │   ├── projects/[projectId]/board/page.tsx   # Канбан
│   │   │   │   ├── projects/[projectId]/list/page.tsx    # Список
│   │   │   │   ├── tasks/[taskId]/page.tsx
│   │   │   │   ├── docs/                                 # Документы: обзор (?folder, ?q, ?tag, ?kind), new, [documentId], [documentId]/edit
│   │   │   │   ├── settings/members/page.tsx
│   │   │   │   └── settings/labels/page.tsx                # Метки пространства
│   │   │   └── admin/                # Глобальная админка (роль ADMIN): users/ — пользователи ресурса
│   │   └── api/
│   │       ├── auth/[...all]/route.ts         # Better Auth handler
│   │       ├── cron/reminders/route.ts        # Напоминания о сроке (Bearer CRON_SECRET, вызывает планировщик)
│   │       ├── documents/[documentId]/file/route.ts # файл документа (302) или Markdown заметки
│   │       ├── mcp/route.ts                   # MCP-сервер для агентов (Bearer-токен)
│   │       └── webhooks/github/route.ts       # GitHub webhooks
│   │
│   ├── proxy.ts                      # Оптимистичный редирект на /login по cookie (не авторизация)
│   ├── modules/                      # ── ДОМЕННЫЕ МОДУЛИ ──
│   │   ├── auth/
│   │   │   ├── slices/credentials/   # вход, регистрация, выход (Server Actions поверх Better Auth)
│   │   │   └── index.ts
│   │   │
│   │   ├── workspaces/
│   │   │   ├── slices/
│   │   │   │   ├── workspace/        # workspace.actions.ts, workspace.service.ts, workspace.repository.ts
│   │   │   │   ├── member/           # выдача/отзыв доступа, роли
│   │   │   │   └── invitation/       # приглашения
│   │   │   ├── models/               # Membership (последний владелец), Invitation, slug
│   │   │   ├── organization-api.ts   # Вызов API плагина organization + маппинг ошибок
│   │   │   ├── client.ts             # Публичный API для клиентских компонентов (без server-only)
│   │   │   └── index.ts              # Публичный API модуля (сервер)
│   │   │
│   │   ├── projects/
│   │   │   ├── slices/
│   │   │   │   ├── project/          # CRUD проекта, набор статусов по умолчанию
│   │   │   │   └── status/           # настраиваемые статусы (колонки), блокировка проекта на время изменения набора
│   │   │   ├── models/               # StatusSet (инварианты набора), категории и палитра статусов, правила проекта
│   │   │   ├── client.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── tasks/
│   │   │   ├── slices/
│   │   │   │   ├── task/             # CRUD задачи, номер (#42), срок, приоритет, ответственный; архив и восстановление ветки (assertTaskActive)
│   │   │   │   ├── placement/        # размещение задачи в проекте: статус + позиция
│   │   │   │   ├── subtask/          # дерево подзадач: рекурсивные CTE, смена родителя под блокировкой, прогресс
│   │   │   │   ├── comment/          # комментарии; @упоминания и уведомления о комментарии
│   │   │   │   ├── attachment/       # вложения задачи и комментариев: слот загрузки (presigned POST), подтверждение с проверкой размера и сигнатуры, ссылка скачивания, удаление объектов
│   │   │   │   ├── history/          # история изменений (TaskHistoryEntry): запись в транзакции изменения, слияние правок, чтение
│   │   │   │   ├── label/            # метки пространства и метки задачи
│   │   │   │   ├── watcher/          # наблюдатели: автоподписка, подписка вручную, получатели уведомлений
│   │   │   │   ├── search/           # поиск задач по номеру и названию (для модуля search)
│   │   │   │   ├── reminder/         # напоминания о сроке: системная функция sendDueReminders без сессии (только для /api/cron/reminders)
│   │   │   │   └── views/            # запросы для канбана и списка (read-модели); фильтры/сортировка списка — task-list.prisma.ts
│   │   │   ├── models/               # правила задачи, TaskPlacement, позиции (fractional-indexing), Priority, упоминания (comment-mentions), дерево подзадач (task-tree), история (task-history), метки (task-label), даты напоминаний (due-reminders)
│   │   │   ├── client.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── profiles/                 # Профиль пользователя
│   │   │   ├── slices/
│   │   │   │   ├── profile/          # должность, описание (UserProfile); имя — через auth.api.updateUser
│   │   │   │   └── avatar/           # фото: presigned POST, проверка сигнатуры, выдача ссылки участникам общих пространств
│   │   │   ├── models/               # лимиты полей, типы и ключи фото, isAvatarUrl
│   │   │   ├── auth-api.ts           # updateAuthUser: имя и User.image через Better Auth (обновляет cookie-кеш)
│   │   │   ├── client.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── notifications/            # Уведомления (без зависимостей от других модулей)
│   │   │   ├── slices/
│   │   │   │   ├── notification/     # notify / notifyByEmail, лента, прочтение, письма через after()
│   │   │   │   └── preference/       # настройки «тип × канал»
│   │   │   ├── models/               # каталог типов и каналов, payload-снимки (Zod), получатели, ссылки и текст
│   │   │   ├── client.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── admin/                    # Администрирование ресурса (роль ADMIN)
│   │   │   ├── slices/
│   │   │   │   └── user/             # список пользователей; блокировка, роль, сессии, удаление через плагин admin
│   │   │   ├── models/               # правила над пользователями (не над собой, администратора — сначала снять роль, единственный владелец), запрос списка
│   │   │   ├── admin-api.ts          # callAdminApi: вызов API плагина admin + маппинг ошибок
│   │   │   ├── client.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── search/                   # Глобальный поиск (агрегатор): задачи, документы, участники, пространства
│   │   │   ├── slices/global/        # globalSearchAction → globalSearch: группы параллельно, каждая проверяет доступ
│   │   │   ├── models/               # нормализация запроса, минимальная длина, ранжирование совпадений
│   │   │   ├── client.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── documents/                # Хранилище пространства: папки, заметки, файлы, теги
│   │   │   ├── slices/
│   │   │   │   ├── folder/           # дерево папок (рекурсивные CTE, блокировка дерева на время изменений)
│   │   │   │   ├── document/         # заметки (Markdown, версия для правки), переименование, перенос, удаление
│   │   │   │   ├── file/             # загрузка (presigned POST, квота под блокировкой), подтверждение, ссылка, текст для просмотра
│   │   │   │   ├── tag/              # теги пространства и теги документа
│   │   │   │   ├── task-link/        # связь документ ↔ задача (через публичный API tasks)
│   │   │   │   └── views/            # обзор папки и поиск по пространству
│   │   │   ├── models/               # типы файлов (allowlist, просмотрщики, сигнатуры), правила папок, квота, форматирование Markdown, CSV, запрос списка
│   │   │   ├── client.ts
│   │   │   └── index.ts
│   │   │
│   │   └── integrations/
│   │       └── github/
│   │           ├── slices/
│   │           │   ├── identity/     # GitHub-аккаунт пользователя (Account), токен пользователя
│   │           │   ├── installation/ # подключение установки (state + /user/installations), выбор репозиториев
│   │           │   ├── webhook/      # подпись, идемпотентность, реестр обработчиков (handlers/)
│   │           │   ├── pull-request/ # PR, ревью, CI; эффекты после коммита
│   │           │   ├── link/         # TaskPullRequest, ветки и коммиты задач, ручная привязка
│   │           │   ├── automation/   # автосмена статуса проекта по PR
│   │           │   ├── summary/      # сводка интеграции для любого участника (репозитории, автосмена) — для агентов
│   │           │   └── notify/       # уведомления о PR через notifications
│   │           ├── models/           # ссылки KEY-N, состояния PR/ревью/CI, правило «только вперёд»
│   │           ├── github-api.ts     # octokit: App, клиенты установки и пользователя, маппинг ошибок
│   │           ├── client.ts
│   │           └── index.ts
│   │
│   │   ├── agents/                   # Агенты пространства: служебный User (isAgent) + WorkspaceAgent
│   │   │   ├── slices/agent/         # создание (User + WorkspaceMember + WorkspaceAgent в транзакции), правка, отключение, включение
│   │   │   ├── models/               # лимиты, адрес фото агента
│   │   │   ├── client.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── api-tokens/               # Токены доступа (личные и агентов): tkr_… (SHA-256 в БД), одно пространство
│   │   │   ├── slices/token/         # выпуск, отзыв, токены агента, authenticateApiToken → AuthSession (роль user, via)
│   │   │   ├── slices/activity/      # журнал действий MCP (McpActivity): запись, чтение по агенту и по токену
│   │   │   ├── models/               # формат и хеш токена, сроки, области (scopes), фрагменты подключения Claude Code
│   │   │   ├── client.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── agent-mcp/                # MCP-сервер для агентов (POST /api/mcp, без сессий)
│   │   │   ├── tools/                # инструменты: чтение, изменение задач, вложения, документы, GitHub (preview_github_links)
│   │   │   ├── models/               # ссылки на задачу, выбор проекта/статуса/участника/папки/тега, области инструментов (TOOL_SCOPES), правила GitHub, промпты, форматирование
│   │   │   ├── prompts.ts            # start_task / finish_task
│   │   │   ├── server.ts, mcp-handler.ts
│   │   │   └── index.ts
│   │
│   ├── components/                   # ── ОБЩИЙ UI ──
│   │   ├── ui/                       # shadcn/ui (генерируется CLI)
│   │   └── ...                       # общие компоненты (kanban-board, task-table)
│   │
│   └── shared/                       # ── СКВОЗНОЕ (минимально) ──
│       ├── db/                       # Prisma client (singleton)
│       ├── auth/                     # Better Auth config, getSession()
│       ├── access/                   # requireWorkspaceAccess(), requireWorkspacePermission(), requireAdmin()
│       ├── errors/                   # AppError, NotFoundError, ForbiddenError, toActionError()
│       ├── storage/                  # S3-клиенты (S3_ENDPOINT и S3_PUBLIC_ENDPOINT для подписи), presigned POST/GET, удаление объектов
│       ├── mail/                     # SMTP (nodemailer): sendMail(), sendMailInBackground(), escapeHtml()
│       ├── rate-limit/               # Лимиты попыток Server Actions (ActionRateLimit), getClientIp()
│       ├── logger/                   # pino, LOG_LEVEL
│       ├── env/                      # Zod-валидация переменных окружения (ленивая)
│       ├── health/                   # checkHealth(): агрегирует checkDatabase/checkStorage для /api/health
│       └── types/                    # ActionResult<T>, FormState<T> и пр.
│   └── generated/prisma/             # Сгенерированный Prisma Client (не коммитится)
└── ...
```

Файлы внутри среза: `<entity>.actions.ts` (Server Actions — роль контроллера), `<entity>.service.ts`, `<entity>.repository.ts`, `<entity>.schema.ts` (Zod), при необходимости `use-cases/`.

## Правила зависимостей

Направление: `app/` → `*.actions.ts` → `*.service.ts` → (`models/`, `*.repository.ts`) → `shared/db`.

- ✅ `app/` (страницы, route handlers) вызывает только публичный API модулей (`@/modules/<module>`): actions и read-функции
- ✅ Actions валидируют вход (Zod), получают сессию и вызывают сервис
- ✅ Сервисы проверяют доступ через `shared/access`, вызывают методы моделей, сохраняют через репозиторий
- ✅ Модели — чистый TypeScript без Prisma, Next.js и React
- ✅ Модуль импортирует другой модуль только через его `index.ts`
- ✅ Если модулю нужны клиентские компоненты, он дополнительно экспортирует `client.ts`: actions, Zod-схемы, чистые функции и типы без server-only кода. Клиентские компоненты импортируют `@/modules/<module>/client`, серверный код — `@/modules/<module>`
- ✅ `tasks` зависит от `projects` и `workspaces` (через их `index.ts`), но не наоборот. Страница доски сама собирает колонки из `projects` и карточки из `tasks`
- ✅ `integrations/github` зависит от `tasks`, `projects`, `workspaces` и `notifications`, но они не зависят от `integrations/github`; системные функции без сессии (`resolveTaskRefs`, `changePlacementStatusBySystem`, `findWorkspacesByTaskKeys`) вызываются только из обработчиков с проверенной подписью вебхука
- ✅ `agent-mcp` зависит от `api-tokens`, `tasks`, `projects`, `workspaces`, `documents` и `integrations/github`; от него не зависит никто. Инструменты вызывают те же сервисы, что Server Actions, с сессией владельца токена; `workspaceId` берётся только из токена, области — из `session.via`
- ✅ `agents` зависит от `api-tokens` (отзыв токенов отключённого агента), но не наоборот. `api-tokens`, `notifications`, `workspaces` и `profiles` читают `WorkspaceAgent` и `User.isAgent` своими репозиториями — задокументированное чтение чужой таблицы, чтобы не создавать цикл (`agents` → `api-tokens`, `notifications` ни от кого не зависит)
- ✅ `documents` зависит от `tasks` (краткие данные и поиск задач для связей), но `tasks` не зависит от `documents`: раздел «Документы» в задаче собирает компонент слоя UI (`components/documents/task-documents`)
- ✅ `search` зависит от `tasks`, `documents` и `workspaces` (их функции поиска и списки), от него не зависит никто
- ✅ `admin` зависит от `workspaces` (число пространств, единоличное владение), но не наоборот. Проверки администратора (`requireAdmin`) читают сессию в обход cookie-кеша (`getFreshSession`)
- ❌ Компоненты и страницы не импортируют `prisma` и репозитории
- ❌ Actions не вызывают репозитории в обход сервиса
- ❌ Модели не импортируют сервисы, репозитории и `@prisma/client`
- ❌ Нет импортов из внутренностей чужого модуля (`@/modules/tasks/slices/...` снаружи `tasks`)
- ❌ Нет циклов между модулями

## Взаимодействие слоёв и модулей

- **Чтение для UI:** Server Components вызывают read-функции модуля (`getBoardForProject`, `listTasks`). Те проверяют доступ и возвращают DTO, а не Prisma-объекты.
- **Изменения:** клиентские компоненты вызывают Server Actions. Action возвращает `ActionResult<T>` (`{ ok: true, data } | { ok: false, error: { code, message } }`) и делает `revalidatePath`/`revalidateTag`.
- **Межмодульные вызовы:** через публичный API (`index.ts`) модуля-поставщика. Если нужно избежать обратной зависимости, используются колбэки или простые доменные события в памяти: например, `tasks` не знает о GitHub, а GitHub-модуль сам подписывается на нужное.
- **Транзакции:** если операция затрагивает несколько агрегатов (перемещение карточки с пересчётом позиций), репозиторий принимает `Prisma.TransactionClient`, а сервис открывает `prisma.$transaction`.
- **Авторизация:** централизована в `shared/access`. Каждый сервисный метод, работающий с данными пространства, первым делом вызывает `requireWorkspaceAccess(session, workspaceId, minRole)` (неучастнику — `NOT_FOUND`, низкой роли — `FORBIDDEN`). Страницы `/w/[workspaceSlug]/*` используют `requireWorkspaceAccessBySlug(slug, minRole)` → `notFound()`. Архивное пространство guard-функции не пропускают (`NOT_FOUND`); исключение — `allowArchived` для настроек у владельца (восстановление и удаление).
- **Архив вместо удаления.** Задачи, проекты и пространства получают `archivedAt` и скрываются из списков, но читаются по ссылке. Изменения архивной задачи отклоняет `assertTaskActive`; «удалить навсегда» — только архивную сущность. Архив задачи — вся ветка подзадач одной меткой времени.
- **Системные вызовы без сессии.** Кроме обработчиков вебхука GitHub, такая функция одна — `sendDueReminders` (`tasks`): её вызывает только `POST /api/cron/reminders` после проверки `CRON_SECRET`. Идемпотентность — уникальность `TaskDueReminder(taskId, kind, dueDate)`.
- **Права в пространстве сверх роли.** Владелец имеет все права; участнику владелец выдаёт отдельные права (сейчас — `manageProjects` и `manageDocuments`, флаги `WorkspaceMember.canManageProjects` / `canManageDocuments`, объявлены в плагине с `input: false`; право → колонка — `PERMISSION_FLAGS`). Сервисы проверяют их через `requireWorkspacePermission(session, workspaceId, permission)`, страницы — через `access.permissions`. Флаг меняет сервис участников через репозиторий: у плагина нет API для дополнительных полей.
- **Удаление колонки с задачами.** Жизненный цикл статуса принадлежит `projects`, поэтому `deleteStatus` в той же транзакции переводит размещения удаляемого статуса в выбранный (`statusRepository.reassignPlacements`, меняется только `statusId`) — единственное место, где `projects` пишет в таблицу модуля `tasks`. FK размещения на статус — `NO ACTION`: статус с задачами без переноса не удалить, каскад проекта проходит.
- **Вложения.** Браузер загружает файл прямо в хранилище по presigned POST (политика фиксирует ключ, тип и размер), сервер только выдаёт слот и подтверждает загрузку. Скачивание — через `GET /api/attachments/[id]`: проверка доступа и 302 на presigned GET. Строки вложений удаляются каскадом вместе с задачей и комментарием, объекты хранилища удаляют сервисы `deleteTask` / `deleteComment` / `deleteAttachment` после удаления строк.
- **Документы.** Хранилище пространства — префикс `ws/<workspaceId>/docs/` в общем бакете и квота, проверяемая при выдаче слота под `pg_advisory_xact_lock`. Загрузка — как у вложений (presigned POST → подтверждение с сигнатурой). Заметки хранятся в БД (Markdown), правка защищена версией (`CONFLICT` при расхождении). Рендер Markdown без сырого HTML, адреса через allowlist протоколов, картинки только из своих эндпоинтов. Таблица связей `TaskDocumentLink` принадлежит `documents`, FK на задачу с каскадом — удаление задачи снимает связи без участия `documents`.
- **Снятие ответственного при выходе из пространства** — триггер БД на `WorkspaceMember` (миграция `add_tasks`): участника удаляет плагин Better Auth вне транзакций приложения, а модуль `workspaces` не знает о задачах.
- **Уведомления.** `tasks` и `workspaces` вызывают `notify(events)` / `notifyByEmail(email, event)` из `notifications` после сохранения изменения. Модуль `notifications` не знает о задачах: данные события приходят снимком (`payload`), поэтому зависимость односторонняя. Функции никогда не бросают — сбой уведомлений не отменяет действие. Письма отправляются через `after()`. Уведомления пространства у вышедшего участника удаляет триггер БД на `WorkspaceMember` (миграция `add_profiles_and_notifications`).
- **Профили.** Поля Better Auth (`User`) не расширяются: `UserProfile` — отдельная таблица модуля `profiles`. Фото — по тому же пути, что вложения (presigned POST → подтверждение с проверкой сигнатуры). Публичный профиль и карточка участника доступны только внутри общего пространства.
- **Пространства — плагин Better Auth `organization`** под доменными именами (`Workspace`, `WorkspaceMember`, `WorkspaceInvitation`, `workspaceId`). Мутации идут через `auth.api.*` плагина (`callOrganizationApi`), чтение — через репозитории модуля. Текущее пространство берётся из URL, а не из `session.activeWorkspaceId`.

## Ключевые принципы

1. **Изоляция по workspace.** Каждый запрос к данным пространства фильтруется по `workspaceId`. Ресурс, загруженный по `id`, проверяется на принадлежность пространству (защита от IDOR).
2. **Статус хранится в размещении, а не в задаче.** `TaskPlacement(taskId, projectId, statusId, position)` — единственный источник статуса и порядка. Правила перемещения (статус принадлежит проекту, проект — пространству задачи) реализованы в модели `TaskPlacement`.
3. **Богатые модели.** Инварианты (нельзя удалить последнего владельца, нельзя назначить ответственным не участника пространства, приглашение истекает) живут в моделях. Сервисы их только вызывают.
4. **Тонкий `app/`.** Страницы и route handlers только связывают UI и модули, бизнес-логики в них нет.
5. **Интеграции на периферии.** GitHub и файловое хранилище подключаются через адаптеры в `integrations/` и `shared/storage`. Ядро задач работает без них.
6. **`shared/` минимален.** Туда попадает только сквозная инфраструктура. Доменная логика в `shared/` — сигнал, что не хватает модуля.

## Примеры кода

### Богатая модель: размещение задачи в проекте

```typescript
// src/modules/tasks/models/task-placement.ts
import { ValidationError } from '@/shared/errors';

export class TaskPlacement {
  constructor(
    readonly taskId: string,
    readonly projectId: string,
    private _statusId: string,
    private _position: string, // lexorank / дробная позиция
  ) {}

  get statusId() { return this._statusId; }
  get position() { return this._position; }

  moveTo(target: { statusId: string; statusProjectId: string; position: string }) {
    if (target.statusProjectId !== this.projectId) {
      throw new ValidationError('Статус не принадлежит проекту этого размещения');
    }
    this._statusId = target.statusId;
    this._position = target.position;
  }
}
```

### Сервис: оркестрация без бизнес-правил

```typescript
// src/modules/tasks/slices/placement/placement.service.ts
import { prisma } from '@/shared/db';
import { requireWorkspaceAccess, type Session } from '@/shared/access';
import { NotFoundError } from '@/shared/errors';
import { positionBetween } from '../../models/position';
import { placementRepository } from './placement.repository';

export async function movePlacement(
  session: Session,
  input: { taskId: string; projectId: string; statusId: string; beforeId?: string; afterId?: string },
) {
  return prisma.$transaction(async (tx) => {
    const placement = await placementRepository.find(tx, input.taskId, input.projectId);
    if (!placement) throw new NotFoundError('Размещение не найдено');

    await requireWorkspaceAccess(session, placement.workspaceId, 'MEMBER');

    const status = await placementRepository.findStatus(tx, input.statusId);
    const neighbours = await placementRepository.findPositions(tx, input.beforeId, input.afterId);

    placement.model.moveTo({
      statusId: status.id,
      statusProjectId: status.projectId,
      position: positionBetween(neighbours.before, neighbours.after),
    });

    await placementRepository.save(tx, placement.model);
    return placement.model;
  });
}
```

### Server Action: валидация, сессия, единый формат ошибки

```typescript
// src/modules/tasks/slices/placement/placement.actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/shared/auth';
import { toActionError, type ActionResult } from '@/shared/errors';
import { movePlacementSchema } from './placement.schema';
import { movePlacement } from './placement.service';

export async function movePlacementAction(raw: unknown): Promise<ActionResult<null>> {
  try {
    const input = movePlacementSchema.parse(raw);
    const session = await getSession();
    await movePlacement(session, input);
    revalidatePath(`/w/[workspaceSlug]/projects/${input.projectId}/board`, 'page');
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error); // доменные ошибки → { code, message }, остальное логируется
  }
}
```

### Правило зависимостей: публичный API модуля

```typescript
// src/modules/tasks/index.ts — единственная точка входа для других модулей и app/
export { movePlacementAction } from './slices/placement/placement.actions';
export { getBoardForProject, listTasks } from './slices/views/views.queries';
export type { BoardDto, TaskListItemDto } from './slices/views/views.dto';

// ✅ src/app/(app)/w/[workspaceSlug]/projects/[projectId]/board/page.tsx
import { getBoardForProject } from '@/modules/tasks';

// ❌ Обход публичного API и прямой доступ к БД из страницы
import { placementRepository } from '@/modules/tasks/slices/placement/placement.repository';
import { prisma } from '@/shared/db';
```

## Анти-паттерны

- ❌ **Prisma в компонентах и страницах.** Обходит авторизацию и границы модулей.
- ❌ **Проверка прав только в UI.** Скрытая кнопка не защищает: каждый сервисный метод проверяет доступ сам.
- ❌ **`status` в таблице `Task`.** Ломает размещение задачи в нескольких проектах.
- ❌ **Анемичные модели и толстые сервисы.** Правила ролей и перемещений в `if`-ах сервиса вместо методов модели.
- ❌ **Возврат Prisma-объектов клиенту.** Утекают лишние поля; отдавайте DTO.
- ❌ **Зависимость ядра от GitHub.** `tasks` не импортирует `integrations/github`.
- ❌ **Пересчёт позиций всех карточек колонки при каждом перемещении.** Используйте lexorank/дробные позиции.
- ❌ **Разрастание `shared/`.** Доменная логика туда не кладётся.
