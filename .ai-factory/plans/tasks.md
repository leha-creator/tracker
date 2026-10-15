# План реализации: Задачи

Branch: none (main; `git.create_branches: false`)
Created: 2026-10-15

## Settings
- Testing: yes (Vitest)
- Logging: verbose
- Docs: yes  # обязательный docs checkpoint в /aif-implement через /aif-docs

## Roadmap Linkage
Milestone: "Задачи"
Rationale: План покрывает этап целиком: задача с основными полями и её размещение в нескольких проектах со своим статусом и позицией в каждом.

## Рамки этапа

**Входит:**
- Новый модуль `tasks` (срезы `task`, `placement`, `views`; модели; публичные `index.ts` / `client.ts`).
- Задача пространства: номер (`#42`, сквозной в пространстве), название, описание (простой текст), приоритет, срок, ответственный, автор.
- Размещения: задача может быть в нескольких проектах, в каждом — свой статус и позиция. Добавить в проект, сменить статус, убрать из проекта.
- Доска проекта показывает карточки задач (порядок — по позиции, без перетаскивания); быстрое создание задачи в колонке.
- Страница задачи `/w/[workspaceSlug]/tasks/[taskNumber]`: просмотр и редактирование полей, управление размещениями, удаление.
- Простой список задач пространства `/w/[workspaceSlug]/tasks` (новые сверху, «Показать ещё») — чтобы задачи вне проектов не терялись; вкладка «Задачи» в навигации.
- Доработка `projects`: удаление статуса с задачами требует выбрать статус для переноса; диалог удаления проекта показывает число задач в проекте.
- Снятие ответственного, когда участник покидает пространство.

**Не входит (следующие этапы):**
- Drag-and-drop карточек (dnd-kit) — этап «Канбан-доска». Здесь модель позиций и серверное `positionBetween` уже готовы к нему.
- Фильтры, сортировка, табличный вид — этап «Представление списком»; текущий список — минимальный.
- Комментарии, вложения — отдельные этапы.
- Rich-text описание (Tiptap) — вместе с этапом «Проектная документация»; сейчас описание — простой текст, рендер через `whitespace-pre-wrap` без HTML.
- История изменений задачи, подписки и уведомления.
- Неявный доступ глобального администратора — этап «Администрирование ресурса».

## Ключевые решения

- **Модуль `tasks` зависит от `projects` и `workspaces`, но не наоборот.** `tasks` использует публичные API: `getProject` / `listProjects` / `listStatuses` (селекты и проверки) и `listMembers` / новый `isWorkspaceMember` (ответственный). Страница доски сама собирает данные двух модулей: статусы из `projects`, карточки из `tasks` — `projects` о задачах не знает.
- **Исключение: удаление статуса трогает размещения.** Жизненный цикл колонки принадлежит `projects`, поэтому `statusRepository` в той же транзакции переводит размещения удаляемого статуса в выбранный (`taskPlacement.updateMany` с `workspaceId`, `projectId`, `statusId` в `where`) и считает задачи в статусах/проекте через `_count`. Позиции не пересчитываются: дробные ключи двух колонок корректно сливаются в одну. Решение зафиксировать комментарием в репозитории и в `docs/architecture.md` (как с `canManageProjects`).
- **Схема данных:**
  - `enum TaskPriority { none low medium high urgent }`.
  - `Task` — `id` (`uuid(7)`, `@db.Uuid`), `workspaceId` (FK → Workspace, `Cascade`), `number Int`, `title`, `description String?`, `priority TaskPriority @default(none)`, `dueDate DateTime? @db.Date`, `assigneeId String?` (FK → User, `SetNull`), `createdById String?` (FK → User, `SetNull`), `createdAt`, `updatedAt`; `@@unique([workspaceId, number])`, `@@unique([id, workspaceId])`, `@@index([workspaceId, createdAt])`, `@@index([workspaceId, assigneeId])`, `@@index([workspaceId, dueDate])`.
  - `TaskPlacement` — `taskId`, `projectId`, `workspaceId`, `statusId` (все `@db.Uuid`, кроме `workspaceId`), `position String`, `createdAt`, `updatedAt`; `@@id([taskId, projectId])` (одно размещение на проект); составные FK: `(taskId, workspaceId) → Task(id, workspaceId)` `Cascade`, `(projectId, workspaceId) → Project(id, workspaceId)` `Cascade`, `(statusId, projectId) → ProjectStatus(id, projectId)` **`Restrict`** (статус с задачами не удаляется без переноса); `@@index([projectId, statusId, position])`, `@@index([workspaceId])`. В `ProjectStatus` — `@@unique([id, projectId])`.
  - `WorkspaceTaskCounter(workspaceId @id, lastNumber Int)` — номер выдаётся атомарно: `INSERT … ON CONFLICT ("workspaceId") DO UPDATE SET "lastNumber" = "lastNumber" + 1 RETURNING "lastNumber"` в транзакции создания задачи. Номера не переиспользуются после удаления.
