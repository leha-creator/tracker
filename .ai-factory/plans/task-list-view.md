# План реализации: Представление списком

Branch: none (main; `git.create_branches: false`)
Created: 2026-10-16

## Settings
- Testing: yes (Vitest)
- Logging: standard (INFO на событиях, WARN на отказах; чтения — `debug`, как текущий `listTasks`)
- Docs: yes  # обязательный docs checkpoint в /aif-implement через /aif-docs

## Roadmap Linkage
Milestone: "Представление списком"
Rationale: План покрывает этап целиком: таблица задач с фильтрами, сортировкой и пагинацией — в пространстве и в проекте.

## Рамки этапа

**Входит:**
- Список задач пространства `/w/[workspaceSlug]/tasks` переделывается: фильтры, сортировка, постраничная навигация. Курсорное «Показать ещё» удаляется.
- Новая вкладка проекта «Список» `/w/[workspaceSlug]/projects/[projectId]/list` (рядом с «Доской»): те же компоненты, но со статусами этого проекта.
- Всё состояние списка хранится в URL (`searchParams`): ссылкой можно поделиться, кнопки «назад»/«вперёд» работают.
- Фильтры:
  - поиск по названию и номеру (`#42` или `42`);
  - статус: в пространстве — категория (к выполнению / в работе / готово) и «Вне проектов», в проекте — конкретные статусы проекта;
  - проект (только в пространстве), включая «Вне проектов»;
  - приоритет;
  - ответственный: участники, «Я», «Не назначен»;
  - срок: «Просрочено», «Сегодня», «На 7 дней», «Без срока».
- Сортировка по заголовку колонки: номер, название, приоритет, срок, статус (только в проекте); по возрастанию и по убыванию.
- Пагинация номерами страниц: `?page=N`, 50 строк на страницу, «Показано 51–100 из 230».
- Пустые состояния: задач нет совсем / по фильтрам ничего не найдено (с кнопкой «Сбросить фильтры»).

**Не входит:**
- Редактирование задач прямо в таблице (inline-edit), массовые операции, выбор строк.
- Настраиваемые колонки, сохранённые фильтры и представления.
- Группировка строк (по статусу, ответственному).
- Полнотекстовый поиск по описанию и триграммные индексы.
- Обновление списка в реальном времени.

## Ключевые решения

- **Модель запроса списка — чистый TS в `models/task-list-query.ts`, общая для клиента и сервера.** Тип `TaskListQuery` содержит `q`, `statuses`, `categories`, `projects`, `priorities`, `assignees`, `due`, `sort`, `dir`, `page`. Функция `parseTaskListParams(raw, scope)` нестрого разбирает `searchParams`: некорректные значения отбрасываются, а не превращаются в ошибку. Функция `serializeTaskListParams(query, scope)` выводит параметры в стабильном порядке и опускает значения по умолчанию. `scope` — `'workspace' | 'project'`. Параметр, который не подходит к scope, игнорируется: например, `status` в пространстве или `project` в проекте.
- **Формат URL.** Списки передаются через запятую: `?priority=high,urgent&assignee=me,none&due=overdue&sort=due&dir=asc&page=2`. Ограничения: до 20 значений в списке, `q` — до 100 символов после trim. id проектов и статусов проверяются как UUID. id пользователей — строки Better Auth, поэтому проверяются только длина и набор символов. Специальные значения: `assignee=me|none`, `project=none`, `category=none` («Вне проектов»).
- **Сброс страницы.** Любое изменение фильтров, сортировки или поиска сбрасывает `page` к 1. Это делает чистая функция `patchTaskListQuery(query, patch)`.
- **Сортировка по умолчанию.** В пространстве — `number desc` (новые сверху, как сейчас). В проекте — `status asc`: порядок статусов, затем позиция карточки, то есть как на доске. При равных значениях последним ключом всегда идёт `number`, чтобы порядок между страницами был стабильным. Срок сортируется с `nulls: 'last'` в обе стороны. Приоритет — по порядку enum `TaskPriority` в Postgres (`none < low < … < urgent`), поэтому по убыванию первыми идут срочные.
- **Два источника строк.**
  - Пространство: `prisma.task.findMany` с `where` по задаче.
  - Проект: `prisma.taskPlacement.findMany({ where: { workspaceId, projectId, statusId?, task: <фильтры задачи> } })`. Так сортировка по `status.position`, затем по `position`, становится сортировкой по связям «к одному», а фильтр по статусу касается только этого проекта.
  - Фильтры задачи (поиск, приоритет, ответственный, срок) собирает одна чистая функция `buildTaskWhere(query, ctx)` в `slices/views/task-list.prisma.ts`; в проектном режиме её результат вкладывается в `task: …`. Для `orderBy` — `buildTaskOrderBy` и `buildPlacementOrderBy`.
  - Каждый `where` содержит `workspaceId`.
