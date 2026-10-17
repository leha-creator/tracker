# План реализации: удобство работы (реалтайм, горячие клавиши, сохранённые фильтры и «Мои задачи», дашборд и экспорт CSV)

Branch: none (`git.create_branches: false`, работа в текущей ветке)
Created: 2026-10-17

## Settings
- Testing: yes, тесты только для логики. Vitest (`environment: node`) для чистых моделей: схема и фильтр событий реалтайма, сопоставление горячих клавиш и последовательностей, разбор и сериализация запроса `mine`, ограничения сохранённых фильтров, агрегаты дашборда, экранирование CSV. Сервисы тестируются по образцу `task.service.test.ts`: моки репозиториев и `prisma`. Вёрстку проверять скриншотами Playwright на 1440 и 375 px.
- Logging: verbose. Только через `createLogger(scope)`, `console.*` запрещён. Уровни:
  - `debug` — старт сервисных функций с размерами выборок, каждое опубликованное и доставленное событие реалтайма (тип, `workspaceId`, число подписчиков), открытие и закрытие SSE-соединения;
  - `info` — изменения (фильтр сохранён или удалён, экспорт на N строк, LISTEN-клиент подключён или переподключён);
  - `warn` — отказы (нет доступа, превышен лимит соединений или экспортов) и сбои публикации, которые не роняют основной сценарий;
  - `error` — потеря LISTEN-клиента после всех повторов.
  В логи не попадают cookie, тексты задач и комментариев, содержимое CSV.
- Docs: yes. Обязательный docs-чекпоинт в конце (`/aif-docs`): `docs/architecture.md`, `docs/configuration.md`, `docs/production.md`, `AGENTS.md`, `.ai-factory/ROADMAP.md`.

## Roadmap Linkage
Milestone: "Удобство работы"
Rationale: План закрывает 4 из 5 пунктов этапа: реалтайм (SSE), сохранённые фильтры и «Мои задачи», горячие клавиши, дашборд. Из пятого пункта делается только экспорт в CSV, импорт из Trello и Jira переносится в следующий план.

## Принятые решения (поправьте до `/aif-implement`, если не согласны)

1. **Реалтайм через SSE и Postgres `LISTEN/NOTIFY`.**
   - Сервис публикует событие после коммита транзакции: `SELECT pg_notify('tasker_events', json)` через `prisma`. Публикация никогда не бросает исключение: при ошибке пишется `warn`, основной сценарий продолжается.
   - В каждом процессе один выделенный `pg.Client` (пакет `pg` 8.23.1 уже в зависимостях) делает `LISTEN` и раздаёт события подписчикам в памяти по `workspaceId`. Сейчас в проде один экземпляр `app`, но такая схема без изменений работает и с несколькими экземплярами. Сюда же автоматически попадают изменения из MCP и вебхуков GitHub: они вызывают те же сервисы.
   - В событии нет текстов, только идентификаторы: `{ v: 1, workspaceId, kind, taskId, taskNumber, projectIds, actorId, at }`. Клиент получает сигнал и делает `router.refresh()`, данные приходят через обычные проверки доступа. Поэтому SSE-канал не может раскрыть содержимое задач.
   - Эндпоинт: `GET /api/realtime/w/[workspaceSlug]`. Сессия берётся из cookie, доступ проверяет `requireWorkspaceAccess`. Каждые 25 с отправляется heartbeat, раз в 5 минут доступ проверяется заново (при потере — `event: revoked` и закрытие). Не больше 6 соединений на пользователя в процессе, сверх лимита — `429`. Клиенту передаётся `retry: 5000`.
   - На клиенте одно `EventSource` на вкладку через `RealtimeProvider` в layout пространства. После переподключения или при возврате на скрытую вкладку, если за это время приходили события, выполняется один `refresh`.
   - Уведомления (колокольчик) остаются на опросе: они привязаны к пользователю, а канал — к пространству.
