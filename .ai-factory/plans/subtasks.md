# План реализации: подзадачи с произвольной вложенностью

Branch: none (full-план, `git.create_branches: false` — работа в текущей ветке)
Created: 2026-10-16

## Settings
- Testing: yes — Vitest (`environment: node`): чистые функции дерева задач (циклы, глубина, хлебные крошки, прогресс), Zod-схемы, сервис подзадач с моками репозитория (по образцу `task.service.test.ts`, `placement.service.test.ts`).
- Logging: verbose — `createLogger('tasks.subtask')` в новом срезе: `debug` на входе в каждый сценарий (userId, workspaceId, taskId, parentId), `info` на успешное изменение дерева (создание подзадачи, смена родителя, удаление поддерева с числом задач и вложений), `warn` на отказ (цикл, превышение глубины, родитель из другого пространства / не найден). Названия задач в логи не писать.
- Docs: yes — обязательный чекпоинт документации в конце (`docs/architecture.md`, `AGENTS.md`, `.ai-factory/DESCRIPTION.md`).

## Roadmap Linkage
Milestone: "none"
Rationale: В `ROADMAP.md` нет этапа для подзадач; добавить его можно через `/aif-roadmap`.

## Требования и принятые решения

- **Подзадача — это обычная задача** (`Task`) с родителем `parentId`. У неё есть свой номер (`TSK-43`), поля, комментарии, вложения, документы, GitHub-связи и своя страница/панель.
- **Вложенность многоуровневая:** у подзадачи могут быть свои подзадачи. Техническое ограничение — `TASK_MAX_DEPTH = 10` уровней (защищает рекурсивные CTE и интерфейс; по аналогии с `FOLDER_MAX_DEPTH` в документах). Циклы запрещены.
- **Доска — по желанию.** По умолчанию подзадача не размещена ни в одном проекте и на доске не видна. «Вывести на доску» = создать обычное размещение `TaskPlacement` (проект + статус) через существующий срез `placement`; у подзадачи свой статус в каждом проекте, независимо от родителя.
- **Статус родителя не вычисляется** из подзадач автоматически; в задаче и на карточке показывается прогресс «выполнено N из M» (подзадача выполнена по существующему правилу `isTaskOpen`: есть размещения и все в категории `done`).
- **Удаление родителя удаляет всё поддерево** (каскад в БД). Диалог подтверждения показывает число вложенных подзадач; объекты вложений всего поддерева удаляются из S3 после удаления строк. Право удаления проверяется только для корня поддерева (автор или владелец — как сейчас).
- **Смена родителя:** задачу можно перенести к другому родителю того же пространства или сделать задачей верхнего уровня. Проверяются цикл (новый родитель не может быть самой задачей или её потомком) и итоговая глубина.
- **Общий список `/tasks`:** показываются все задачи; у подзадач — метка «↳ TSK-12» (родитель), фильтр «Только верхнего уровня». В списке проекта и на доске — та же метка родителя.
- **Конкурентность:** все изменения дерева (создание подзадачи, смена родителя) — в транзакции с `pg_advisory_xact_lock(hashtext('tasks-tree:<workspaceId>'))`, как у папок документов (`folder.service.ts`).
- **Мультиарендность:** связь с родителем — составной FK `(parentId, workspaceId) → Task(id, workspaceId)`, подзадача не может оказаться в чужом пространстве; все запросы и CTE фильтруются по `workspaceId`.

## Commit Plan
- **Commit 1** (после задач 1–3): `feat(tasks): task hierarchy schema and tree rules`
- **Commit 2** (после задач 4–6): `feat(tasks): subtask service, parent change and subtree deletion`
- **Commit 3** (после задач 7–9): `feat(tasks): subtasks section, parent breadcrumbs and parent picker`
- **Commit 4** (после задач 10–11): `feat(tasks): parent marker and subtask progress on board and lists`
- **Commit 5** (после задачи 12): `docs: subtasks`

## Tasks

### Phase 1: Данные и правила дерева

- [x] **Task 1: Схема БД и миграция**
  `prisma/schema.prisma`, модель `Task`:
  - `parentId String? @db.Uuid` с комментарием (родительская задача; null — верхний уровень).
  - Самосвязь: `parent Task? @relation("TaskSubtasks", fields: [parentId, workspaceId], references: [id, workspaceId], onDelete: Cascade)` и `subtasks Task[] @relation("TaskSubtasks")`.
  - Индекс `@@index([workspaceId, parentId])`.
  - Миграция `pnpm db:migrate --name add_task_parent` → `prisma/migrations/<timestamp>_add_task_parent/`. Проверить в SQL: FK составной, `ON DELETE CASCADE`; дополнительно добавить вручную `CHECK ("parentId" IS NULL OR "parentId" <> "id")` (защита от самоссылки на уровне БД).
  - Регенерировать клиент (`pnpm prisma generate`), убедиться, что `pnpm typecheck` проходит.
  Логирование: не требуется (схема).