- **«Просрочено».**
  - В пространстве правило то же, что у `isTaskOverdue`: `dueDate < today` и задача не выполнена. В Prisma это `dueDate: { lt: today }` и `NOT: { AND: [{ placements: { some: {} } }, { placements: { every: { status: { category: 'done' } } } }] }`.
  - В проекте задача просрочена, если её статус в этом проекте не из категории `done`, — как на карточке доски. Флаг `isOverdue` в строках проектного списка считается так же.
  - `today` берётся как дата UTC через существующий хелпер; «На 7 дней» — диапазон `today..today+6`.
- **Категория статуса в пространстве** означает: у задачи есть хотя бы одно размещение в статусе этой категории (`placements: { some: { status: { category: { in } } } }`). `none` означает `placements: { none: {} }`. Несколько значений объединяются через `OR`.
- **Пагинация — offset.** Размер страницы `TASK_LIST_PAGE_SIZE = 50`. `count` и `findMany({ skip, take })` выполняются в одной `prisma.$transaction([...])`, чтобы оба запроса видели согласованные данные. Если `page` больше последней страницы, сервис отдаёт последнюю страницу и возвращает фактический номер, а UI показывает его. Редиректа нет. Для 0 задач — `pageCount = 1`. Чистая функция `paginationRange(page, pageCount)` возвращает номера страниц с многоточиями: `[1, '…', 4, 5, 6, '…', 12]`.
- **DTO.** `TaskListPageDto { items: TaskListItemDto[], total, page, pageCount, pageSize }`. `TaskListItemDto` остаётся прежним (`createdAt` не нужен — убрать). В проектном режиме таблица берёт статус этого проекта из `placements` по `projectId`.
- **Перенос чтения списка в срез `views`.** Сейчас `listTasks` с курсором лежит в срезе `task`. Список — такое же представление, как доска, поэтому чтение уходит в `slices/views`: `views.repository.ts` и `views.queries.ts`. Курсор удаляется целиком: `TaskCursor`, `encode/decodeTaskCursor`, `TASK_PAGE_SIZE`, `taskRepository.listPage`, `listTasksSchema`, `loadMoreTasksAction`, `TaskPageDto`. `toTaskSummary` из `task.mapper.ts` переиспользуется; в проектном режиме `isOverdue` пересчитывается по статусу проекта.
- **Проверка доступа.** Обе функции вызывают `requireWorkspaceAccess`. Для `listProjectTasks` невалидный `projectId` даёт `NotFoundError` (как `getBoardCards`). Принадлежность проекта пространству обеспечивает `where { workspaceId, projectId }`. Существование проекта уже проверяет `loadProjectPage` на странице. `assignee=me` подставляется на сервере из `session.user.id`.
- **Индексы.** Миграция не нужна. Уже есть индексы `[workspaceId, createdAt]`, `[workspaceId, assigneeId]`, `[workspaceId, dueDate]`, `[workspaceId, number]` (unique), `[projectId, statusId, position]`. Поиск `contains` + `mode: 'insensitive'` даёт seq scan внутри пространства — для текущих объёмов это приемлемо (см. риски).
- **UI без `useSearchParams`.** Страница разбирает `searchParams` внутри `<Suspense>` (требование Cache Components) и передаёт в клиентские компоненты уже готовый `query` и `basePath`. Клиент строит новый URL через `serializeTaskListParams(patchTaskListQuery(...))` и вызывает `router.push(url, { scroll: false })` внутри `startTransition`. Индикация ожидания сделана по образцу `interactive-apps.md`: `useOptimistic` для выбранных значений и `data-pending` на корне панели, а таблица затемняется через `group-has-data-pending:opacity-60`, без скелетона.
- **Activity и поиск.** Поле поиска держит локальный черновик с задержкой 300 мс и синхронизируется с `query.q`, когда меняется проп (паттерн «adjusting state on prop change», без `useEffect`). Иначе после «назад» или «Сбросить» в поле останется старый текст: Activity сохраняет состояние страницы.
- **Сортировка в заголовках** — кнопки внутри `<th>` с `aria-sort` (`ascending` / `descending` / `none`). Первый клик ставит направление по умолчанию для поля: срок и название — `asc`; номер и приоритет — `desc`; статус — `asc`. Повторный клик меняет направление.
- **Пагинация** — серверный компонент со ссылками `Link` (`href` строит `serializeTaskListParams`). Используется shadcn `pagination`: добавить через CLI `pnpm dlx shadcn@latest add pagination`, вручную не править. Подпись `aria-label="Страницы списка задач"`.
- **Фильтры** — `DropdownMenu` + `DropdownMenuCheckboxItem` (уже есть в `components/ui`): кнопка-триггер со счётчиком выбранных значений. Срок — `DropdownMenuRadioGroup`. Есть кнопка «Сбросить фильтры»: убирает всё, кроме сортировки. Перед UI-задачами перечитать `node_modules/next/dist/docs/01-app/02-guides/interactive-apps.md` и `preserving-ui-state.md`.