2. **Горячие клавиши.** Сравнение идёт по `event.code`, а не по `key`, как у Cmd+K: в русской раскладке `key` возвращает кириллицу. Клавиши без модификаторов не срабатывают в полях ввода, `contenteditable` и открытых диалогах. Набор:
   - глобально в пространстве: `?` — справка, `c` — новая задача (`?task=new`), `/` — фокус в поиск списка, `g` затем `o`/`p`/`t`/`d`/`m` — Обзор / Проекты / Задачи / Документы / Мои задачи (окно 1 с);
   - на доске: стрелки переводят фокус между карточками и колонками (roving focus), `Enter` открывает задачу. `Space` остаётся за перетаскиванием dnd-kit;
   - в панели задачи: `j`/`k` — следующая или предыдущая задача в порядке текущей доски или списка, `i` — назначить на себя, `s`/`p`/`d`/`l`/`a` — открыть поле статуса / приоритета / срока / меток / ответственного, `w` — следить или не следить, `Esc` — закрыть (уже работает).
3. **Сохранённые фильтры** — личные, общих нет. Модель `SavedTaskView`: имя и канонизированная строка параметров (`serializeTaskListParams`), область видимости `workspace` / `project` / `mine`. Не больше 20 фильтров на одну область. Устаревшие id (удалённая метка или проект) не чистятся: парсер их пропускает, выборка по ним просто пустая. При выходе из пространства фильтры удаляются триггером БД, так же как наблюдатели.
4. **«Мои задачи»** — страница `/my-tasks` вне пространства. Показывает задачи, где я ответственный, из всех неархивных пространств, где я участник. Это новая область `mine` в `TaskListQuery`: фильтры по пространству, категории статуса, приоритету и сроку, сортировка по умолчанию — по сроку. Ссылка ведёт в задачу внутри её пространства. Вход на страницу — из меню пользователя, с главной, по `g m` и командой в Cmd+K.
5. **Дашборд** — новый раздел «Обзор» `/w/[slug]/overview`, первая вкладка навигации пространства. Страница пространства (список проектов) не меняется. «Открытая задача» определяется так же, как в напоминаниях: размещений нет или есть размещение в статусе не категории `done`. Архивные задачи и проекты не учитываются. Блоки:
   - счётчики: открыто, просрочено, срок на 7 дней, без ответственного, закрыто за 7 дней;
   - нагрузка по участникам: открытые и просроченные задачи, агенты помечены значком;
   - разбивка по проектам;
   - 10 ближайших просроченных задач.
   Каждая цифра ведёт в отфильтрованный список `/tasks`. Полосы рисуются на CSS, без библиотеки графиков; перед вёрсткой загрузить скилл `dataviz`. Дашборд обновляется по событиям реалтайма.
6. **Экспорт CSV:** `GET /api/w/[workspaceSlug]/tasks/export?<параметры списка>[&project=<id>]` отдаёт те же фильтры и сортировку, что и список, без пагинации, не больше 10 000 строк. Формат: UTF-8 с BOM, разделитель `;` для Excel в русской локали, экранирование RFC 4180. Значения, начинающиеся с `= + - @ \t \r`, получают префикс `'` (защита от CSV/formula injection). Лимит `tasks.export` — 10 экспортов в минуту на пользователя через `enforceRateLimit`. Кнопка «Экспорт CSV» стоит в тулбаре списка пространства и проекта.

## Commit Plan
- **Commit 1** (после задач 1–4): `feat(realtime): live board, task panel and comments via SSE and LISTEN/NOTIFY`
- **Commit 2** (после задач 5–7): `feat(ui): keyboard shortcuts for navigation, board and task panel`
- **Commit 3** (после задач 8–10): `feat(tasks): saved list filters and cross-workspace "My tasks"`
- **Commit 4** (после задач 11–13): `feat(tasks): workspace overview dashboard and CSV export`
- **Commit 5** (после задачи 14): `docs: work convenience features`

