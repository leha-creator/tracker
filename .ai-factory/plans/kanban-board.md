# План реализации: Канбан-доска

Branch: none (main; `git.create_branches: false`)
Created: 2026-10-15

## Settings
- Testing: yes (Vitest)
- Logging: standard (INFO на событиях, WARN на отказах, без DEBUG)
- Docs: yes  # обязательный docs checkpoint в /aif-implement через /aif-docs

## Roadmap Linkage
Milestone: "Канбан-доска"
Rationale: План покрывает этап целиком: перетаскивание карточек между колонками и внутри колонки на доске проекта.

## Рамки этапа

**Входит:**
- Drag-and-drop карточек на доске проекта `/w/[workspaceSlug]/projects/[projectId]/board`: внутри колонки (смена порядка) и между колонками (смена статуса + позиция в месте броска).
- Серверная операция `movePlacement`: статус + дробная позиция между соседями, одна строка на перемещение (кроме редкой перенумерации колонки при равных ключах).
- Оптимистичное обновление доски, откат и toast при ошибке.
- Клавиатурное перетаскивание и объявления для скринридеров на русском; перетаскивание на тач-устройствах.
- Клик по карточке по-прежнему открывает задачу.

**Не входит:**
- Перетаскивание колонок (порядок статусов меняется в настройках проекта).
- Фильтры и группировки на доске, лимиты WIP, свёртывание колонок.
- Обновление доски в реальном времени у других пользователей (видят изменения после навигации/обновления).
- Перетаскивание между досками разных проектов.
- Смена статуса на странице задачи остаётся «в конец колонки» (`changeStatus`) — без изменений.

## Ключевые решения

- **Библиотека — `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`** (точные версии, как остальные зависимости). Стабильный API, сенсоры клавиатуры/указателя/тача, `SortableContext` на колонку, `DragOverlay`. Это уже указано в DESCRIPTION.md.
- **Контракт перемещения — один якорь.** Клиент отправляет `{ workspaceId, taskId, projectId, statusId, prevTaskId: uuid | null }`, где `prevTaskId` — карточка, которая после броска стоит **прямо над** перемещаемой (`null` — верх колонки). Сервер сам находит следующую карточку колонки (без перемещаемой) и берёт `positionBetween(prev, next)`. Так клиент не может прислать противоречивую пару соседей.
- **Чтение колонки целиком.** Сервис загружает размещения целевой колонки (`taskId`, `position`) одним запросом, сортирует `comparePositions`, исключает перемещаемую карточку. Это проще курсорных запросов и даёт данные для перенумерации. Колонки небольшие; риск записан ниже.
- **Устаревший якорь.** `prevTaskId` не найден в целевой колонке (карточку переместили/убрали другие) → `ConflictError('Доска изменилась, порядок обновлён')`, клиент откатывается и делает `router.refresh()`. `prevTaskId === taskId` → `ValidationError`.
- **Равные ключи** (гонка двух вставок в конец колонки, известный риск этапа «Задачи»): если `prev.position === next.position`, сервис в той же транзакции перенумеровывает колонку (`generateNKeysBetween(null, null, n)` в текущем порядке) и вычисляет позицию заново. Перенумерация — чистая функция модели `rekeyColumn()`. `WARN [placement] column rekeyed { projectId, statusId, cards }`.
- **No-op.** Тот же статус и та же карточка над — ничего не пишем, `INFO` не логируем.
- **Правило «статус ∈ проект размещения»** — по-прежнему `TaskPlacement.moveTo()`; статус пространства — `placementRepository.findStatus`. Удаление статуса параллельно с броском: FK `(statusId, projectId)` → P2003 → `NotFoundError('Статус не найден')` (новый хелпер `isForeignKeyViolation` в `shared/db`).
- **Права.** Двигать карточки может любой участник пространства (как `changeStatus`).
- **Action без FormData.** `movePlacementAction(raw: unknown): Promise<ActionResult<null>>` (по образцу из ARCHITECTURE.md и `loadMoreTasksAction`), `revalidatePath('/w/[workspaceSlug]', 'layout')`.
- **Клиентское состояние доски.** `KanbanBoard` (`'use client'`) держит `columns: Record<statusId, BoardCardDto[]>` в `useState`; при новых `cards` из пропсов (после revalidate) состояние сбрасывается по паттерну «adjusting state on prop change» (сравнение с предыдущим пропом в рендере, без `useEffect`). Во время перетаскивания `onDragOver` переносит карточку между колонками локально; `onDragEnd` фиксирует итог, вычисляет `prevTaskId` и вызывает action в `startTransition`. Ошибка → откат к пропсам, `toast.error(message)`, `router.refresh()`.
- **Чистая логика переноса — в модели.** `models/board-move.ts`: `moveCard(columns, taskId, toStatusId, toIndex)` (иммутабельно) и `prevTaskIdAt(column, index)`. Экспорт через `client.ts`, покрывается unit-тестами (Vitest в окружении `node`, без DOM).
- **Клик vs перетаскивание.** `PointerSensor` с `activationConstraint: { distance: 6 }`, `TouchSensor` с `{ delay: 200, tolerance: 6 }`, `KeyboardSensor` с `sortableKeyboardCoordinates`. Карточка остаётся `Link`, `listeners`/`attributes` `useSortable` вешаются на обёртку карточки: обычный клик ведёт на задачу, перетаскивание начинается только после сдвига на 6px, и после него клик не срабатывает (проверить; при необходимости гасить `onClick` по флагу «только что перетаскивали»). Клавиатура: у `KeyboardSensor` `keyboardCodes.start = ['Space']` — `Enter` на сфокусированной карточке открывает задачу, `Space` берёт её, стрелки двигают, `Space` бросает, `Esc` отменяет. Подсказка про `Space` — в `screenReaderInstructions`.
- **Гидрация.** `DndContext` получает стабильный `id` (`useId()`), иначе `aria-describedby` расходится между SSR и клиентом.
- **Пустые колонки** — `useDroppable` на контейнер колонки (id `column:<statusId>`), чтобы бросать в колонку без карточек.
- **Cache Components.** Страница доски не меняется по структуре: данные читаются в `<Suspense>`, `KanbanBoard` получает сериализуемые DTO. Перед UI-задачами перечитать `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` и `preserving-ui-state.md`.