- **Статус — только в размещении.** В `Task` нет поля статуса (анти-паттерн из ARCHITECTURE.md). Правило «статус принадлежит проекту размещения» — в модели `TaskPlacement.moveTo()` и дублируется составным FK.
- **Позиции — дробные ключи** (пакет `fractional-indexing`, base62). Обёртка `models/position.ts`: `positionAfter(last)`, `positionBetween(before, after)`. Ключи сравниваются побайтно, поэтому колонка `position` создаётся с `COLLATE "C"` (правка SQL миграции). Новая карточка и смена статуса — в конец колонки. Одинаковые ключи при гонке допустимы: сортировка `position, taskId` детерминирована; dnd-этап сможет их развести.
- **Ответственный — участник пространства.** Инвариант проверяется в сервисе (`isWorkspaceMember` из `workspaces`) и в модели (`ValidationError` с `fieldErrors.assigneeId`). Участник удаляется плагином Better Auth вне наших транзакций, поэтому снятие ответственного — триггер БД в миграции: `AFTER DELETE ON "WorkspaceMember"` → `UPDATE "Task" SET "assigneeId" = NULL WHERE "workspaceId" = OLD."workspaceId" AND "assigneeId" = OLD."userId"`. Модули при этом не связываются; триггер описать в `docs/architecture.md`.
- **Права.** Любой участник пространства создаёт, редактирует задачи и меняет размещения/статусы. Удалить задачу может автор или владелец пространства — правило в модели (`assertCanDelete(actor)`). Право `manageProjects` на задачи не влияет.
- **Срок — дата без времени** (`@db.Date`, `<input type="date">`, Zod `z.iso.date()`); форматирование без сдвига часового пояса (UTC). «Просрочено» — `dueDate < сегодня` для незавершённых (категория статуса не `done` хотя бы в одном размещении либо нет размещений).
- **URL задачи по номеру:** `/w/[workspaceSlug]/tasks/[taskNumber]`; номер валидируется Zod до запроса, невалидный/чужой → `notFound()`. Внутри действий — `taskId` (UUID).
- **Лимиты:** название 1..200 символов (trim, схлопывание пробелов), описание до 10 000, размещений у задачи — до 20, пагинация списка — 50, курсор `(createdAt, id)`.
- **Cache Components.** Всё, что читает сессию и данные, — внутри `<Suspense>`; `params` — Promise. Перед UI-задачами перечитать `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`, `forms.md`, `server-actions.md`. После мутаций — `revalidatePath('/w/[workspaceSlug]', 'layout')`.

## Commit Plan
- **Commit 1** (после задач 1–2): `feat(tasks): add tasks schema and domain models`
- **Commit 2** (после задач 3–6): `feat(tasks): add task and placement services, actions and status reassignment`
- **Commit 3** (после задач 7–10): `feat(tasks): add board cards, task page and workspace task list`

## Tasks

### Phase 1: Схема и модели