- [x] **Task 2: Доменные правила дерева задач** (зависит от 1)
  Новый файл `src/modules/tasks/models/task-tree.ts` (+ экспорт из `models/index.ts`, клиентские части — из `client.ts`):
  - `TASK_MAX_DEPTH = 10`, `TASK_SUBTASKS_LIMIT = 200` (прямых подзадач у одной задачи).
  - `assertCanAddSubtask(parentPathLength: number, childrenCount: number)` — `ValidationError` «Вложенность подзадач — не больше 10 уровней» / «У задачи не больше 200 подзадач».
  - `assertCanMoveTask({ taskId, targetPathIds, subtreeHeight })` — цикл (`targetPathIds` содержит `taskId`) → `ValidationError` «Нельзя сделать задачу подзадачей её собственной подзадачи»; `targetPathIds.length + subtreeHeight > TASK_MAX_DEPTH` → ошибка глубины.
  - `summarizeSubtasks(children: { categories: string[] }[]): { total: number; done: number }` — через существующий `isTaskOpen`.
  Тесты `task-tree.test.ts`: граница глубины (9/10/11), цикл на себя и на потомка, перенос в корень, прогресс (без размещений = открыта, все `done` = выполнена, пусто = 0/0).
  Логирование: нет (чистые функции; логирует вызывающий сервис).

- [x] **Task 3: Репозиторий дерева** (зависит от 1)
  Новый срез `src/modules/tasks/slices/subtask/subtask.repository.ts` (по образцу `documents/slices/folder/folder.repository.ts`, все запросы с `workspaceId`, `RECURSION_LIMIT = TASK_MAX_DEPTH + 1`):
  - `lockTree(tx, workspaceId)` — `pg_advisory_xact_lock(hashtext('tasks-tree:' || workspaceId))`.
  - `pathIds(workspaceId, taskId, tx?)` — цепочка id от корня до задачи (WITH RECURSIVE вверх по `parentId`).
  - `ancestors(workspaceId, taskId)` — то же, но с `number`, `title` для хлебных крошек (без самой задачи).
  - `subtreeHeight(workspaceId, taskId, tx?)`, `descendantCount(workspaceId, taskId)`.
  - `subtreeAttachmentKeys(tx | prisma, workspaceId, taskId)` — `storageKey` вложений задачи, её комментариев и всех потомков (заменяет `attachmentRepository.keysForTask` при удалении).
  - `listChildren(workspaceId, parentId)` — прямые подзадачи по `number`: `TASK_LIST_SELECT` + `_count: { subtasks }`.
  - `childrenCategories(workspaceId, parentIds[])` — для прогресса: `{ parentId, placements: { status: { category } } }` одним запросом.
  - `setParent(tx, workspaceId, taskId, parentId | null)` — `updateMany` с `workspaceId`.
  Логирование: нет (репозиторий); сервис логирует результаты.

### Phase 2: Серверная логика

- [x] **Task 4: Создание подзадачи** (зависит от 2, 3)
  - `src/modules/tasks/slices/task/task.schema.ts`: в `createTaskSchema` добавить `parentId: optionalId` (пусто → undefined). В `quickCreateTaskAction` — тоже, если удобнее для встроенной формы (см. задачу 7).
  - `src/modules/tasks/slices/task/task.service.ts`, `createTask`: новое поле `parentId?: string`. Внутри транзакции до `nextNumber`: `lockTree`, найти родителя `findById(workspaceId, parentId, tx)` (нет → `NotFoundError('Родительская задача не найдена')`), `pathIds` + число детей → `assertCanAddSubtask`, записать `parentId`. Существующее размещение (`placement`) работает как раньше — это и есть «сразу вывести на доску».
  - Возвращаемое значение и редиректы — без изменений.
  Логи: `debug '[task.createTask] start'` дополнить `parentId`; `warn` при отказе по глубине/лимиту с `{ workspaceId, parentId, depth }`; `info '[task] created'` — с `parentId`.
  Тесты в `task.service.test.ts`: создание с родителем, родитель из другого пространства → NotFound, превышение глубины → Validation.