## Commit Plan
- **Commit 1** (после задач 1–3): `feat(tasks): add filtered, sorted and paginated task list queries`
- **Commit 2** (после задач 4–7): `feat(list): task list view with filters, sorting and pagination`

## Tasks

### Phase 1: Модель и чтение данных

- [x] Task 1: Модель запроса списка
  - **По факту:** разбор — чистый TS без Zod (`parseList` + предикаты); добавлены `pageCountOf`, `pageBounds`, `defaultSortDirection`. `isEntityId` и `STATUS_CATEGORIES` — из `@/modules/projects/client`.
  - `src/modules/tasks/models/task-list-query.ts` (чистый TS + Zod, без server-only):
    - константы `TASK_LIST_PAGE_SIZE = 50`, `TASK_LIST_SORTS` (`number | title | priority | due | status`), `TASK_DUE_FILTERS` (`overdue | today | week | none`) и подписи на русском (`TASK_DUE_FILTER_LABELS`, `TASK_LIST_SORT_LABELS`), лимиты (`TASK_LIST_MAX_VALUES = 20`, `TASK_LIST_QUERY_MAX_LENGTH = 100`);
    - тип `TaskListScope = 'workspace' | 'project'`, тип `TaskListQuery`, `defaultTaskListQuery(scope)`;
    - `parseTaskListParams(raw: Record<string, string | string[] | undefined>, scope)` → `TaskListQuery`. Если ключ повторяется, берётся первое значение. Значения разделяются запятой, обрезаются, повторы удаляются, некорректные отбрасываются. `page` — целое ≥ 1, иначе 1. `sort=status` в пространстве → сортировка по умолчанию;
    - `serializeTaskListParams(query, scope)` → строка `URLSearchParams` без значений по умолчанию, в стабильном порядке ключей;
    - `patchTaskListQuery(query, patch)` — сбрасывает `page` к 1, если меняется что-то кроме `page`;
    - `toggleSort(query, field, scope)` — направление по умолчанию для поля и смена направления при повторном клике;
    - `hasActiveFilters(query)`; `clearFilters(query, scope)` — оставляет `sort`/`dir`;
    - `parseTaskNumberQuery(q)` → номер, если `q` — это `#42` или `42`;
    - `dueDateRange(filter, today)` → `{ lt?, gte?, lte? } | 'none'` (даты `YYYY-MM-DD`; «На 7 дней» — `today..today+6`; сдвиг даты — через UTC);
    - `paginationRange(page, pageCount)` → `(number | 'ellipsis')[]`: первая, последняя, текущая ±1, многоточия.
  - `models/index.ts` — реэкспорт; `client.ts` — экспорт всего перечисленного и типов.
  - Тесты `task-list-query.test.ts`:
    - разбор: пустые параметры → значения по умолчанию для обоих scope;
    - мусорные значения отбрасываются: неизвестный приоритет, не-UUID проект, `page=-1`, `page=abc`, `sort=status` в пространстве;
    - лимит в 20 значений, удаление повторов, обрезка `q`;
    - `status` игнорируется в пространстве, `project` и `category` — в проекте;
    - сериализация: значения по умолчанию опущены, порядок стабилен, круговой тест `parse(serialize(q)) ≅ q`;
    - `patchTaskListQuery`: сброс страницы при смене фильтра и сохранение страницы при смене только `page`;
    - `toggleSort`: направление по умолчанию и переключение;
    - `paginationRange`: 1 страница, 5 страниц, 12 страниц на краях и в середине;
    - `dueDateRange`: переход через конец месяца или года;
    - `parseTaskNumberQuery`: `#42`, `42`, `0`, `abc`.
  - Логирование: модели не логируют.
  - Files: `src/modules/tasks/models/{task-list-query,task-list-query.test,index}.ts`, `src/modules/tasks/client.ts`.