## Tasks

### Phase 1: Обновления в реальном времени

- [x] **Task 1: Инфраструктура событий `shared/realtime`**
  - `src/shared/realtime/realtime-event.ts` (чистый TS): Zod-схема события `{ v: 1, workspaceId, kind, taskId?, taskNumber?, projectIds: string[], actorId: string | null, at }`. `kind`: `task.created`, `task.updated`, `task.archived`, `placement.changed`, `comment.changed`, `attachment.changed`, `resync`. Функции:
    - `encodeRealtimeEvent(event)` — проверяет лимит в 7 500 байт; если превышен, обрезает `projectIds` и ставит флаг `truncated`;
    - `parseRealtimeEvent(raw)` → событие или `null`;
    - `REALTIME_CHANNEL = 'tasker_events'`.
  - `src/shared/realtime/publish.ts` (`server-only`): `publishRealtimeEvent(event)` выполняет `prisma.$executeRaw` с `pg_notify`. Ошибки перехватываются, бросков нет.
  - `src/shared/realtime/listener.ts` (`server-only`): синглтон на `globalThis`, чтобы переживать HMR. Ленивый `pg.Client` из `DATABASE_URL` (`getEnv()`). `subscribe(workspaceId, listener)` возвращает функцию отписки. При обрыве — переподключение с экспоненциальной задержкой от 1 до 30 с, после восстановления всем подписчикам рассылается `resync`. Когда подписчиков не осталось, клиент закрывается через 60 с.
  - `src/shared/realtime/index.ts` — публичный API. Если для `shared/*` есть правила границ, добавить их в `eslint.config.mjs`.
  - Тесты: `realtime-event.test.ts` (кодирование, разбор мусора, обрезка по лимиту); `listener.test.ts` с моком `pg.Client` (раздача по `workspaceId`, отписка, `resync` после переподключения).
  - Логирование: scope `realtime`. `debug` `[realtime] published` / `[realtime] dispatched` (`{ kind, workspaceId, subscribers }`); `info` `[realtime] listener connected/reconnected`; `warn` `[realtime] publish failed` / `[realtime] listener lost, retry in Nms`; `error` — после 10 неудачных попыток подряд, попытки при этом продолжаются.

- [x] **Task 2: Публикация событий из модуля `tasks`** (зависит от 1)
  - `src/modules/tasks/slices/realtime/task-events.ts`: `emitTaskEvent(actor, { workspaceId, kind, task: { id, number }, projectIds })`. `actorId` берётся из сессии, для системных изменений (GitHub) — `null`. Вызывается **после** `await prisma.$transaction(...)`, внутри транзакций не вызывается.
  - Точки вызова:
    - `task.service.ts`: `createTask`, `updateTask`, `archiveTask`, `restoreTask`, удаление навсегда;
    - `placement.service.ts`: `addToProject`, `removeFromProject`, `movePlacement`, `changeStatus` и `changePlacementStatusBySystem` (`projectIds` — затронутый проект);
    - `subtask.service.ts`: `setTaskParent` и вывод подзадачи на доску;
    - `label.service.ts`: `setTaskLabels`. Правка или удаление метки в настройках шлёт `resync` пространству: меняются карточки всех задач с этой меткой;
    - `comment.service.ts`: создание, правка, удаление → `comment.changed`;
    - `attachment.service.ts`: подтверждение и удаление → `attachment.changed`;
    - `watcher.service.ts` не публикует: наблюдатели на доску не влияют.
  - `projectIds` для `task.updated` — все проекты, где размещена задача (берутся из уже загруженных данных или одним запросом `placementRepository`).
  - Тесты: дописать `task.service.test.ts`, `placement.service.test.ts`, `comment.service.test.ts` — событие публикуется с нужными `kind` и `projectIds`, при откате транзакции не публикуется, сбой `publishRealtimeEvent` не ломает сценарий. `publishRealtimeEvent` мокается.
  - Логирование: `debug` `[task.events] emit` (`{ kind, workspaceId, taskId, projects: projectIds.length }`).