## Commit Plan
- **Commit 1** (после задач 1–3): `feat(tasks): add placement move with fractional positions`
- **Commit 2** (после задач 4–6): `feat(board): drag and drop cards on project board`

## Tasks

### Phase 1: Серверная часть

- [x] Task 1: Модель перемещения и позиций
  - **По факту:** `resolveMovePosition` возвращает готовую позицию (`{ kind: 'position', position }`), а не пару соседей; типы `ColumnCard`, `MovePosition`.
  - `src/modules/tasks/models/position.ts`: `rekeyColumn(count: number): string[]` поверх `generateNKeysBetween(null, null, count)`; `positionBetween` документировать: равные границы недопустимы (бросает `fractional-indexing`) — вызывающий обязан перенумеровать колонку.
  - `src/modules/tasks/models/board-move.ts` (чистый TS): тип `BoardColumns<T extends { taskId: string }> = Record<string, T[]>`; `moveCard(columns, taskId, toStatusId, toIndex)` — убирает карточку из текущей колонки и вставляет в целевую по индексу (клампинг индекса, тот же статус — перестановка), возвращает новый объект без мутаций; `findCardColumn(columns, taskId)`; `prevTaskIdAt(column, index)` — id карточки над позицией `index` или `null`.
  - `src/modules/tasks/models/task-placement.ts`: `resolveMovePosition({ column, taskId, prevTaskId })` → `{ kind: 'noop' } | { kind: 'position', before, after } | { kind: 'rekey' }` — колонка уже отсортирована; исключает перемещаемую; `prevTaskId` нет в колонке → `ConflictError('Доска изменилась, порядок обновлён')`; `prevTaskId === taskId` → `ValidationError`; равные ключи соседей → `rekey`; карточка уже стоит сразу после `prev` в этой колонке → `noop`.
  - `models/index.ts` — реэкспорт; `client.ts` — `moveCard`, `findCardColumn`, `prevTaskIdAt`.
  - Тесты: `board-move.test.ts` (перенос между колонками, внутри колонки вверх/вниз, в пустую колонку, индекс за границей, исходный объект не мутирован, `prevTaskIdAt` для 0 и конца), `task-placement.test.ts` (+ `resolveMovePosition`: верх, низ, середина, noop, отсутствующий якорь, якорь = сама карточка, равные ключи → rekey), `position.test.ts` (+ `rekeyColumn`: n ключей строго возрастают побайтно, `n = 0`).
  - Логирование: модели не логируют.
  - Files: `src/modules/tasks/models/{position,board-move,task-placement,index}.ts`, `src/modules/tasks/client.ts`, `src/modules/tasks/models/{position,board-move,task-placement}.test.ts`.