- [x] Task 2: Запросы списка в срезе `views` (depends on 1)
  - **По факту:** `PLACEMENT_SELECT`, `TASK_LIST_SELECT` и тип `TaskListRow` — в `slices/task/task.select.ts`. Ограничение страницы — хелпер `loadPage` в `views.queries.ts`. Тесты сервиса — в существующем `views.queries.test.ts`.
  - `src/modules/tasks/slices/views/task-list.prisma.ts` (`import 'server-only'`, чистые функции, тип `Prisma.*`):
    - `buildTaskWhere(query, { workspaceId, userId, today, scope })` → `Prisma.TaskWhereInput`:
      - поиск: `title contains insensitive` OR `number = N`, если `q` — номер;
      - приоритеты: `in`;
      - ответственные: `me` → `userId`, `none` → `assigneeId: null`; несколько значений — через `OR`;
      - срок: диапазон или `null`; `overdue` с условием «не выполнена» (в пространстве — по всем размещениям; в проекте условие по статусу добавляет placement-where);
      - категории и проекты (только в пространстве): `some` / `none` по размещениям.
    - `buildPlacementWhere(query, ctx & { projectId })` → `Prisma.TaskPlacementWhereInput`: `workspaceId`, `projectId`, `statusId in`, `task: buildTaskWhere(...)`; для `overdue` добавляет `status: { category: { not: 'done' } }`.
    - `buildTaskOrderBy(sort, dir)` и `buildPlacementOrderBy(sort, dir)`; последний ключ — `number`, срок — `{ sort, nulls: 'last' }`, `status` → `[{ status: { position } }, { position }]`.
  - `views.repository.ts`:
    - `listTaskPage(where, orderBy, skip, take)` и `listPlacementPage(where, orderBy, skip, take)` — каждая выполняет `prisma.$transaction([count, findMany])`;
    - select строк — `TASK_LIST_SELECT`: перенести из `task.repository.ts` в общий модуль среза (например, экспорт из `task.repository.ts` или `task.select.ts`) без дублирования; для размещения — `task: { select: TASK_LIST_SELECT }`, `status: { select: { category } }`.
  - `views.queries.ts`:
    - `listTasks(session, workspaceId, query)` и `listProjectTasks(session, workspaceId, projectId, query)`;
    - порядок: `requireWorkspaceAccess` → (`isEntityId(projectId)`, иначе `NotFoundError('Проект не найден')`) → построение `where`/`orderBy` → запрос страницы;
    - если `total > 0` и `page > pageCount`, второй запрос делается с последней страницей;
    - маппинг через `toTaskSummary`; в проекте `isOverdue` пересчитывается по категории статуса проекта;
    - результат — `TaskListPageDto`.
  - `views.dto.ts`: `TaskListPageDto`. `TaskListItemDto` остаётся в `task.dto.ts`, `createdAt` из него убрать.
  - Тесты:
    - `task-list.prisma.test.ts` (чистые функции, без БД): `workspaceId` всегда в `where`; `me` раскрывается в `userId`; `none` → `null`; поиск по номеру; `overdue` в пространстве и в проекте; категории `none`; `orderBy` для каждого поля с ключом `number` последним и `nulls: 'last'` у срока.
    - `views.queries.test.ts` (моки по существующему образцу): неучастник → `NOT_FOUND`; невалидный `projectId` → `NOT_FOUND`; `page` за пределами → последняя страница и повторный запрос; `pageCount = 1` при 0 задач; `isOverdue` в проекте по статусу проекта.
  - Логирование (`createLogger('tasks.views')`): `log.debug({ userId, workspaceId, projectId?, scope, filters: { priorities: n, assignees: n, … }, hasQuery, sort, dir, page, total }, '[views.listTasks]')`. Текст `q` и названия задач не логировать. Выход `page` за пределы — `log.debug({ workspaceId, requested, pageCount }, '[views.listTasks] page clamped')`: это обычная ситуация для старой ссылки, а не отказ. Ошибки доступа логирует `requireWorkspaceAccess`.
  - Files: `src/modules/tasks/slices/views/{task-list.prisma,task-list.prisma.test,views.repository,views.queries,views.queries.test,views.dto}.ts`, `src/modules/tasks/slices/task/{task.repository,task.dto}.ts`.

