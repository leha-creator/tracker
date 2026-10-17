# План реализации: расширение задач (история, метки, наблюдатели, архив, поиск Cmd+K, напоминания)

Branch: none (`git.create_branches: false`, работа в текущей ветке)
Created: 2026-10-17

## Settings
- Testing: yes. Vitest для чистых моделей (дифф истории, слияние записей, метки, архив поддерева, разбор запроса поиска, выбор задач для напоминаний) и для сервисов (по образцу `task.service.test.ts`: моки репозиториев и `prisma`).
- Logging: standard. Через `createLogger(scope)`: `info` — изменения (метка создана, задача в архиве, отправлено N напоминаний), `warn` — отказы (нет прав, чужое пространство, неверный секрет cron), `debug` — только старт сервисных функций и размеры выборок. `console.*` запрещён, секреты (`CRON_SECRET`) и текст описаний в логи не попадают.
- Docs: yes. Обязательный docs-чекпоинт в конце (`/aif-docs`): `docs/architecture.md`, `docs/agents.md`, `docs/configuration.md`, `docs/production.md`, `AGENTS.md`, `.ai-factory/ROADMAP.md`.

## Roadmap Linkage
Milestone: "Расширение задач"
Rationale: План закрывает 6 из 8 пунктов этапа: история, метки, наблюдатели, архив, поиск Cmd+K, напоминания. «Связи между задачами» и «Массовые действия» остаются на следующий план.

## Принятые решения (поправьте до `/aif-implement`, если не согласны)

1. **История** — таблица `TaskHistoryEntry` модуля `tasks`. В запись кладутся снимок имён (статусы, проекты, участники, метки), а не только id: история переживает переименования и удаления, как payload уведомлений. Описание целиком не хранится, пишется только факт «описание изменено». Запись делается в той же транзакции, что и изменение. Подряд идущие правки одного поля одним автором в пределах 5 минут сливаются в одну запись (`from` сохраняется, `to` обновляется). Автор — `actorId` и `viaTokenId` (пометка «через агента»), для системных изменений `source: 'github'`. Комментарии и вложения в историю не попадают: у них своя лента.
2. **Метки** — по образцу тегов документов (`DocumentTag`): `TaskLabel` (имя и цвет из палитры статусов) и `TaskLabelAssignment`. Создавать метку прямо из задачи может любой участник. Переименование, цвет и удаление — в `settings/labels` с правом `manageProjects`. До 10 меток на задачу, до 100 в пространстве.
3. **Наблюдатели** — `TaskWatcher`. Наблюдателем автоматически становятся автор, назначенный ответственный, автор комментария и упомянутый в комментарии. Кнопка «Следить / Не следить» в тулбаре задачи. `task_comment` теперь получают наблюдатели, а не «ответственный и автор». Новый тип `task_status_changed` приходит наблюдателям. Выход из пространства снимает наблюдение триггером БД, как это уже сделано для ответственного.
4. **Архив**:
   - *Задача.* Архивировать может любой участник. Архивируется вся ветка подзадач с одним `archivedAt`, восстановление возвращает задачи этой же операции. Архивные задачи скрыты с доски, из списков (кроме фильтра «Архив»), поиска, MCP `list_tasks` и автосмены статуса GitHub. По ссылке задача открывается с баннером и только для чтения. «Удалить навсегда» доступно только у архивной задачи, права прежние (`canDeleteTask`).
   - *Проект.* Архивирует право `manageProjects`. Проект скрыт из списков и фильтров. Его доска открывается только для чтения с баннером, размещения задач сохраняются. Удалить навсегда можно только архивный проект.
   - *Пространство.* Архивирует владелец. Пространство замораживается: `requireWorkspaceAccess` отвечает `NOT_FOUND` на всё, кроме чтения настроек владельцем (опция `allowArchived`). Токены MCP перестают работать, GitHub-вебхуки и напоминания его пропускают. На главной есть раздел «Архивные» с кнопками «Восстановить» и «Удалить навсегда».