- [x] **Task 5: Сервис и actions подзадач** (зависит от 3, 4)
  `src/modules/tasks/slices/subtask/`:
  - `subtask.dto.ts`: `SubtaskDto` (= `TaskListItemDto` + `subtaskCount`, `progress: { total; done }`), `TaskAncestorDto { number; key; title }`, `TaskParentOptionDto { taskId; number; key; title }`.
  - `subtask.schema.ts`: `setTaskParentSchema { workspaceId, taskId, parentId: '' | uuid }`, `searchParentSchema { workspaceId, taskId, q }`.
  - `subtask.service.ts` (`import 'server-only'`, `requireWorkspaceAccess` в каждой функции):
    - `listSubtasks(session, workspaceId, taskId)` — дети + прогресс каждого (через `childrenCategories`).
    - `setTaskParent(session, { workspaceId, taskId, parentId | null })` — транзакция: `lockTree`, загрузить задачу и нового родителя (оба в пространстве), `pathIds(parent)`, `subtreeHeight(task)`, `assertCanMoveTask`, проверка лимита детей, `setParent`. Право: любой участник (как правка задачи).
    - `searchParentCandidates(session, workspaceId, taskId, q)` — до 20 задач по номеру/ключу или `title contains` (insensitive), исключая саму задачу и её поддерево (id поддерева — CTE); сервер всё равно перепроверяет при сохранении.
  - `subtask.actions.ts` (`'use server'`, `toActionError`, `revalidatePath` пространства как в `task.actions.ts`): `setTaskParentAction`, `detachSubtaskAction` (parentId = null), `searchParentCandidatesAction`.
  - Экспорт: read-функции — из `src/modules/tasks/index.ts`, actions/DTO/схемы — из `client.ts`.
  Логи: `debug` на вход (`userId, workspaceId, taskId, parentId`), `info '[subtask] parent changed' { workspaceId, taskId, fromParentId, toParentId }`, `warn` на цикл/глубину/не найдено.
  Тесты `subtask.service.test.ts`: перенос, перенос в собственного потомка → ошибка, перенос в корень, превышение глубины с учётом высоты поддерева, чужое пространство → NotFound; `subtask.schema.test.ts`.

- [x] **Task 6: Удаление поддерева и данные задачи** (зависит от 3)
  - `task.service.ts`, `deleteTask`: ключи вложений собирать через `subtreeAttachmentKeys` (до удаления), число удаляемых потомков — `descendantCount`; строки удаляет каскад FK. `info '[task] deleted'` дополнить `{ descendants, attachments }`.
  - `task.repository.ts` `TASK_SELECT`: добавить `parentId`, `_count: { select: { subtasks: true } }`.
  - `task.dto.ts` `TaskDto`: `ancestors: TaskAncestorDto[]` (от корня к родителю), `descendantCount: number`, `subtaskProgress: { total; done }`. `getTaskByNumber` заполняет их (`ancestors`, `descendantCount`, `childrenCategories` для прямых детей) параллельно через `Promise.all`.
  - Проверить, что модули `documents`, `integrations/github`, `notifications` не ломаются от каскада (их таблицы ссылаются на `Task` с `onDelete: Cascade`; у уведомлений `taskId` без FK — снимок, ничего не делать).
  Логи: `debug '[task.getTaskByNumber]'` дополнить `{ depth: ancestors.length, descendants }`.
  Тесты: `deleteTask` удаляет объекты всех вложений поддерева (мок `deleteStoredObjects`).

### Phase 3: Интерфейс задачи

- [x] **Task 7: Раздел «Подзадачи» в задаче** (зависит от 5, 6)
  Новая папка `src/components/tasks/subtasks/`:
  - `task-subtasks-section.tsx` (server, в `Suspense` как документы): заголовок «Подзадачи N/M» с тонкой полосой прогресса, список `SubtaskRow`, пустое состояние.
  - `subtask-row.tsx`: ключ, название (ссылка через `taskPanelHref` — открывает подзадачу в той же панели), чипы статусов размещений (как в `task-placements.tsx`), ответственный, счётчик вложенных «⋯ 3» если у подзадачи есть свои подзадачи; меню: «Открыть», «Вывести на доску», «Отвязать от задачи».
  - «Вывести на доску»: диалог/поповер с выбором проекта и статуса, переиспользующий `AddToProjectForm` + `addToProjectAction` (проекты родителя — первыми в списке).
  - `add-subtask-form.tsx`: встроенное поле «Добавить подзадачу» (Enter — создать, только название; по образцу `quick-create-task.tsx`) + ссылка «Подробно…» → `?task=new&parent=<number>`.
  Подключить секцию в `src/components/tasks/task-panel/task-details-view.tsx` между описанием и вложениями (работает и на `/tasks/[n]`, и в панели).
  Логирование: клиентские компоненты — без `console.*`; ошибки actions показывать через `FormError`/toast.