- [x] Task 3: Публичный API и удаление курсорной пагинации (depends on 2)
  - **По факту:** выполнена вместе с задачей 2. Страница `/tasks` и `task-table.tsx` временно адаптированы (первая страница без фильтров, без «Показать ещё»). У `enum TaskPriority` добавлен комментарий о порядке значений.
  - Удалить: `listTasks` и `today()`, если он больше не нужен, из `task.service.ts`; `taskRepository.listPage` и тип `TaskListRow` (если перенесён); `listTasksSchema`; `loadMoreTasksAction`; `TaskPageDto`; `TaskCursor`, `encodeTaskCursor`, `decodeTaskCursor`, `TASK_PAGE_SIZE` из `models/task.ts` и `models/index.ts`; связанные тесты в `task.service.test.ts`, `task.schema.test.ts`, `task.test.ts`.
  - `src/modules/tasks/index.ts`: `export { getBoardCards, listProjectTasks, listTasks } from './slices/views/views.queries'`.
  - `client.ts`: убрать `loadMoreTasksAction` и `TaskPageDto`, добавить `TaskListPageDto` и экспорт модели списка (задача 1).
  - `pnpm check` зелёный (временно может сломаться старая страница `/tasks` — её переписывает задача 5. Если typecheck падает, адаптировать страницу минимально: `listTasks(session, id, parseTaskListParams({}, 'workspace'))`, а `TaskTable` пока без «Показать ещё»).
  - Логирование: нет новых событий.
  - Files: `src/modules/tasks/{index,client}.ts`, `src/modules/tasks/models/{task,index,task.test}.ts`, `src/modules/tasks/slices/task/{task.service,task.service.test,task.repository,task.schema,task.schema.test,task.actions,task.dto}.ts`, при необходимости `src/app/(app)/w/[workspaceSlug]/tasks/page.tsx`, `src/components/tasks/task-table.tsx`.

<!-- Commit checkpoint: tasks 1-3 -->

### Phase 2: UI