5. **Поиск Cmd+K** — новый модуль-агрегатор `search` (зависит от `tasks`, `documents`, `workspaces`, от него не зависит никто). Ищет в текущем пространстве из URL: задачи (ключ `TSK-42`, `#42`, название), документы (название), участников (имя, email). Вне пространства — только пространства и команды. Для `ILIKE '%q%'` — индексы `pg_trgm` (GIN) на `Task.title` и `Document.title`. Палитра — `CommandDialog` (shadcn, `cmdk` 1.1.1 уже установлен) с горячей клавишей Cmd/Ctrl+K и кнопкой в шапке.
6. **Напоминания** — типы `task_due_soon` (срок завтра, ответственному) и `task_overdue` (срок прошёл, ответственному и наблюдателям; один раз на каждое значение срока). Запуск — `POST /api/cron/reminders` с `Authorization: Bearer ${CRON_SECRET}` (сравнение через `timingSafeEqual`; без `CRON_SECRET` эндпоинт отвечает 404). На сервере его раз в день в 09:00 по `REMINDERS_TIMEZONE` (по умолчанию `Europe/Moscow`) вызывает systemd-таймер `tasker-reminders.timer` (по образцу `tasker-backup-*.timer`) через `docker compose exec -T app wget`. Идемпотентность обеспечивает `TaskDueReminder @@unique([taskId, kind, dueDate])`: повторный запуск в тот же день ничего не шлёт. Пропускаются архивные задачи и пространства, задачи без ответственного и задачи, у которых все размещения в категориях `done`/`cancelled`.

## Commit Plan
- **Commit 1** (после задач 1–3): `feat(tasks): task change history with agent attribution`
- **Commit 2** (после задач 4–6): `feat(tasks): workspace labels on tasks, board, list and MCP`
- **Commit 3** (после задач 7–8): `feat(tasks): task watchers and status change notifications`
- **Commit 4** (после задач 9–12): `feat(archive): archive tasks, projects and workspaces instead of deleting`
- **Commit 5** (после задач 13–14): `feat(search): global Cmd+K search palette`
- **Commit 6** (после задач 15–16): `feat(tasks): due date and overdue reminders via scheduled endpoint`
- **Commit 7** (после задачи 17): `docs: task extensions`

## Tasks

### Phase 1: История изменений

- [x] **Task 1: Схема и модель истории**
  - `prisma/schema.prisma`: enum `TaskHistoryKind` (`created`, `title`, `description`, `priority`, `due_date`, `assignee`, `status`, `project_added`, `project_removed`, `parent`, `labels`, `archived`, `restored`; новые значения — только в конец) и модель `TaskHistoryEntry`: `id uuid(7)`, `workspaceId`, `taskId` (составной FK `[taskId, workspaceId]` → `Task`, каскад), `kind`, `actorId` (`User`, SetNull), `viaTokenId` (`ApiToken`, SetNull), `source` (`String?`: `null` — пользователь, `'github'` — система), `data Json`, `createdAt`, `updatedAt`. Индекс `@@index([taskId, createdAt])`. Миграция `pnpm db:migrate --name add_task_history`.
  - `src/modules/tasks/models/task-history.ts` (чистый TS): Zod-схемы `data` по `kind`, как `NOTIFICATION_PAYLOAD_SCHEMAS`: `{ from, to }` со снимками (`{ id, name }` для участника, проекта и статуса; строки для title и priority; ISO-даты). Функции:
    - `diffTaskFields(before, after, names)` → массив записей;
    - `mergeHistoryEntry(previous, next, now)` → `'merge' | 'append'` (одно поле, один автор и `viaTokenId`, не старше `HISTORY_MERGE_WINDOW_MS = 5 * 60_000`, только `title`/`description`/`priority`/`due_date`);
    - `parseHistoryData(kind, raw)` → данные или `null`;
    - `describeHistoryEntry(entry)` → строка для UI и MCP («сменил статус в „Разработка“: К выполнению → В работе»).
  - Экспорт из `models/index.ts`.
  - Тесты: `src/modules/tasks/models/task-history.test.ts` — дифф (`null` ↔ значение, без изменений → пусто), окно слияния, некорректный `data` → `null`, тексты для каждого `kind`.
  - Логирование: не требуется (чистые функции).