- [x] Task 2: Сервис `movePlacement` (depends on 1)
  - **По факту:** отказ якоря (устаревший или сама карточка) логируется как `WARN [placement.movePlacement] anchor rejected`; при переносе внутри колонки статус не загружается.
  - `src/shared/db/errors.ts`: `isForeignKeyViolation(error)` (P2003) + экспорт из `shared/db/index.ts`.
  - `placement.repository.ts`: `listColumn(tx, workspaceId, projectId, statusId)` → `{ taskId, position }[]` (`where` с `workspaceId`); `updatePositions(tx, workspaceId, projectId, rows: { taskId, position }[])` — для перенумерации (по одной `updateMany` на строку внутри транзакции, `where` с `workspaceId` и `projectId`).
  - `placement.service.ts`: `movePlacement(session, { workspaceId, taskId, projectId, statusId, prevTaskId })`: `requireWorkspaceAccess` → `assertIds` (+ `prevTaskId`) → `prisma.$transaction`: `find` размещения (нет → `NotFoundError('Задачи нет в этом проекте')`), `loadStatus` (статус чужого проекта отклоняет `TaskPlacement.moveTo`), `listColumn` + `comparePositions`, `resolveMovePosition`; `rekey` → `rekeyColumn` для колонки без перемещаемой, `updatePositions`, повторно `resolveMovePosition`; `moveTo` → `updateStatus`. P2003 → `NotFoundError('Статус не найден')`.
  - Тесты (`placement.service.test.ts`, моки по существующему образцу): неучастник → `NOT_FOUND`; невалидный `prevTaskId` → `NOT_FOUND`; задачи нет в проекте → `NOT_FOUND`; статус другого проекта → `VALIDATION`; вставка в середину — позиция строго между соседями; в верх/низ колонки; перенос в другую колонку меняет `statusId`; устаревший якорь → `CONFLICT`; равные ключи → `updatePositions` вызван, итоговая позиция между новыми ключами; noop — `updateStatus` не вызывается; P2003 → `NOT_FOUND`.
  - Логирование (`createLogger('tasks.placement')`): `INFO [placement] moved { workspaceId, taskId, projectId, from, to, userId }`; `WARN [placement.movePlacement] stale anchor { workspaceId, taskId, projectId, statusId, prevTaskId }`; `WARN [placement] column rekeyed { projectId, statusId, cards }`; `WARN` при отказе `moveTo` и при P2003. Названия задач не логировать.
  - Files: `src/shared/db/{errors,index}.ts`, `src/modules/tasks/slices/placement/placement.{repository,service}.ts`, `placement.service.test.ts`.

- [x] Task 3: Схема, Server Action и публичный API (depends on 2)
  - `placement.schema.ts`: `movePlacementSchema = addToProjectSchema.extend({ prevTaskId: z.uuid().nullable() })`.
  - `placement.actions.ts`: `movePlacementAction(raw: unknown): Promise<ActionResult<null>>` — `parse` → `requireUser` → `movePlacement` → `revalidateWorkspace()`; ошибки — `toActionError(error, { action: 'movePlacement' })`.
  - `client.ts`: экспорт `movePlacementAction`; `index.ts` — без изменений (реэкспорт `client`).
  - Тесты: `placement.schema.test.ts` — `prevTaskId: null` ок, отсутствует → ошибка, невалидный UUID → ошибка.
  - Логирование: action не логирует бизнес-события; ошибки — через `toActionError`.
  - Files: `src/modules/tasks/slices/placement/placement.{schema,actions}.ts`, `src/modules/tasks/client.ts`, `placement.schema.test.ts`.