- [x] Task 1: Prisma-схема задач, размещений и счётчика номеров
  - **По факту:** `migrate dev` в неинтерактивной среде отказывается работать (предупреждение о новом уникальном индексе) — миграция `20261015193000_add_tasks` сгенерирована `prisma migrate diff --from-config-datasource --to-schema … --script`, дописана вручную и применена `migrate deploy`. FK на статус — `NoAction` вместо `Restrict` (проверка в конце оператора: каскад проекта проходит, прямое удаление статуса с задачами — нет). Проверено SQL в откатываемой транзакции: коллация `C`, отказ удаления статуса, триггер снятия ответственного, каскад проекта (задача остаётся), счётчик номеров; `migrate diff` после применения — пусто.
  - `prisma/schema.prisma`: секция `// ── Задачи ──` — `enum TaskPriority`, `Task`, `TaskPlacement`, `WorkspaceTaskCounter` по «Ключевым решениям»; `ProjectStatus`: `@@unique([id, projectId])` и обратная связь `placements`; обратные связи в `Workspace` (`tasks`, `taskCounter`), `Project` (`placements`), `User` (`assignedTasks`, `createdTasks` — именованные relation).
  - `pnpm db:migrate --create-only --name add_tasks`, затем дописать в SQL миграции: `COLLATE "C"` для `"TaskPlacement"."position"`; функцию и триггер `task_unassign_removed_member` на `"WorkspaceMember"` (`AFTER DELETE FOR EACH ROW`). Применить `pnpm db:migrate`, затем `pnpm db:generate` (Prisma 7 не генерирует клиент при `migrate dev`).
  - Проверить: повторный `pnpm db:migrate` не находит drift (коллация и триггер не должны давать расхождений); `RESTRICT` у FK на статус; составные FK.
  - Логирование: не требуется (схема).
  - Files: `prisma/schema.prisma`, `prisma/migrations/*_add_tasks/migration.sql`.

- [x] Task 2: Доменные модели модуля `tasks` (depends on 1)
  - **По факту:** `fractional-indexing@4.0.0` (ESM; в v4 границы `a`/`b` можно передавать в любом порядке). Кроме `assert*` есть `canDeleteTask()` — для флага `canDelete` в DTO. Функция просрочки — `isTaskOverdue`, дата в DTO — `toIsoDate()`.
  - `pnpm add fractional-indexing` (точная версия, как остальные зависимости).
  - `src/modules/tasks/models/task-priority.ts`: `TASK_PRIORITIES = ['none','low','medium','high','urgent'] as const`, `TaskPriority`, `TASK_PRIORITY_LABELS` («Без приоритета», «Низкий», «Средний», «Высокий», «Срочный»).
  - `models/task.ts`: константы `TASK_TITLE_MAX_LENGTH = 200`, `TASK_DESCRIPTION_MAX_LENGTH = 10_000`, `TASK_PLACEMENT_LIMIT = 20`, `TASK_PAGE_SIZE = 50`; `normalizeTaskTitle()`; `parseTaskNumber(raw)` (целое > 0 или `null`); `formatTaskKey(number)` → `#42`; `assertCanDeleteTask({ createdById }, { userId, role })` (автор или owner, иначе `ForbiddenError`); `assertAssigneeIsMember(isMember)` → `ValidationError` с `fieldErrors.assigneeId`; `isOverdue(dueDate, today, categories)`.
  - `models/task-placement.ts`: класс `TaskPlacement` (`taskId`, `projectId`, `statusId`, `position`) с `moveTo({ statusId, statusProjectId, position })` (по образцу из ARCHITECTURE.md); `assertCanPlace(existingProjectIds, projectId)` — дубликат проекта → `ConflictError`, лимит → `ValidationError`.
  - `models/position.ts`: `positionAfter(last: string | null)`, `positionBetween(before, after)` поверх `generateKeyBetween`; `comparePositions(a, b)` (побайтно, с тай-брейком по `taskId`).
  - `models/index.ts` — внутренний реэкспорт. Без Prisma/Next/React; ошибки — из `@/shared/errors/app-error`.
  - Тесты: `task.test.ts` (нормализация названия, `parseTaskNumber` для `"0"`, `"-1"`, `"1.5"`, `"abc"`, `assertCanDeleteTask` — автор/owner/чужой member, `isOverdue` с границей «сегодня»), `task-placement.test.ts` (статус чужого проекта, дубликат проекта, лимит 20), `position.test.ts` (`positionAfter(null)`, монотонность серии `positionAfter`, `positionBetween` строго между, побайтное сравнение).
  - Логирование: модели не логируют; ошибки логируют сервисы и `toActionError`.
  - Files: `package.json`, `pnpm-lock.yaml`, `src/modules/tasks/models/{task-priority,task,task-placement,position,index}.ts`, `src/modules/tasks/models/*.test.ts`.