- [x] Task 4: Компоненты списка (depends on 3)
  - **По факту:** вместо хука `use-task-list-navigation` — клиентская обёртка `task-list-shell.tsx` с контекстом (`useTaskList`): оптимистичный `query` (`useOptimistic`), `navigate` в `useTransition`, `data-pending` на корне `group/list`. Адрес — `task-list-href.ts`, тип опций — `task-list-types.ts`. В сгенерированном `ui/pagination.tsx` исправлен импорт `cn` (CLI сгенерировал `from "cn"`); из него используются только `Pagination`, `PaginationContent`, `PaginationItem` — ссылки через `Link` с русскими подписями.
  - `pnpm dlx shadcn@latest add pagination` (в `src/components/ui/`, вручную не править).
  - `src/components/tasks/task-list/use-task-list-navigation.ts` (`'use client'`): `useTaskListNavigation(basePath, scope)` → `navigate(nextQuery, { replace? })` (`router.push` / `router.replace` на `\`${basePath}?${serialize}\`` с `{ scroll: false }`; без параметров — `basePath`). Поиск вызывает `replace`, фильтры и сортировка — `push`.
  - `task-list-toolbar.tsx` (`'use client'`) — props `query`, `scope`, `basePath`, `options`:
    - `options`: `members`, а также `projects` (в пространстве) или `statuses` (в проекте);
    - поиск (`Input`, задержка 300 мс, синхронизация с `query.q` при смене пропа, `Esc` очищает);
    - фильтры (`TaskListFilter` с `DropdownMenuCheckboxItem`, счётчиком на триггере и `aria-label`);
    - срок (`DropdownMenuRadioGroup`) и «Сбросить фильтры» (видна при `hasActiveFilters`);
    - всё внутри одного `startTransition`; `useOptimistic(query)` для мгновенной отметки; `data-pending` на корне.
  - `task-list-table.tsx` — заменяет `task-table.tsx`, в котором удаляется «Показать ещё»:
    - props `items`, `scope`, `projectId?`, `workspaceSlug`, `query`, `basePath`;
    - колонки в пространстве: №, Название, Проекты, Приоритет, Срок, Ответственный;
    - колонки в проекте: №, Название, Статус (`StatusDot` + название статуса этого проекта), Приоритет, Срок, Ответственный;
    - сортируемые заголовки — клиентский `SortHeader` (кнопка, `aria-sort`, иконка направления `lucide-react`, `toggleSort` + `navigate`, тот же `data-pending`);
    - таблица в контейнере `group-has-data-pending:opacity-60 transition-opacity`. Корень `group` — у обёртки страницы списка.
  - `task-list-pagination.tsx` (серверный или общий компонент без хуков):
    - «Показано 51–100 из 230»;
    - `Pagination` со ссылками «Назад», номерами из `paginationRange` и «Вперёд»; у текущей — `aria-current="page"`; крайние неактивны; при `pageCount = 1` скрыта.
  - `task-list-empty.tsx`: вариант «задач нет» (текст и CTA, переданные страницей) и «ничего не найдено» (ссылка «Сбросить фильтры» на `clearFilters`).
  - `TaskListOptions` (тип props): `members: { userId, name }[]`, `projects?: { id, name }[]`, `statuses?: { id, name, color }[]` — собираются на странице из `listMembers` / `listProjects` / `listStatuses`. Модуль `tasks` о `projects`/`workspaces` в UI не знает.
  - Логирование: нет (UI).
  - Files: `src/components/ui/pagination.tsx`, `src/components/tasks/task-list/{use-task-list-navigation,task-list-toolbar,task-list-filter,sort-header,task-list-table,task-list-pagination,task-list-empty}.tsx`, удалить `src/components/tasks/task-table.tsx`.

- [x] Task 5: Список задач пространства (depends on 4)
  - `src/app/(app)/w/[workspaceSlug]/tasks/page.tsx`:
    - `searchParams` читается внутри `<Suspense>`; `parseTaskListParams(await searchParams, 'workspace')`;
    - параллельно (`Promise.all`) `listTasks`, `listMembers`, `listProjects`;
    - рендер: заголовок + «Новая задача», `TaskListToolbar`, таблица или пустое состояние, пагинация; обёртка `group`;
    - `fallback` у Suspense — прежний скелетон.
  - Пустые состояния: `total = 0` без фильтров → прежний текст «Задач пока нет…»; с фильтрами → «Ничего не найдено».
  - `<title>` остаётся «Задачи — Tasker».
  - Логирование: нет (UI).
  - Files: `src/app/(app)/w/[workspaceSlug]/tasks/page.tsx`.