<!-- Commit checkpoint: tasks 1-3 -->

### Phase 2: UI

- [x] Task 4: Перетаскиваемая доска (depends on 3)
  - **По факту:** `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`. `board-columns.tsx` удалён — колонка (`BoardColumn`) внутри `kanban-board.tsx`. `listeners` висят прямо на ссылке `TaskCard` (принимает пропсы `Link`); из `attributes` берётся только `aria-describedby`. Клик после броска гасится в окне 250 мс (`onClickCapture`). «Ниже карточки» при переносе между колонками — по центру перетаскиваемой карточки, а не по её верхнему краю.
  - `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` (точные версии в `package.json`).
  - `src/components/tasks/kanban-board.tsx` (`'use client'`): заменяет рендер `BoardColumns`. `DndContext` (`id={useId()}`, сенсоры из «Ключевых решений», `collisionDetection={closestCorners}`), колонки — `SortableContext` (`verticalListSortingStrategy`) + `useDroppable('column:<statusId>')`; `onDragStart` запоминает исходные колонки, `onDragOver` → `moveCard` между колонками, `onDragEnd` → итоговый индекс, `prevTaskIdAt`, сравнение с исходным положением (без изменений — без запроса), `startTransition(async () => movePlacementAction(...))`; ошибка → откат, `toast.error`, `router.refresh()`; `onDragCancel` → откат. `DragOverlay` с копией `TaskCard`.
  - Состояние: `useState(cards)` + сброс при смене пропа `cards` (сравнение с сохранённым предыдущим значением в рендере).
  - `src/components/tasks/sortable-task-card.tsx`: `useSortable({ id: taskId, data: { statusId } })`, стили `transform`/`transition` (`CSS.Translate`), исходная карточка полупрозрачна во время перетаскивания; `listeners`/`attributes` — на обёртке вокруг `TaskCard` (без `role="button"` поверх ссылки: `attributes.role` переопределить, `aria-roledescription="перетаскиваемая карточка"`), `KeyboardSensor` стартует только по `Space`.
  - `src/components/projects/board-columns.tsx`: оставить заголовок колонки/пустое состояние/`QuickCreateTask` как презентационные части (или перенести в `kanban-board.tsx`) — без дублирования разметки; пустая колонка подсвечивается при наведении карточки.
  - `board/page.tsx`: рендерит `KanbanBoard` вместо `BoardColumns` (данные те же).
  - Логирование: нет (UI); ошибки — toast.
  - Files: `package.json`, `pnpm-lock.yaml`, `src/components/tasks/{kanban-board,sortable-task-card,task-card}.tsx`, `src/components/projects/board-columns.tsx`, `src/app/(app)/w/[workspaceSlug]/projects/[projectId]/board/page.tsx`.

- [x] Task 5: Доступность и удобство (depends on 4)
  - **По факту:** объявления и инструкции — `board-announcements.ts`, reduced motion — хук `use-prefers-reduced-motion.ts` (`useSyncExternalStore`). Автопрокрутка — штатный `autoScroll` dnd-kit, вручную не проверялась. Мерцание при нескольких быстрых переносах подряд не проверялось (риск ниже остаётся).
  - `accessibility.announcements` и `screenReaderInstructions` на русском: «Взята задача #42 из «В работе»», «Задача #42 над «Готово», позиция 3 из 5», «Задача #42 перемещена в «Готово»», «Перемещение отменено». Названия колонок и ключи — из данных доски.
  - Автопрокрутка горизонтального контейнера доски при перетаскивании к краю (`autoScroll` dnd-kit работает с `overflow-x-auto` контейнером — проверить).
  - `prefers-reduced-motion`: без анимации `transition` у сортируемых карточек и `dropAnimation={null}`.
  - Во время перетаскивания `QuickCreateTask` колонки не мешает броску (кнопка ниже списка, droppable — вся колонка).
  - Индикатор сохранения: пока `isPending`, у перенесённой карточки нет «прыжка» назад при приходе revalidate (состояние сбрасывается только новыми пропсами).
  - Логирование: нет (UI).
  - Files: `src/components/tasks/{kanban-board,sortable-task-card}.tsx`, при необходимости `src/components/tasks/board-announcements.ts`.