<!-- Commit checkpoint: tasks 1-2 -->

### Phase 2: Серверная логика

- [x] Task 3: Доработки `workspaces` и `projects` под задачи (depends on 1)
  - **По факту:** правило «статус с задачами удаляется только с переносом» — в модели: `StatusSet.remove(id, { tasksCount, moveToId })` возвращает id цели. `mutateStatusSet` получил хук `beforeSave(tx)` — в нём `reassignPlacements` до `saveSet`. `tasksCount` есть и в `ProjectListItemDto`.
  - `workspaces`: `member.repository.isMember(workspaceId, userId)`; `member.service.isWorkspaceMember(workspaceId, userId)` — без сессии, только для серверных модулей, вызывающих после собственной проверки доступа (JSDoc об этом); экспорт из `workspaces/index.ts`.
  - `projects/slices/status`: `listByProject` возвращает `tasksCount` (`_count.placements`), `ProjectStatusDto.tasksCount`; `deleteStatus(session, { …, moveToStatusId? })`: если в статусе есть задачи и `moveToStatusId` не задан → `ValidationError` с `fieldErrors.moveToStatusId` («Выберите статус для задач»); цель — статус того же проекта, не удаляемый; перенос `statusRepository.reassignPlacements(tx, workspaceId, projectId, fromId, toId)` до `saveSet` в той же транзакции под `lockProject`. Комментарий об исключении из правила владения таблицей. Убрать комментарий «появится на этапе Задачи».
  - `projects/slices/project`: `ProjectDto.tasksCount` (для диалога удаления); убрать комментарий-заглушку в `deleteProject` (размещения удаляются каскадом, задачи остаются в пространстве).
  - Схемы/actions: `deleteStatusSchema` + `moveToStatusId` (optional `z.uuid()`), `deleteStatusAction` передаёт его.
  - Тесты: обновить `status.service.test.ts` — удаление статуса с задачами без цели → `VALIDATION`, цель из другого проекта → `NOT_FOUND`, цель = удаляемый → `VALIDATION`, перенос вызывается до `saveSet`; `member.service.test.ts` — `isWorkspaceMember`; `status.schema.test.ts` — `moveToStatusId`.
  - Логирование: `INFO [projects.status] deleted { projectId, statusId, movedTasks, moveToStatusId }`; `WARN [status.deleteStatus] target required { projectId, statusId, tasksCount }`; `DEBUG [member.isWorkspaceMember] { workspaceId, userId, result }`.
  - Files: `src/modules/workspaces/slices/member/member.{repository,service}.ts`, `src/modules/workspaces/index.ts`, `src/modules/projects/slices/status/status.{repository,service,dto,schema,actions}.ts`, `src/modules/projects/slices/project/project.{repository,service,dto}.ts`, соответствующие `*.test.ts`.