- [x] **Task 2: Запись истории во всех путях изменения задачи** (зависит от 1)
  - Новый срез `src/modules/tasks/slices/history/`: `history.repository.ts` (`append(tx, entry)`, `findLastForMerge(tx, taskId, kind)`, `updateData(tx, id, data)`, `listForTask(workspaceId, taskId, { limit, before })`) и `history.service.ts`: `recordHistory(tx, actor, entries)` (внутренний, применяет `mergeHistoryEntry`) и read-функция `listTaskHistory(session, workspaceId, taskId, { all })` → DTO с `actor`, `via` (через `toCreatedVia` из `task.mapper.ts`) и `text`.
  - Актор: `historyActorFrom(session)` → `{ actorId, viaTokenId: session.via?.tokenId ?? null, source: null }`, для системы — `{ actorId: null, viaTokenId: null, source: 'github' }`.
  - `task.service.ts`: `createTask` пишет `created` в своей транзакции. `updateTask` переносится в `prisma.$transaction`: `taskRepository.update` принимает `tx`, перед записью читается текущее состояние, после — `diffTaskFields` и `recordHistory`. Имена ответственных берутся из уже загруженного `current.assignee` и из `isWorkspaceMember`/`listMemberIdentities` для нового.
  - `placement.service.ts`: `addToProject` → `project_added`, `removeFromProject` → `project_removed`, `applyStatusChange` (оба пути: `changeStatus` и `changePlacementStatusBySystem`) и `movePlacement` при смене колонки → `status` со снимком имён статусов и проекта (`placementRepository.findStatus` вернёт `name` и имя проекта). Перенос внутри колонки в историю не пишется.
  - `subtask.service.ts`: `setTaskParent` → `parent` (`{ from: ref | null, to: ref | null }` с ключом и названием).
  - Экспорт `listTaskHistory` из `index.ts`.
  - Тесты: дописать `task.service.test.ts` и `placement.service.test.ts` (если его нет — создать по образцу): запись появляется, `viaTokenId` берётся из сессии, перенос внутри колонки истории не пишет, системная смена пишет `source: 'github'`.
  - Логирование: `debug` `[history] recorded` с `{ workspaceId, taskId, kinds, merged }`. Ошибки не глушить: запись в той же транзакции, сбой откатывает изменение.

- [x] **Task 3: История в интерфейсе и в MCP** (зависит от 2)
  - `src/components/tasks/history/task-history-section.tsx` (Server Component): лента последних 20 записей, «Показать всю историю» через параметр `history=all` (как `comments=all`; адрес строят `task-panel-href.ts` и `TaskDetailsView`). Строка — аватар (`UserAvatar`), имя или «Система (GitHub)» / «Удалённый пользователь», `ViaAgentBadge`, текст и относительное время (`format-relative-time.ts`), `title` с абсолютной датой.
  - `task-details-view.tsx`: секция «История» после GitHub, перед комментариями, в `Suspense` со скелетоном. Новый проп `allHistory` и адрес `showAllHistoryHref` прокинуть из `task-panel.tsx` и страницы `tasks/[taskNumber]/page.tsx`.
  - MCP: инструмент `get_task_history` (scope `read`, `TOOL_SCOPES`) в `src/modules/agent-mcp/tools/read-tools.ts`: последние N (до 50) записей текстом через `describeHistoryEntry`. `get_task` дополнительно выводит 5 последних записей. Описания инструментов — на английском, как у остальных.
  - Тесты: форматирование вывода MCP в `agent-mcp/models/format.test.ts` (если форматтер вынесен туда).
  - Логирование: `debug` в `listTaskHistory` (`{ workspaceId, taskId, count, all }`); MCP пишет в журнал через существующий `runTool`.

### Phase 2: Метки