- [x] Task 6: Сквозная проверка (depends on 4, 5)
  - **Проверено (2026-10-16, `next start` на :3000, скрипт Playwright, 12 проверок, стабильно в 2 прогонах подряд):** перестановка внутри колонки, перенос в пустую колонку и под карточку другой колонки (сохраняются после перезагрузки), статус на странице задачи, второй проект не затронут, клик и Enter открывают задачу, клавиатурный перенос (Space/стрелки/Space), Esc отменяет, устаревшая доска → toast «Доска изменилась, порядок обновлён» и обновление, перенумерация колонки при равных ключах на реальной БД; ошибок в консоли (включая гидрацию) нет; в логе сервера только ожидаемые WARN `CONFLICT`. `pnpm check` (412 тестов) и `pnpm build` зелёные. Не проверялись: тач-устройства, удаление статуса с задачами (код этого пути не менялся). Тестовые данные удалены.
  - Playwright-скрипт по образцу этапов «Проекты и статусы» / «Задачи» (`next start`, тестовые данные удаляются в конце): перенос карточки внутри колонки сохраняется после перезагрузки; перенос в другую колонку меняет статус на странице задачи; задача в двух проектах — перенос на одной доске не меняет другую; бросок в пустую колонку; клик по карточке открывает задачу, перетаскивание — нет; перетаскивание с клавиатуры (Tab на карточку, Space, стрелки, Space) сохраняется, а Enter открывает задачу; Esc отменяет; устаревшая доска (карточку-якорь убрали из проекта во второй вкладке) → toast и обновлённая доска; удаление статуса с задачами по-прежнему переносит карточки; в логе сервера нет ERROR, нет ошибок гидрации в консоли.
  - `pnpm check` и `pnpm build` зелёные.
  - Логирование: нет.
  - Files: — (скрипт проверки во временной директории, в репозиторий не коммитится).

<!-- Commit checkpoint: tasks 4-6 -->

## Риски и что проверить

- **Большие колонки.** `listColumn` читает всю колонку на каждое перемещение. Для сотен карточек приемлемо; если станет узким местом — заменить на два запроса соседей (`position > prev.position ORDER BY position LIMIT 1`).
- **Гонки перемещений.** Две параллельные вставки в одно место дают равные ключи — порядок детерминирован тай-брейком, следующее перемещение рядом перенумерует колонку. Блокировку колонки (`SELECT … FOR UPDATE`) не вводим; при проблемах — advisory lock по `(projectId, statusId)`, как `lockProject` в `projects`.
- **Сброс состояния при revalidate.** Если пользователь быстро делает несколько переносов, ответ на первый может прийти и сбросить локальное состояние до завершения второго — проверить на практике; при мигании — счётчик незавершённых переносов и сброс только когда их 0.
- **`Link` внутри сортируемого элемента.** Убедиться, что после перетаскивания не происходит навигация, а `Space` на карточке не прокручивает страницу.
- **dnd-kit и React 19 / SSR.** Проверить отсутствие предупреждений гидрации (`id` у `DndContext`) и работу в `next build` + `next start`.
- **Перенумерация и удаление статуса.** `deleteStatus` (модуль `projects`) переносит размещения, не меняя позиций — слитые колонки могут иметь равные ключи; `movePlacement` это переживает за счёт `rekey`.
- `pnpm check` и `pnpm build` должны оставаться зелёными после каждой commit-точки.