- [x] Task 4: Срез `task`: репозиторий, DTO, сервис (depends on 2, 3)
  - **По факту:** статус цели размещения проверяется чтением `ProjectStatus` в `placementRepository.findStatus` (только чтение, в транзакции; целостность — составные FK), а не через `listStatuses` модуля `projects`. Из `projects` используются `isEntityId` и `parseStatusColor` (добавлены в `client.ts`). Курсор списка — `encodeTaskCursor`/`decodeTaskCursor` в модели. Маппинг строк в DTO — `task.mapper.ts`. `placementRepository` создан в этой задаче (нужен `createTask`).
  - `slices/task/task.repository.ts` (`import 'server-only'`): `nextNumber(tx, workspaceId)` (`$queryRaw` с `ON CONFLICT … RETURNING`), `create(tx, data)`, `findByNumber(workspaceId, number)` и `findById(workspaceId, taskId, tx?)` (с размещениями: проект, статус, категория; ответственный, автор), `update(workspaceId, taskId, data)` (`updateMany` с `workspaceId`, 0 строк → `null`), `delete(workspaceId, taskId)`, `listPage(workspaceId, cursor?)` (`orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`, `take: TASK_PAGE_SIZE + 1`).
  - `task.dto.ts`: `TaskDto { id, number, key, title, description, priority, dueDate (YYYY-MM-DD | null), assignee: { userId, name, image } | null, createdBy, createdAt, updatedAt, placements: TaskPlacementDto[], canDelete }`, `TaskPlacementDto { projectId, projectName, statusId, statusName, statusColor, statusCategory }`, `TaskListItemDto`, `TaskPageDto { items, nextCursor }`.
  - `task.service.ts`: `createTask(session, { workspaceId, title, description?, priority, dueDate?, assigneeId?, placement?: { projectId, statusId } })` — member; проверка ответственного; `prisma.$transaction`: номер → задача → (если задано) размещение в конец колонки через `placementRepository` (статус проверяется на принадлежность проекту и проект — пространству; иначе `NOT_FOUND`); возвращает `{ number }`. `getTaskByNumber`, `updateTask` (частичное обновление полей; смена ответственного — с проверкой членства), `deleteTask` (`assertCanDeleteTask`), `listTasks(session, workspaceId, cursor?)`.
  - Все методы: первым делом `requireWorkspaceAccess`; наружу — DTO; некорректный UUID/номер → `NotFoundError` до запроса.
  - Тесты (моки `@/shared/access`, репозиториев, `@/shared/db`, `@/modules/workspaces`): неучастник → `NOT_FOUND`; ответственный не участник → `VALIDATION` (`fieldErrors.assigneeId`); статус из другого проекта при создании → `NOT_FOUND`/`VALIDATION`; удаление чужой задачи участником → `FORBIDDEN`, владельцем — ок; задача другого пространства по номеру → `NOT_FOUND`; пагинация выдаёт `nextCursor` только при лишней строке.
  - Логирование (`createLogger('tasks.task')`): `DEBUG [task.<method>] start { userId, workspaceId, taskId|number }`; `INFO [task] created { workspaceId, taskId, number, userId, placed: boolean }`, `updated { workspaceId, taskId, fields }`, `deleted { workspaceId, taskId, userId }`; `WARN` при отказе инварианта (не участник, нет прав на удаление). Название и описание задачи в логи не писать.
  - Files: `src/modules/tasks/slices/task/task.{repository,dto,service}.ts`, `task.service.test.ts`.

- [x] Task 5: Срезы `placement` и `views` (depends on 4)
  - **По факту:** чтение доски — `views.repository.ts` (`listBoardPlacements`, один запрос); «просрочено» на карточке считается по категории статуса в этом проекте. `placementRepository.taskExists` проверяет задачу перед добавлением в проект.
  - `slices/placement/placement.repository.ts`: `findStatusInProject(tx, workspaceId, projectId, statusId)`, `lastPosition(tx, projectId, statusId)` (`orderBy: { position: 'desc' }`), `listProjectIds(tx, workspaceId, taskId)`, `create`, `updateStatus(tx, workspaceId, taskId, projectId, { statusId, position })`, `delete(workspaceId, taskId, projectId)`. Все `where` — с `workspaceId`.
  - `placement.service.ts` (member): `addToProject(session, { workspaceId, taskId, projectId, statusId })` — `assertCanPlace`, позиция в конец колонки; `changeStatus(session, { workspaceId, taskId, projectId, statusId })` — `TaskPlacement.moveTo`, позиция в конец новой колонки (тот же статус — no-op); `removeFromProject`. Мутации — в `prisma.$transaction`; P2002 по `(taskId, projectId)` → `ConflictError` («Задача уже в этом проекте»).
  - `slices/views/views.queries.ts`: `getBoardCards(session, workspaceId, projectId)` → `Record<statusId, BoardCardDto[]>` (сортировка `comparePositions`), `BoardCardDto { taskId, number, key, title, priority, dueDate, isOverdue, assignee }`. Один запрос с `include`, без N+1.
  - Тесты: `placement.service.test.ts` — повторное добавление в проект → `CONFLICT`, статус другого проекта → `VALIDATION`, `changeStatus` пишет позицию после последней карточки целевой колонки, лимит 20, чужое пространство → `NOT_FOUND`; `views.queries.test.ts` — группировка по статусам и порядок.
  - Логирование (`createLogger('tasks.placement')`, `tasks.views`): `DEBUG` на входе; `INFO [placement] added { taskId, projectId, statusId }`, `status changed { taskId, projectId, from, to }`, `removed { taskId, projectId }`; `DEBUG [views.getBoardCards] { projectId, cards }`.
  - Files: `src/modules/tasks/slices/placement/placement.{repository,service}.ts`, `src/modules/tasks/slices/views/views.{queries,dto}.ts`, `*.test.ts`.