- [x] **Task 3: SSE-эндпоинт и прокси** (зависит от 1)
  - Перед кодом прочитать `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (Streaming) и `02-guides/streaming.md`. В проекте включены Cache Components: убедиться, что route handler динамический без `export const dynamic`, если эта опция несовместима.
  - `src/app/api/realtime/w/[workspaceSlug]/route.ts` — тонкий слой, логика в `src/shared/realtime/sse.ts`:
    - `GET`: `getSession()` (без сессии `401`), workspace по slug и `requireWorkspaceAccess` (нет доступа или архив — `404`), лимит 6 соединений на `userId` (иначе `429`);
    - ответ — `ReadableStream`, заголовки `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, `Connection: keep-alive`;
    - первым идёт `retry: 5000` и `event: ready`, затем события `subscribe(workspaceId)` в формате `event: task\ndata: {...}\n\n`, каждые 25 с — `: ping`;
    - раз в 5 минут доступ проверяется заново, при потере отправляется `event: revoked` и поток закрывается;
    - `request.signal` `abort` снимает подписку, таймеры и счётчик соединений.
  - Добавить функцию разрешения slug, если её ещё нет в публичном API `workspaces`. В route handler нельзя вызывать `requireWorkspaceAccessBySlug`: он делает redirect.
  - `deploy/tasker/tracker.caddy`: отдельный `handle @realtime path /api/realtime/*` с `reverse_proxy tasker-app:3000 { flush_interval -1 }` **без** `encode` (gzip буферизует поток). Блок ставится перед общим `handle`.
  - `src/proxy.ts` не трогать: `api` уже исключён из matcher.
  - Тесты: `sse.test.ts` — форматирование кадров (`formatSseEvent`, `formatSseComment`), счётчик соединений (лимит, освобождение при abort).
  - Логирование: `debug` `[realtime.sse] open/close` (`{ workspaceId, userId, durationMs, connections }`); `warn` `[realtime.sse] rejected` (`{ reason: 'unauthorized' | 'forbidden' | 'too_many' }`), `[realtime.sse] revoked`.

- [x] **Task 4: Клиент: доска, панель, комментарии, список** (зависит от 2, 3)
  - `src/components/realtime/realtime-provider.tsx` (client): одно `EventSource` на `/api/realtime/w/${slug}`, подписчики в контексте, `useWorkspaceEvents(filter, onEvent)`. Если соединение закрылось навсегда (`readyState === CLOSED` после `401/403/404`), повторов нет. Пока вкладка скрыта, события копятся флагом, при `visibilitychange → visible` выполняется один вызов. После `ready`, идущего за переподключением, — один `refresh`.
  - `src/components/realtime/use-live-refresh.ts`: хелпер `useLiveRefresh(filter, { debounceMs })` → `router.refresh()` с debounce (по умолчанию 400 мс), пока не выставлена пауза.
  - Подключение `RealtimeProvider` в `src/app/(app)/w/[workspaceSlug]/layout.tsx`.
  - `kanban-board.tsx`: обновление по событиям, где `projectIds` содержит `projectId`, или по `resync`. Во время перетаскивания (`activeId !== null`) и до ответа `movePlacementAction` `refresh` откладывается и выполняется после броска. Подменой данных уже занимается логика `serverCards`.
  - Панель и страница задачи (`task-details-view.tsx` / `task-panel.tsx`): клиентский компонент-слушатель обновляет страницу по событиям с `taskId` открытой задачи (поля, история, комментарии, вложения). Набираемый комментарий не теряется: `comment-form` хранит состояние локально — проверить вручную.
  - Списки (`/tasks`, вкладка «Список» проекта): обновление по любому `task.*` / `placement.changed` пространства (или проекта) с debounce 1 000 мс.
  - Тесты: `realtime-filter.test.ts` для чистой функции `matchesRealtimeFilter(event, filter)` (по проекту, по задаче, `resync` подходит всем).
  - Логирование: на клиенте `console.*` запрещён, логов нет. Ошибки `EventSource` обрабатываются тихо.