- [x] Task 6: Вкладка «Список» в проекте (depends on 4)
  - `src/app/(app)/w/[workspaceSlug]/projects/[projectId]/list/page.tsx`:
    - `loadProjectPage` → `parseTaskListParams(…, 'project')`;
    - `Promise.all([listProjectTasks, listStatuses, listMembers])`;
    - те же компоненты с `scope='project'`, `basePath=/w/<slug>/projects/<id>/list`;
    - `metadata.title = 'Список проекта — Tasker'`.
  - Пустое состояние «В проекте пока нет задач» со ссылкой на доску и «Новая задача» (`/tasks/new?projectId=`).
  - `src/components/projects/project-nav.tsx`: вкладка «Список» (`${basePath}/list`) между «Доской» и «Настройками».
  - Логирование: нет (UI).
  - Files: `src/app/(app)/w/[workspaceSlug]/projects/[projectId]/list/page.tsx`, `src/components/projects/project-nav.tsx`.

- [x] Task 7: Сквозная проверка (depends on 5, 6)
  - **Проверено (2026-10-16, `next start` на :3000, скрипт Playwright, 37 проверок, стабильно в 3 прогонах подряд):** весь сценарий ниже на 60 задачах и двух проектах. Сортировка по названию сверена с `ORDER BY title` в БД, порядок вкладки проекта — с порядком доски из БД. В логе сервера нет ERROR; WARN — только ожидаемые отказы доступа чужому пользователю. Тестовые данные удалены. Однажды процесс `next start` упал при регистрации тестового пользователя (`[credentials.signUp] start`, код `0xC0000409`). Это нативный сбой Node на Windows в коде, который этап не менял; после перезапуска не повторялся. `pnpm check` (472 теста) и `pnpm build` зелёные.
  - Playwright-скрипт по образцу прошлых этапов: `next start`, тестовые данные создаются скриптом и удаляются в конце; около 60 задач, чтобы получилось 2 страницы. Проверить:
    1. фильтры в пространстве: приоритет, ответственный (`me`, `none`), проект (`none`), категория, срок (`overdue` не включает выполненные задачи);
    2. поиск по слову и по `#N`;
    3. сортировка по каждому полю в обе стороны, `aria-sort`;
    4. страница 2 и «Показано 51–…»; смена фильтра сбрасывает на страницу 1; `?page=999` показывает последнюю страницу;
    5. URL с фильтрами после перезагрузки даёт тот же результат; «назад» восстанавливает и таблицу, и поле поиска;
    6. мусорные параметры (`?priority=foo&page=-3&project=x`) не дают ошибки;
    7. вкладка «Список» в проекте: сортировка по статусу совпадает с порядком доски; фильтр по статусу проекта; задача в двух проектах видна в обоих с разными статусами;
    8. пользователь другого пространства по прямой ссылке получает 404;
    9. в консоли нет ошибок (в том числе гидрации), в логе сервера нет ERROR.
  - `pnpm check` и `pnpm build` зелёные.
  - Логирование: нет.
  - Files: — (скрипт во временной директории, в репозиторий не коммитится).

<!-- Commit checkpoint: tasks 4-7 -->

## Риски и что проверить

- **Поиск `ILIKE '%q%'`** не использует индекс. Внутри одного пространства на тысячах задач это приемлемо. Если станет узким местом — `pg_trgm` + GIN-индекс по `title` (отдельная миграция).
- **Offset на больших страницах** дороже keyset, а при параллельных вставках строки могут сдвигаться между страницами. Для таск-трекера команды это допустимо: так решили ради ссылок с номером страницы.
- **`count` на каждый запрос** — ещё один запрос с тем же `where`. Выполняется в той же транзакции; при проблемах — кэш числа или «больше 1000».
- **Сортировка по приоритету** опирается на порядок значений enum в Postgres. Если в будущем enum расширят не в конец, порядок сломается. Нужен тест-напоминание или комментарий у `enum TaskPriority` в схеме.
- **`overdue` в пространстве** строится через `NOT (some AND every)`. Проверить SQL на реальной БД, в том числе задачи вне проектов: они должны считаться невыполненными, как в `isTaskOverdue`.
- **Activity / сохранение состояния:** черновик поиска и открытые меню фильтров после навигации — проверить вручную «назад»/«вперёд» и переход между `/tasks` и вкладкой проекта.
- **`router.push` на каждый фильтр** добавляет записи в историю. Это сознательно: «назад» отменяет фильтр. Для ввода в поиск использовать `router.replace`, чтобы не засорять историю.
- `pnpm check` и `pnpm build` должны оставаться зелёными после каждой commit-точки.