- [x] **Task 4: Схема, модель и сервис меток** (зависит от 2)
  - `prisma/schema.prisma`: `TaskLabel` (`id uuid(7)`, `workspaceId`, `name`, `color` — ключ палитры из `projects` (`STATUS_COLORS` или аналог), `createdAt`; `@@unique([workspaceId, name])`, `@@unique([id, workspaceId])`) и `TaskLabelAssignment` (`taskId`, `labelId`, `workspaceId`; составные FK на `Task` и `TaskLabel` с каскадом; `@@id([taskId, labelId])`, `@@index([workspaceId, labelId])`). Миграция `add_task_labels`.
  - `src/modules/tasks/models/task-label.ts`: `normalizeLabelName` (trim, сжатие пробелов, 1–32 символа), сравнение без учёта регистра, `TASK_LABELS_PER_TASK = 10`, `TASK_LABELS_PER_WORKSPACE = 100`, `assertCanAssignLabels`, `assertCanCreateLabel`.
  - Срез `src/modules/tasks/slices/label/` (`label.schema.ts`, `label.repository.ts`, `label.service.ts`, `label.actions.ts`, `label.dto.ts`):
    - `listLabels(session, workspaceId)` с числом задач;
    - `createLabel` — любой участник; `updateLabel` / `deleteLabel` — `requireWorkspacePermission(..., 'manageProjects')`;
    - `setTaskLabels(session, { workspaceId, taskId, labelIds })` в транзакции: проверка, что метки из этого пространства, запись истории `labels` (`{ added: [{id,name}], removed: [...] }`).
  - Экспорт из `index.ts` / `client.ts`: actions, `listLabels`, `setTaskLabels`, типы.
  - Тесты: `task-label.test.ts`, `label.service.test.ts` (чужое пространство → `NOT_FOUND`, лимиты, право на удаление, история).
  - Логирование: `info` `[label] created/updated/deleted` (`{ workspaceId, labelId, userId }`), `[task] labels set` (`{ added, removed }`); `warn` при отказах.

- [x] **Task 5: Метки в задаче, на доске, в списке и в настройках** (зависит от 4)
  - `src/components/tasks/labels/`:
    - `label-chip.tsx` — точка цвета и имя; цвет через токены палитры, в тёмной теме читаемо;
    - `task-labels-editor.tsx` — Popover + Command: поиск, отметка, «Создать „…“», сохранение через `setTaskLabelsAction` с индикатором `TaskSaveStatus`.
  - `task-details-view.tsx`: свойство «Метки» в `TaskPropertyList`.
  - Карточка доски (`task-card.tsx`) — до 3 меток и «+N»; `getBoardCards` возвращает метки одним запросом на колонку (без N+1).
  - Список: колонка «Метки» в `task-list-table.tsx`; фильтр `labels` в `TaskListQuery` (`models/task-list-query.ts`: разбор из URL, `TASK_LIST_MAX_VALUES`), в `task-list.prisma.ts` (`labels: { some: { labelId: { in } } }`), в `task-list-filter.tsx` / `task-list-toolbar.tsx`.
  - Страница `src/app/(app)/w/[workspaceSlug]/settings/labels/page.tsx` и пункт в навигации настроек: таблица меток (имя, цвет, число задач) с правкой и удалением через `ConfirmActionDialog`; без права — только просмотр.
  - Тесты: разбор `labels` в `task-list-query.test.ts`.
  - Логирование: не требуется в компонентах (`console.*` запрещён); серверная часть уже логирует в Task 4.

- [x] **Task 6: Метки в MCP** (зависит от 4)
  - `get_workspace_context` выводит метки пространства; `get_task` и `list_tasks` показывают метки задачи; `list_tasks` получает фильтр `labels` (имена).
  - `update_task` получает `labels?: string[]` — полный набор по именам (регистр не важен), неизвестные имена создаются, как у `set_document_tags` (проверить его поведение и сделать так же). Выбор меток — чистая функция в `agent-mcp/models/catalog.ts`.
  - Журнал: `activity.summary` «Поставил метки TSK-42: bug, ui».
  - Тесты: чистая функция сопоставления имён.
  - Логирование: `info` `[mcp.update_task] labels` (`{ taskId, count, created }`).

### Phase 3: Наблюдатели