### Phase 2: Горячие клавиши

- [x] **Task 5: Ядро горячих клавиш и справка**
  - `src/lib/hotkeys.ts` (чистый TS):
    - `parseShortcut('g t' | 'shift+/' | 'j')`;
    - `matchShortcut(event, shortcut, state)` по `event.code` с учётом модификаторов;
    - машина последовательностей (`createSequenceState`, окно `SEQUENCE_TIMEOUT_MS = 1000`);
    - `isEditableTarget(target)` (input, textarea, select, `contenteditable`, `[role="combobox"]`).
  - `src/lib/use-hotkeys.ts`: `useHotkeys(bindings, { enabled })`, один `keydown` на `document`. Пропускает `event.defaultPrevented`, `isComposing`, редактируемые цели (для клавиш без модификаторов) и открытые `[role="dialog"]` (кроме биндингов с `allowInDialog`).
  - `src/components/hotkeys/shortcuts.ts`: каталог `{ id, keys, label, group }` для справки и подсказок (`title`/`aria-keyshortcuts`).
  - `src/components/hotkeys/shortcuts-dialog.tsx`: `?` открывает диалог (shadcn `Dialog`) с таблицей по группам. Пункт «Горячие клавиши» добавляется в меню пользователя.
  - Тесты: `src/lib/hotkeys.test.ts` — русская раскладка (`code: 'KeyT'`, `key: 'е'`), последовательность `g t`, таймаут, модификаторы, редактируемые цели.
  - Логирование: не требуется (клиент, чистые функции).

- [x] **Task 6: Глобальные клавиши и навигация по доске** (зависит от 5)
  - `src/components/hotkeys/workspace-hotkeys.tsx` (client, в layout пространства): `c` → `taskPanelHref(pathname, search, 'new')`; `/` → фокус на `[data-list-search]` (атрибут добавить в поле поиска `task-list-toolbar.tsx`); `g o/p/t/d` → разделы пространства; `g m` → `/my-tasks` (страница появится в задаче 10, до этого биндинг выключен). В layout приложения вне пространства работают `?` и `g m`.
  - `kanban-board.tsx`: roving focus по карточкам. Стрелки вверх и вниз — внутри колонки, влево и вправо — соседняя колонка с ближайшим индексом (чистая функция `nextBoardFocus(columns, current, direction)` в `src/modules/tasks/models/board-move.ts` или рядом). Поведение dnd-kit `KeyboardSensor` не ломается: во время перетаскивания стрелки остаются за dnd-kit. Анонсы для скринридеров сохраняются.
  - Тесты: `nextBoardFocus` — пустые колонки, края, перенос индекса.
  - Логирование: не требуется.

- [x] **Task 7: Клавиши в панели задачи** (зависит от 5, 6)
  - `src/components/tasks/task-navigation-context.tsx`: доска и список регистрируют упорядоченный массив номеров задач. Панель через `j`/`k` переходит к соседней (`taskPanelHref`). На границе — без перехода и с коротким `toast`.
  - `src/components/tasks/task-panel/task-panel-hotkeys.tsx`: `i` — назначить на себя через существующий action обновления задачи; `s`/`p`/`d`/`l`/`a` — открыть соответствующий контрол по атрибуту `data-hotkey-field="status|priority|due|labels|assignee"` (атрибуты добавить в `task-fields.tsx`, `task-placements.tsx` и выбор меток); `w` — переключить наблюдение (`watchers/`). В архивной задаче (только чтение) изменяющие клавиши выключены.
  - В тултипах этих контролов показывается подсказка с клавишей (из каталога `shortcuts.ts`).
  - Тесты: чистая функция `adjacentTaskNumber(order, current, step)`.
  - Логирование: на клиенте нет, сервисы при `i`/`w` логируют как обычно.