- [x] Task 6: Zod-схемы, Server Actions и публичный API `tasks` (depends on 4, 5)
  - **По факту:** вместо флага `stay` — отдельный `quickCreateTaskAction` (без редиректа, возвращает номер). `createTask` возвращает `workspaceSlug` для редиректа. `createTaskSchema` сам собирает `placement` из `projectId`/`statusId`. `loadMoreTasksAction({ workspaceId, cursor })` → `ActionResult<TaskPageDto>`.
  - `task.schema.ts`: `createTaskSchema` (`workspaceId`, `title`, `description` — пустая строка → `undefined`, `priority` из `TASK_PRIORITIES` с дефолтом `none`, `dueDate` — `z.iso.date()` или пусто, `assigneeId` — пусто → `undefined`, `projectId`/`statusId` — оба или ни одного, `.refine`), `updateTaskSchema` (+ `taskId`; пустые `dueDate`/`assigneeId` → `null` = снять), `deleteTaskSchema`, `taskNumberSchema` (параметр URL).
  - `placement.schema.ts`: `addToProjectSchema`, `changeStatusSchema`, `removeFromProjectSchema`.
  - `*.actions.ts` (`'use server'`, `useActionState`, по образцу `project.actions.ts`): `createTaskAction` (`redirect` на страницу задачи вне `try/catch`, кроме режима быстрого создания с доски — флаг `stay`), `updateTaskAction`, `deleteTaskAction` → `redirect('/w/<slug>/tasks')`, `addToProjectAction`, `changeStatusAction`, `removeFromProjectAction`; `revalidatePath('/w/[workspaceSlug]', 'layout')`. `loadMoreTasksAction(cursor)` для «Показать ещё».
  - `src/modules/tasks/index.ts` (сервер: `getTaskByNumber`, `listTasks`, `getBoardCards` + всё из `client.ts`) и `client.ts` (actions, схемы, `TASK_PRIORITIES`, `TASK_PRIORITY_LABELS`, лимиты, DTO-типы).
  - ESLint: убедиться, что `tasks` не импортирует внутренности `projects`/`workspaces`, а `projects` не импортирует `tasks`.
  - Тесты: `task.schema.test.ts` (пустые строки, невалидная дата `2026-02-30`, только `projectId` без `statusId`, неизвестный приоритет), `placement.schema.test.ts`.
  - Логирование: actions не логируют бизнес-события; `DEBUG [tasks.actions] redirect { to }`; ошибки — `toActionError(error, { action })`.
  - Files: `src/modules/tasks/slices/task/task.{schema,actions}.ts`, `src/modules/tasks/slices/placement/placement.{schema,actions}.ts`, `src/modules/tasks/{index,client}.ts`, `*.schema.test.ts`.

<!-- Commit checkpoint: tasks 3-6 -->

### Phase 3: UI