- [x] **Task 7: Наблюдатели: схема, сервис, автоподписка, кнопка** (зависит от 2)
  - `prisma/schema.prisma`: `TaskWatcher` (`taskId`, `userId`, `workspaceId`, `createdAt`; `@@id([taskId, userId])`, `@@index([workspaceId, userId])`; FK на `Task` (составной, каскад) и `User` (каскад)). В миграции `add_task_watchers`: заполнить наблюдателей из существующих задач (автор и ответственный) и создать триггер на удаление `WorkspaceMember`, удаляющий `TaskWatcher` пользователя в этом пространстве (по образцу триггера ответственного из `add_tasks`).
  - Срез `src/modules/tasks/slices/watcher/`: `watchTask` / `unwatchTask` (сам себя, только участник), `listTaskWatchers` (DTO с именами и аватарами), внутренний `ensureWatchers(tx, workspaceId, taskId, userIds)` (`createMany` + `skipDuplicates`). Агентов (`User.isAgent`) не подписывать: им уведомления маршрутизирует `agent-routing`.
  - Автоподписка: `createTask` (автор и ответственный), `updateTask` (новый ответственный), `createComment` (автор и упомянутые).
  - UI: кнопка «Следить / Вы следите» с иконкой и числом наблюдателей в `task-toolbar.tsx`; по клику — Popover со списком наблюдателей.
  - Тесты: `watcher.service.test.ts` (неучастник → `NOT_FOUND`, повторная подписка идемпотентна, агенты отсекаются).
  - Логирование: `info` `[watcher] watch/unwatch` (`{ workspaceId, taskId, userId }`), `debug` `[watcher] ensured` (`{ taskId, added }`).

- [x] **Task 8: Уведомления наблюдателям** (зависит от 7)
  - `notifications`: тип `task_status_changed` в конец `NOTIFICATION_TYPES` и enum `NotificationType` (миграция `add_watcher_notifications`; эту и следующие миграции enum делать через `ALTER TYPE ... ADD VALUE`). Payload — `taskRef` + `projectName`, `fromStatus`, `toStatus`. Добавить текст и ссылку в моделях уведомлений, письмо в `notification.mail.ts`, строку в настройках (по умолчанию `inApp: true, email: false`). У `task_comment` поменять подпись на «Комментарии к задачам, за которыми вы следите».
  - `comment.service.ts`: `watchers` для `resolveCommentRecipients` берутся из `TaskWatcher` (функция репозитория наблюдателей), а не из `[assigneeId, createdById]`.
  - `placement.service.ts`: после фиксации смены статуса (пользователь, агент, GitHub) — `notify` наблюдателям, кроме автора действия (для системы автор `null` — уведомляются все).
  - Тесты: `notification-type`/`payload` (новая схема), `comment-mentions.test.ts` не меняется; сервисный тест получателей статуса.
  - Логирование: `debug` `[placement] watchers notified` (`{ taskId, recipients }`); `notify` не бросает, его ошибки логируются внутри модуля.

### Phase 4: Архив вместо удаления

- [x] **Task 9: Архив задач: схема, модель, сервис** (зависит от 2, 7)
  - `prisma/schema.prisma`: у `Task` поля `archivedAt DateTime?` и `archivedById String?` (`User`, SetNull), индекс `@@index([workspaceId, archivedAt])`. Миграция `add_archive` (в неё же войдут поля Task 10 и 11, если делать задачи подряд; иначе отдельные миграции).
  - `models/task.ts`: `assertNotArchived(task)` (`ValidationError` «Задача в архиве — восстановите её, чтобы изменить»), `assertCanDeletePermanently(task, actor)` = архивная + `canDeleteTask`.
  - `task.service.ts`: `archiveTask` / `restoreTask` — всё поддерево (`subtaskRepository.subtreeIds`) одним `updateMany` с общим `archivedAt`, восстановление — задачи с тем же `archivedAt` в поддереве. История `archived` / `restored` у корневой задачи. Отвязать задачу от архивного родителя нельзя, пока не восстановлена. `deleteTask` разрешён только для архивной задачи.
  - Защита от изменений: `updateTask`, `setTaskLabels`, `addToProject`, `changeStatus`, `movePlacement`, `removeFromProject`, `setTaskParent`, `createComment`, загрузка вложений проверяют `assertNotArchived`. `changePlacementStatusBySystem` архивные задачи пропускает (возвращает `false`, `debug`-лог), `listPlacementsForAutomation` их не возвращает.
  - Чтения: `getBoardCards`, `listTasks`, `listProjectTasks`, `getMemberTaskSummary`, `getTaskSummaries`, `searchParentCandidates`, поиск задач для связи с документами — `archivedAt: null` по умолчанию. `TaskListQuery` получает `archived: boolean` (URL `archived=1`) — показать только архивные. `TaskDto` получает `archivedAt`, `archivedBy`, `canDeletePermanently`.
  - Actions: `archiveTaskAction`, `restoreTaskAction`; `deleteTaskAction` становится «удалить навсегда».
  - Тесты: модель (`assertNotArchived`, права удаления), сервис (поддерево архивируется и восстанавливается целиком, изменение архивной → `VALIDATION`, система пропускает архивную).
  - Логирование: `info` `[task] archived/restored` (`{ workspaceId, taskId, descendants, userId }`), `warn` при попытке изменить архивную.