### Phase 3: Сохранённые фильтры и «Мои задачи»

- [x] **Task 8: Область `mine` в запросе списка и выборка по всем пространствам**
  - `src/modules/tasks/models/task-list-query.ts`: `TaskListScope` расширяется значением `'mine'`, в `TaskListQuery` добавляется `workspaces: string[]` (только для `mine`). Для `mine` `parse`/`serialize` отбрасывают `statuses`, `projects`, `labels`, `assignees` (ответственный — всегда я). Сортировка по умолчанию — `due asc`, сортировка `status` запрещена. Поправить `defaultTaskListQuery`, `hasActiveFilters`, `clearFilters`.
  - `src/modules/tasks/slices/views/views.queries.ts`: `listMyTasks(session, query)`. Пространства — `listMyWorkspaces(session)` из `workspaces` (неархивные). Условие: `assigneeId = session.user.id`, `archivedAt: null`, `workspaceId IN (...)`, пересечённое с `query.workspaces`; по умолчанию только открытые (общий хелпер `openTaskWhere()`, вынесенный из логики напоминаний в `views`, — переиспользовать в задаче 11). DTO строки дополняется `workspace: { slug, name, icon, taskKey }`.
  - `task-list.prisma.ts`: построение `where`/`orderBy` для `mine`.
  - Тесты: `task-list-query.test.ts` (разбор и сериализация `mine`, отбрасывание чужих фильтров); `task-list.prisma.test.ts` (условие `mine`, пересечение пространств); `views.queries.test.ts` (чужое пространство из URL игнорируется).
  - Логирование: `debug` `[tasks.views] listMyTasks` (`{ userId, workspaces: n, total, page }`).

- [x] **Task 9: Сохранённые фильтры: схема и сервис** (зависит от 8)
  - `prisma/schema.prisma`: enum `SavedTaskViewScope` (`workspace`, `project`, `mine`) и модель `SavedTaskView`: `id uuid(7)`, `userId` (FK `User`, каскад), `scope`, `workspaceId?` (FK, каскад), `projectId?` (составной FK `[projectId, workspaceId]` → `Project`, каскад), `name` (1–40), `params` (строка до 2 000 символов), `position`, `createdAt`, `updatedAt`. Индекс `@@index([userId, scope, workspaceId, projectId])`. Уникальность имени в области обеспечивает частичный уникальный индекс в SQL миграции (`COALESCE` по nullable-колонкам), так как Prisma не умеет уникальность с `NULL`. CHECK-ограничение: `mine` ⇔ `workspaceId IS NULL`, `project` ⇔ `projectId IS NOT NULL`. Триггер на `DELETE` из `WorkspaceMember` удаляет фильтры пользователя в этом пространстве, по образцу триггера наблюдателей. Миграция `pnpm db:migrate --name add_saved_task_views`.
  - `src/modules/tasks/models/saved-task-view.ts`: `normalizeViewName`, `SAVED_VIEWS_PER_SCOPE = 20`, `canonicalViewParams(rawParams, scope)` = `serializeTaskListParams(parseTaskListParams(...))` без `page`.
  - Срез `src/modules/tasks/slices/saved-view/` (`saved-view.schema.ts`, `.repository.ts`, `.service.ts`, `.actions.ts`, `.dto.ts`): `listSavedViews(session, { scope, workspaceId?, projectId? })`, `createSavedViewAction`, `renameSavedViewAction`, `deleteSavedViewAction`. Для областей `workspace`/`project` проверяется `requireWorkspaceAccess`, проект должен принадлежать пространству. Изменять можно только свои фильтры (чужой → `NOT_FOUND`).
  - Экспорт из `index.ts` / `client.ts`.
  - Тесты: `saved-task-view.test.ts`, `saved-view.service.test.ts` (лимит, дубликат имени → `ValidationError` на поле, чужой фильтр, проект из другого пространства).
  - Логирование: `info` `[saved-view] created/renamed/deleted` (`{ userId, scope, workspaceId, viewId }`); `warn` при отказах.