- [x] Task 7: Карточки на доске и быстрое создание задачи (depends on 6)
  - `projects/[projectId]/board/page.tsx`: параллельно `listStatuses()` и `getBoardCards()` (`Promise.all`), передать в `BoardColumns`; убрать заглушку «Задачи появятся на следующем этапе».
  - `src/components/projects/board-columns.tsx` → колонки со счётчиком карточек и пустым состоянием; `src/components/tasks/task-card.tsx` — ссылка на задачу: ключ `#42`, название (до 3 строк), бейдж приоритета, срок (красный при `isOverdue`), инициалы ответственного.
  - `src/components/tasks/quick-create-task.tsx` (`'use client'`): кнопка «+ Задача» внизу колонки → инлайн-поле названия, Enter создаёт задачу в этом статусе (`createTaskAction` с `stay`), Esc отменяет.
  - `src/components/tasks/priority-badge.tsx`, `due-date.tsx` (формат `d MMM` через `Intl.DateTimeFormat('ru', { timeZone: 'UTC' })`).
  - Логирование: нет (UI).
  - Files: `src/app/(app)/w/[workspaceSlug]/projects/[projectId]/board/page.tsx`, `src/components/projects/board-columns.tsx`, `src/components/tasks/{task-card,quick-create-task,priority-badge,due-date,assignee-avatar}.tsx`.

- [x] Task 8: Страница задачи (depends on 6)
  - **По факту:** статусы всех проектов для селектов — новая read-функция `listWorkspaceStatuses` модуля `projects` (один запрос). Смена статуса — `useOptimistic` (откат при ошибке без эффекта), форма «Добавить в проект» пересоздаётся по `key` после успеха. Общие поля форм задачи — `task-fields.tsx`.
  - `src/app/(app)/w/[workspaceSlug]/tasks/[taskNumber]/page.tsx`: `taskNumberSchema` → `notFound()`; `getTaskByNumber` (`NotFoundError` → `notFound()`), `listMembers`, `listProjects` внутри `<Suspense>`.
  - `src/components/tasks/task-details-form.tsx`: название, описание (`textarea`), приоритет (`select`), срок (`input type=date`, «Очистить»), ответственный (`select` участников + «Не назначен»); сохранение — `updateTaskAction`, ошибки полей — `FormField`/`FormError`.
  - `src/components/tasks/task-placements.tsx`: список «Проект → статус (`select`)» со сменой статуса (`changeStatusAction`, откат при ошибке, toast `sonner`), «Убрать из проекта» (`alert-dialog`); форма «Добавить в проект»: проект (без уже выбранных) → статус (статусы проекта подгружаются: страница передаёт статусы всех проектов пространства или загружает их через read-функцию — выбрать при реализации, без N+1).
  - Шапка: ключ, автор, даты; «Удалить задачу» (только при `canDelete`) с подтверждением.
  - Описание выводится как текст (`whitespace-pre-wrap`), без `dangerouslySetInnerHTML`.
  - Логирование: нет (UI).
  - Files: `src/app/(app)/w/[workspaceSlug]/tasks/[taskNumber]/page.tsx`, `src/components/tasks/{task-details-form,task-placements,add-to-project-form,delete-task-dialog}.tsx`.

- [x] Task 9: Список задач пространства и создание задачи (depends on 6)
  - `src/app/(app)/w/[workspaceSlug]/tasks/page.tsx`: таблица (`table` из shadcn) — ключ, название, проекты/статусы (бейджи), приоритет, срок, ответственный; первые 50 на сервере, «Показать ещё» — клиентский компонент с `loadMoreTasksAction`; пустое состояние.
  - `src/app/(app)/w/[workspaceSlug]/tasks/new/page.tsx` + `src/components/tasks/create-task-form.tsx`: все поля задачи + необязательные проект и статус; `?projectId=` предзаполняет проект.
  - `src/components/workspaces/workspace-nav.tsx`: вкладка «Задачи» (`/tasks`, активна на `/tasks/*`); кнопка «Новая задача» в шапке проекта (`project-nav.tsx`) и на странице списка.
  - Логирование: нет (UI).
  - Files: `src/app/(app)/w/[workspaceSlug]/tasks/{page,new/page}.tsx`, `src/components/tasks/{task-table,load-more-tasks,create-task-form}.tsx`, `src/components/workspaces/workspace-nav.tsx`, `src/components/projects/project-nav.tsx`.