- [x] **Task 8: Родитель: хлебные крошки и смена родителя** (зависит от 5, 6)
  - `task-details-view.tsx`: над заголовком — хлебные крошки предков (`TSK-1 › TSK-5 › …`, каждая — ссылка в панели; на узких экранах — только ближайший родитель с «…»).
  - `src/components/tasks/subtasks/parent-picker.tsx`: свойство «Родительская задача» в `TaskPropertyList` — combobox (shadcn `Command` в `Popover`) с поиском через `searchParentCandidatesAction` (debounce 250 мс), пункт «Без родителя»; сохранение — `setTaskParentAction`, статус сохранения через существующий `TaskSaveStatusProvider`.
  - Диалог удаления задачи (`task-toolbar.tsx` / `ConfirmActionDialog`): при `descendantCount > 0` текст «Будут удалены также N подзадач (со всеми вложениями)».
  Логирование: нет (клиент); серверная часть логируется в задаче 5.

- [x] **Task 9: Создание подзадачи через полную форму** (зависит от 4)
  - `task-panel-href.ts`: параметр `parent` для `?task=new&parent=12` (парсинг номера через `taskNumberSchema`, мусор игнорируется) + тесты в `task-panel-href.test.ts`.
  - `task-create-view.tsx` и страница `tasks/new`: если передан `parent` — загрузить задачу по номеру (нет доступа/не найдена → форма без родителя), показать «Подзадача для TSK-12 Название», скрытое поле `parentId` в `create-task-form.tsx`. Поля проекта и статуса остаются — так подзадачу можно сразу вывести на доску.
  - После создания — открыть новую подзадачу (как сейчас) и сбросить `parent` из адреса.
  Логирование: `debug` в серверном компоненте не нужен — чтение уже логирует `getTaskByNumber`.

### Phase 4: Доска и списки

- [x] **Task 10: Метка родителя и прогресс на доске** (зависит от 6)
  - `views.dto.ts` `BoardCardDto`: `parent: { number; key; title } | null`, `subtaskProgress: { total; done } | null` (null — нет подзадач).
  - `views.repository.ts` `listBoardPlacements`: в select задачи — `parent: { select: { number, title } }`; прогресс — одним доп. запросом `childrenCategories` по id задач доски в `getBoardCards` (`views.queries.ts`).
  - `src/components/tasks/task-card.tsx`: над названием мелкая строка `↳ TSK-12 Название родителя` (truncate, `text-muted-foreground`), в нижней строке — индикатор `☑ 2/5` (иконка lucide `ListChecks`, `aria-label="Подзадачи: выполнено 2 из 5"`).
  - Перетаскивание и `board-announcements.ts` — без изменений (подзадача на доске — обычное размещение).
  Логи: `debug '[views.getBoardCards]'` дополнить `{ withParent, withSubtasks }` (числа).
  Тесты: маппер карточки (`toBoardCard`) с родителем и без.

- [x] **Task 11: Метка родителя и фильтр в списках** (зависит от 6)
  - `task.select.ts` `TASK_LIST_SELECT` и `LIST_PLACEMENT_SELECT`: `parent: { select: { number, title } }`; `TaskListItemDto.parent`.
  - `src/modules/tasks/models/task-list-query.ts`: параметр `level` (`all` | `top`, по умолчанию `all`, URL `?level=top`), парсинг и сериализация + тесты в `task-list-query.test.ts`.
  - `task-list.prisma.ts`: `level=top` → `parentId: null` (для списка пространства и списка проекта) + тест в `task-list.prisma.test.ts`.
  - `task-list-table.tsx`: под названием подзадачи — `↳ TSK-12` (ссылка на родителя в панели); `task-list-toolbar.tsx` / `task-list-filter.tsx` — переключатель «Только верхнего уровня».
  - Профиль участника (`getMemberTaskSummary`) и счётчики — без изменений (подзадачи — полноценные задачи).
  Логи: в `logList` добавить `level`.

### Phase 5: Документация

- [x] **Task 12: Документация** (зависит от 1–11)
  - `docs/architecture.md`: раздел «Подзадачи» — модель `parentId` с составным FK, глубина и циклы, блокировка дерева, каскадное удаление поддерева и чистка вложений, «вывести на доску» = размещение, прогресс.
  - `AGENTS.md`: срез `tasks/slices/subtask`, папка `components/tasks/subtasks/`, новые read-функции в таблице точек входа; в описании `schema.prisma` — `Task.parentId`.
  - `.ai-factory/DESCRIPTION.md`: подзадачи в «Проекты и задачи» и в архитектурных заметках.
  - Предложить пользователю добавить пункт в `ROADMAP.md` через `/aif-roadmap`.
  Логирование: не требуется.