- [x] **Task 10: Архив проектов** (зависит от 9)
  - `Project.archivedAt DateTime?` и `archivedById`. Модель `projects`: `assertProjectNotArchived`; `deleteProject` — только архивный.
  - `project.service.ts`: `archiveProject` / `restoreProject` (`manageProjects`). Статусы и настройки архивного проекта не меняются. `listProjects` получает параметр `{ archived?: boolean }` (по умолчанию активные); `listWorkspaceStatuses` возвращает только активные проекты, чтобы архивный не предлагался в «Добавить в проект».
  - `tasks`: `addToProject`/`changeStatus`/`movePlacement` в архивный проект → `VALIDATION`. Карточки размещений в задаче показывают пометку «архив» у проекта. Фильтр проектов в списке не предлагает архивные.
  - Тесты: сервис проекта (права, удаление только архивного), placement (архивный проект отклоняется).
  - Логирование: `info` `[project] archived/restored`, `warn` при попытке изменить архивный.

- [x] **Task 11: Архив пространств** (зависит от 10)
  - `src/shared/auth/auth.ts`: `archivedAt` в `additionalFields` организации (`type: 'date'`, `input: false`), колонка в `Workspace` (та же миграция, что и Task 9/10, или `add_workspace_archive`).
  - `src/shared/access`: `requireWorkspaceAccess(..., { allowArchived?: boolean })` и `requireWorkspaceAccessBySlug` — для архивного пространства `NOT_FOUND`, кроме `allowArchived` у владельца. В `access` добавить флаг `archived`.
  - `workspace.service.ts`: `archiveWorkspace` / `restoreWorkspace` (владелец, подтверждение названием, как при удалении); `deleteWorkspace` — только архивное. `listMyWorkspaces` разделяет активные и архивные; переключатель показывает только активные.
  - Периферия: `authenticateApiToken` (или первый `requireWorkspaceAccess` в MCP) отказывает для архивного пространства; `findWorkspacesByTaskKeys` (GitHub) архивные пропускает; напоминания (Task 15) — тоже.
  - Тесты: `shared/access` (архивное → `NOT_FOUND`, `allowArchived` только владельцу), сервис пространства.
  - Логирование: `info` `[workspace] archived/restored`, `debug` `[access] archived workspace denied` (`{ workspaceId, userId }`).

- [x] **Task 12: Архив в интерфейсе** (зависит от 9, 10, 11)
  - Задача: в меню `task-toolbar.tsx` вместо «Удалить» — «В архив» (с подзадачами — подтверждение с числом `descendantCount`). У архивной задачи — баннер «В архиве с … (кто)», кнопки «Восстановить» и «Удалить навсегда» (`ConfirmActionDialog`), поля в режиме чтения (`task-fields.tsx`), форма комментария скрыта.
  - Список: переключатель «Архив» в `task-list-toolbar.tsx` (`archived=1`) с понятным пустым состоянием.
  - Проект: в `projects/[projectId]/settings` раздел «Архив» (`SettingsSection`) с архивированием и восстановлением, удаление переносится туда же и доступно только архивному. Доска архивного проекта — баннер, без перетаскивания и быстрого создания. На обзоре пространства — свёрнутый блок «Архивные проекты».
  - Пространство: в `settings` — «Архивировать пространство» перед опасной зоной. На главной `src/app/(app)/page.tsx` — раздел «Архивные пространства» с «Восстановить» и «Удалить навсегда». Страница пространства в архиве у владельца ведёт в настройки с баннером.
  - MCP: `list_tasks` скрывает архивные (параметр `includeArchived`), `get_task` показывает архивность; новые инструменты `archive_task` / `restore_task` (scope `tasks`).
  - Проверка: скриншоты Playwright на 1440 и 375 px — задача в архиве, список с фильтром «Архив», настройки проекта.
  - Логирование: только серверные части (уже в Task 9–11); MCP-инструменты пишут журнал через `runTool`.