- [x] Task 10: Удаление статуса и проекта с задачами; сквозная проверка (depends on 3, 7, 8, 9)
  - **Проверено (2026-10-15, `next start` на :3000, скрипт Playwright, 21 проверка, стабильно в 3 прогонах подряд):** весь сценарий ниже, включая дубликат размещения со «старой» страницы второго участника, предвыбор проекта в `/tasks/new?projectId=`, отсутствие HTML-рендера в описании. В логе сервера нет ERROR. Несуществующая задача отдаёт not-found UI со статусом 200 (`notFound()` внутри `<Suspense>` после начала стрима) — так же, как страницы проектов. Тестовые данные удалены. Диалог удаления статуса — `delete-status-dialog.tsx`.
  - `src/components/projects/status-row.tsx`: при `tasksCount > 0` диалог удаления требует выбрать статус для переноса (`select` из остальных статусов проекта), показывает «N задач будут перенесены»; без задач — прежний диалог.
  - `src/components/projects/status-list.tsx` / настройки: показывать число задач у статуса.
  - `src/components/projects/delete-project-dialog.tsx`: «В проекте N задач. Они будут убраны из проекта, но останутся в пространстве».
  - Логирование: нет (UI).
  - Проверка вручную (сквозной сценарий, Playwright по образцу этапа «Проекты и статусы»): участник создаёт задачу с доски → карточка в конце колонки; на странице задачи меняет поля, назначает ответственного, добавляет задачу во второй проект с другим статусом → карточка на обеих досках в своих колонках; смена статуса в одном проекте не меняет другой; повторное добавление в тот же проект → ошибка; удаление статуса с задачами без цели невозможно, с целью — карточки в целевой колонке; удаление проекта оставляет задачу в списке пространства; удаление участника из пространства снимает его с задач; участник не может удалить чужую задачу, владелец может; номер другого пространства и `/tasks/abc` → 404; `pnpm check` и `pnpm build` зелёные.
  - Files: `src/components/projects/{status-row,status-list,delete-project-dialog}.tsx`, `src/app/(app)/w/[workspaceSlug]/projects/[projectId]/settings/page.tsx`.

<!-- Commit checkpoint: tasks 7-10 -->

## Риски и что проверить

- **Коллация `position` и Prisma drift.** Prisma не описывает `COLLATE` в схеме; проверить, что `migrate dev` после ручной правки не предлагает новую миграцию. Запасной вариант — сортировать карточки в `views` через `comparePositions` (уже есть) и брать «последнюю позицию» тоже в JS из ключей колонки.
- **Триггер на `WorkspaceMember`.** Убедиться, что `migrate dev` не считает триггер drift-ом и `migrate reset` его пересоздаёт; покрыть сквозной проверкой. Альтернатива — снятие ответственного в `member.service` через колбэк, регистрируемый модулем `tasks` (сложнее и хрупче из-за порядка загрузки модулей).
- **`Restrict` на статусе и каскад проекта.** При удалении проекта каскад удаляет размещения раньше статусов — проверить, что `DELETE Project` не падает на `RESTRICT` (порядок каскадов в Postgres внутри одного оператора). Если падает — `NoAction` (проверка в конце оператора) вместо `Restrict`.
- **Гонки нумерации.** `ON CONFLICT … DO UPDATE` атомарен; откат транзакции создания задачи оставляет «дыру» в номерах — это допустимо.
- **Гонки позиций.** Две карточки, добавленные одновременно в конец колонки, могут получить одинаковый ключ — порядок детерминирован тай-брейком; на этапе «Канбан-доска» `positionBetween` для равных соседей должен генерировать ключ корректно (проверить поведение `fractional-indexing` при `a === b` — бросает ошибку; обработать там).
- **Устаревшие данные на странице.** Ответственный удалён из пространства / статус удалён, пока страница открыта: сервер вернёт `VALIDATION`/`NOT_FOUND` — сообщения должны быть понятными, `revalidatePath` обновит данные.
- **Cache Components.** Новые страницы читают сессию — `pnpm build` без ошибок «uncached data outside Suspense».
- `pnpm check` и `pnpm build` должны оставаться зелёными после каждой commit-точки.