- [x] **Task 10: Интерфейс фильтров и страница «Мои задачи»** (зависит от 8, 9)
  - `src/components/tasks/task-list/saved-views-menu.tsx`: кнопка «Фильтры ▾» в `task-list-toolbar.tsx`. Внутри: список сохранённых фильтров (ссылки `basePath?params`, активный отмечен при совпадении канонических параметров), «Сохранить текущий…» (диалог с именем, доступен при `hasActiveFilters`), переименование и удаление (`ConfirmActionDialog`).
  - Списки пространства и проекта загружают `listSavedViews` и прокидывают его в тулбар.
  - `src/app/(app)/my-tasks/page.tsx`: заголовок «Мои задачи», тулбар (поиск, пространство, категория, приоритет, срок, сохранённые фильтры), таблица и пагинация (переиспользовать `TaskListTable` с колонкой «Пространство» для `scope="mine"`). Строка ведёт в `/w/<slug>/tasks/<номер>`. Панели задачи здесь нет: задача живёт в своём пространстве. Пустое состояние — «На вас нет открытых задач».
  - Ссылки: пункт «Мои задачи» в меню пользователя (`src/components/auth/`), блок-ссылка на главной (`src/app/(app)/page.tsx`), команда в `command-palette.tsx`, включить `g m` из задачи 6.
  - Тесты: `search-hrefs.test.ts` / `task-list-href` — адреса для `mine`.
  - Логирование: на клиенте нет; на странице ошибок загрузки — через сервисы.

### Phase 4: Дашборд и экспорт

- [x] **Task 11: Read-модель дашборда** (зависит от 8)
  - `src/modules/tasks/models/dashboard.ts` (чистый TS): `buildDashboard(rows, { today })` — счётчики (`open`, `overdue`, `dueWeek`, `unassigned`, `doneLast7`), нагрузка по участникам (сортировка по просроченным, затем по открытым), разбивка по проектам, `maxBar` для шкалы.
  - Срез `src/modules/tasks/slices/dashboard/` (`dashboard.repository.ts`, `dashboard.service.ts`, `dashboard.dto.ts`): `getWorkspaceDashboard(session, workspaceId)` с `requireWorkspaceAccess`. Агрегаты считаются в БД (`groupBy` по `assigneeId`, `$queryRaw` по размещениям и проектам с `workspaceId` в каждом условии); `openTaskWhere()` из задачи 8. «Закрыто за 7 дней» — по записям истории `status` в категорию `done` за 7 дней (`TaskHistoryEntry`); если снимок категории в истории не хранится, взять `updatedAt` размещения в статусе `done` и записать решение в код. Имена и фото участников — `listMembers` (`workspaces`), включая `isAgent`. День «сегодня» считается по `REMINDERS_TIMEZONE`, как в напоминаниях.
  - Экспорт `getWorkspaceDashboard` и типов из `index.ts`.
  - Тесты: `dashboard.test.ts` (агрегаты, пустое пространство, участник без задач, граница «сегодня»); `dashboard.service.test.ts` (доступ, фильтр архивных).
  - Логирование: `debug` `[tasks.dashboard] built` (`{ workspaceId, open, overdue, members, durationMs }`).