### Phase 5: Глобальный поиск и палитра Cmd+K

- [x] **Task 13: Модуль `search` и индексы** (зависит от 9, 11)
  - Миграция `add_search_indexes`: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` и GIN-индексы `gin_trgm_ops` на `"Task"(title)` и `"Document"(title)` (имена таблиц сверить со схемой).
  - `tasks`: `searchTasks(session, workspaceId, q, limit)` — разбор ключа/номера (переиспользовать разбор `q` из `task-list-query`), иначе `title ILIKE` без архивных; DTO `{ number, key, title, statusSummary, archived: false }`.
  - `documents`: `searchDocuments(session, workspaceId, q, limit)` (без файлов-«сирот», только этого пространства).
  - `workspaces`: участники — `listMembers` + фильтр по имени и email (`filterMentionCandidates` или аналог).
  - Новый модуль `src/modules/search/`: `models/search-query.ts` (нормализация, минимальная длина 2 кроме ключа/номера, `SEARCH_LIMIT_PER_GROUP = 5`), `slices/global/global.service.ts` (`globalSearch(session, { workspaceSlug?, q })` — параллельно три группы, только текущее пространство; без пространства — пространства пользователя по названию), `global.actions.ts` (`globalSearchAction`, rate limit не нужен — обычная сессия), `index.ts`, `client.ts`. Границы ESLint: добавить модуль в `eslint.config.mjs` по образцу `agent-mcp` (зависит от `tasks`, `documents`, `workspaces`; от него никто).
  - Тесты: `search-query.test.ts`, `global.service.test.ts` (чужое пространство → пусто/`NOT_FOUND`, архивные не находятся, лимиты групп).
  - Логирование: `debug` `[search] query` (`{ workspaceId, qLength, results }` — сам текст запроса не логировать).

- [x] **Task 14: Палитра Cmd+K** (зависит от 13)
  - `src/components/search/command-palette.tsx` (клиентский): `CommandDialog` из `components/ui/command.tsx`, хоткей Cmd/Ctrl+K (не перехватывать в полях ввода, кроме самого хоткея), запрос с задержкой 200 мс и отменой устаревших ответов, группы «Задачи», «Документы», «Участники», «Пространства» и «Команды»: «Новая задача» (`?task=new`), «Задачи», «Документы», «Настройки». Переход задачи — панель `?task=<номер>` на текущей странице пространства (`task-panel-href.ts`), документа — `/docs/[id]`, участника — `/members/[userId]`.
  - `src/components/search/search-trigger.tsx`: кнопка в шапке `src/app/(app)/layout.tsx` рядом с колокольчиком — «Поиск… ⌘K» на десктопе, иконка на мобильном; `aria-keyshortcuts`.
  - Доступность: фокус возвращается на триггер, `aria-label` у диалога, пустое и загрузочное состояние.
  - Проверка: скриншоты Playwright (палитра открыта с результатами, 1440 и 375 px), ручная проверка хоткея на Windows (Ctrl+K).
  - Логирование: не требуется (клиент).

### Phase 6: Напоминания о сроке

- [x] **Task 15: Модель и сервис напоминаний** (зависит от 7, 9, 11)
  - `prisma/schema.prisma`: enum `TaskReminderKind` (`due_soon`, `overdue`) и `TaskDueReminder` (`id`, `workspaceId`, `taskId` с каскадом, `kind`, `dueDate DATE`, `sentAt`; `@@unique([taskId, kind, dueDate])`). `notifications`: типы `task_due_soon` и `task_overdue` в конец списка и enum (payload — `taskRef` + `dueDate`; тексты, письма, настройки: `due_soon` — `inApp` и `email` вкл., `overdue` — `inApp` вкл., `email` вкл.). Миграция `add_due_reminders`.
  - `src/modules/tasks/models/due-reminders.ts`: `reminderDates(now, timeZone)` → `{ today, tomorrow }` (ISO в часовом поясе), `pickReminderRecipients(kind, task, watchers)` (агенты отдаются как есть — их маршрутизирует `notifications`).
  - Срез `src/modules/tasks/slices/reminder/`: `sendDueReminders({ now })` — системная функция без сессии, только для route handler с проверенным секретом. Порциями по 200: задачи со сроком `tomorrow` (`due_soon`) и `< today` (`overdue`), не архивные, в неархивных пространствах, с ответственным, хотя бы одно размещение не `done`/`cancelled` или без размещений. Для каждой — `createMany skipDuplicates` в `TaskDueReminder`, уведомляются только реально вставленные (повторный запуск ничего не шлёт). Возвращает `{ dueSoon, overdue, skipped }`.
  - `src/shared/env`: `CRON_SECRET` (необязательный, ≥ 32 символа) и `REMINDERS_TIMEZONE` (по умолчанию `Europe/Moscow`, проверка через `Intl.DateTimeFormat`); `.env.example`, `deploy/tasker/.env.example`, `deploy/tasker/compose.yml` (`environment` у `app`).
  - Тесты: `due-reminders.test.ts` (границы суток в часовом поясе, получатели), `reminder.service.test.ts` (идемпотентность, исключения архивных и закрытых).
  - Логирование: `info` `[reminders] run finished` (`{ dueSoon, overdue, skipped, ms }`), `debug` по порциям, `error` при сбое порции (без прерывания остальных).

- [x] **Task 16: Эндпоинт и расписание** (зависит от 15)
  - `src/app/api/cron/reminders/route.ts`: `POST`, `export const dynamic`/runtime по правилам Next.js 16 (сверить с `node_modules/next/dist/docs/`); без `CRON_SECRET` → 404; проверка `Authorization: Bearer` через `crypto.timingSafeEqual` → 401; вызов `sendDueReminders` → JSON со счётчиками; ошибки через `toErrorResponse`. Добавить путь в исключения `src/proxy.ts`, если он редиректит `/api/*` без сессии (проверить).
  - `deploy/tasker/systemd/tasker-reminders.service` и `tasker-reminders.timer` (`OnCalendar=*-*-* 09:00:00 Europe/Moscow`, `Persistent=true`): `docker compose -f /opt/tasker/compose.yml exec -T app wget -qO- --post-data='' --header="Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/reminders` (секрет из `/opt/tasker/.env` через `EnvironmentFile`). Установка таймера — в `deploy/bootstrap-server.sh` рядом с таймерами бэкапов.
  - Локальный запуск: скрипт `pnpm reminders:run` (curl к `localhost:3000` с секретом из `.env`) — или только команда в документации.
  - Тесты: `route.test.ts` (нет секрета → 404, неверный → 401, верный → вызывает сервис).
  - Логирование: `warn` `[cron.reminders] unauthorized` (без значения заголовка), `info` — результат из сервиса.

### Phase 7: Документация

- [x] **Task 17: Docs-чекпоинт** (зависит от всех)
  Через `/aif-docs`:
  - `docs/architecture.md` — история (снимки, слияние, транзакция), метки, наблюдатели и новые уведомления, архив (задачи, проекты, пространства и `allowArchived`), модуль `search` и его границы, напоминания.
  - `docs/agents.md` — `get_task_history`, `archive_task`/`restore_task`, `labels` в `update_task`/`list_tasks`, архивные задачи в `list_tasks`.
  - `docs/configuration.md` — `CRON_SECRET`, `REMINDERS_TIMEZONE`.
  - `docs/production.md` — таймер `tasker-reminders`, проверка вручную.
  - `AGENTS.md` — новые модели в схеме, срезы `history`/`label`/`watcher`/`reminder`, модуль `search`, `components/search`, `components/tasks/{history,labels}`, `/api/cron/reminders`, `settings/labels`.
  - `.ai-factory/ROADMAP.md` — отметить 6 выполненных пунктов этапа.
  - `.ai-factory/ARCHITECTURE.md` — модуль `search` в структуре и правилах зависимостей, исключение `allowArchived` в разделе авторизации.
  Логирование: не требуется.