- [x] **Task 12: Страница «Обзор»** (зависит от 4, 11)
  - Загрузить скилл `dataviz` перед вёрсткой полос.
  - `src/app/(app)/w/[workspaceSlug]/overview/page.tsx` и `src/components/dashboard/`: `stat-tiles.tsx` (счётчики-ссылки), `workload-table.tsx` (участник, аватар, открытые и просроченные, CSS-полосы с `aria-label` и числом рядом), `projects-breakdown.tsx`, `overdue-list.tsx`. Ссылки ведут на `/w/<slug>/tasks?due=overdue&assignee=<id>` и т. п. через `serializeTaskListParams`.
  - Скелетон в форме страницы, `Suspense`, пустое состояние для пространства без задач (CTA «Создать задачу»).
  - `src/components/layout/nav-items.ts`: вкладка «Обзор» первой (`/w/[slug]/overview`), тест в `nav-items.test.ts`.
  - Обновление по событиям реалтайма (`useLiveRefresh`, debounce 2 000 мс).
  - Скриншоты Playwright на 1440 и 375 px, светлая и тёмная тема: без горизонтальной прокрутки страницы.
  - Логирование: на клиенте нет.

- [x] **Task 13: Экспорт задач в CSV** (зависит от 8)
  - `src/modules/tasks/models/task-csv.ts`: `escapeCsvCell(value)` (кавычки, `;`, перевод строки, префикс `'` для `= + - @ \t \r`), `toCsv(rows, columns)` с BOM и `\r\n`, колонки: Ключ, Название, Статус (проект: статус через `, `), Приоритет, Ответственный, Срок, Метки, Родитель, Создана, Обновлена, Ссылка. `exportFileName(workspaceSlug, date)` → `tasker-<slug>-2026-10-17.csv`.
  - `src/modules/tasks/slices/views/`: `exportTasks(session, workspaceId, query, scope, projectId?)` — фильтры и сортировка как у `listTasks`/`listProjectTasks`, без пагинации, `take: TASK_EXPORT_MAX_ROWS + 1` (10 000). Если строк больше лимита, в ответ добавляется флаг `truncated` и заголовок `X-Tasker-Truncated: 1`.
  - `src/shared/rate-limit`: правило `tasks.export` (10 в минуту на пользователя).
  - `src/app/api/w/[workspaceSlug]/tasks/export/route.ts`: `GET`, сессия (`401`), доступ (`404`), `enforceRateLimit` (`429`), `parseTaskListParams` (область `project` при валидном `project=`, иначе `workspace`). Ответ — `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename*=UTF-8''...`, `Cache-Control: no-store`. Ошибки — через `toErrorResponse`.
  - Кнопка «Экспорт CSV» (обычная ссылка `download`, текущие параметры без `page`) в `task-list-toolbar.tsx` для `workspace` и `project`.
  - Тесты: `task-csv.test.ts` (экранирование, formula injection, BOM, пустые значения, многострочное название); тест сервиса — лимит и `truncated`, чужое пространство.
  - Логирование: `info` `[tasks.export] exported` (`{ workspaceId, userId, scope, rows, truncated, durationMs }`); `warn` `[tasks.export] rate limited` / `denied`.

### Phase 5: Документация

- [x] **Task 14: Docs-чекпоинт** (зависит от всех)
  - `/aif-docs`. Что обновить:
    - `docs/architecture.md`: реалтайм (схема NOTIFY → listener → SSE → `refresh`, почему в событии нет данных, лимиты), горячие клавиши (таблица), сохранённые фильтры, «Мои задачи», дашборд, экспорт CSV;
    - `docs/configuration.md` и `docs/production.md`: блок Caddy для `/api/realtime/*`, что делать при нескольких экземплярах `app`;
    - `AGENTS.md`: `src/shared/realtime/`, `src/components/realtime|hotkeys|dashboard/`, `src/lib/hotkeys.ts`, маршруты `/my-tasks`, `/w/[slug]/overview`, `/api/realtime/w/[slug]`, `/api/w/[slug]/tasks/export`, модель `SavedTaskView`, срезы `saved-view` и `dashboard`;
    - `.ai-factory/ROADMAP.md`: отметить 4 пункта этапа «Удобство работы». Пятый пункт разделить: «Экспорт CSV» ✓, «Импорт из Trello / Jira» ☐.
  - Логирование: не требуется.
