# План реализации: визуальные исправления настроек проекта и drag and drop статусов

Branch: none (full-план без ветки, `git.create_branches: false`; работа в текущей ветке `main`)
Created: 2026-10-16

## Settings
- Testing: yes — только для логики (Vitest, `environment: node`): `StatusSet.moveAfter`, чистая функция перестановки статусов, сервис `moveStatus`. Вёрстку проверять скриншотами Playwright на 1440 и 375 px в светлой и тёмной теме.
- Logging: verbose для серверной части — `createLogger(scope)` в сервисе статусов: `debug` на старте, `info` по итогу, `warn` при отказе. В клиентских компонентах `console.*` запрещён (ESLint), ошибки показываются через `toast`.
- Docs: yes — обязательный docs-чекпоинт в конце: `docs/architecture.md` (раздел «Проекты и статусы»), `AGENTS.md`, если меняется структура (перенос хука в `src/lib/`).

## Roadmap Linkage
Milestone: "none"
Rationale: этап «Проекты и статусы» в ROADMAP.md уже закрыт; это доработка UI без отдельного этапа.

## Контекст: найденные визуальные баги

Источник: разбор кода `src/app/(app)/w/[workspaceSlug]/projects/[projectId]/settings/page.tsx` и `src/components/projects/*`. Живой осмотр не удался: dev-сервер отвечал 500 (`Jest worker encountered 2 child process exceptions`). Каждый пункт подтвердить в браузере в задаче 9.

1. **Строка статуса на мобильных разваливается.** На 375 px внутри строки остаётся около 285 px: отступы страницы 16×2, карточки 16×2, `li` p-3 и рамка. Два селекта `w-36` + gap дают 296 px, поэтому `flex-wrap` раскидывает элементы как попало. Точка цвета остаётся одна на строке или отрывается от поля, селекты встают лесенкой, группа `ml-auto` (стрелки, счётчик, «Удалить») прыгает на отдельную строку, и выравнивание у каждой строки своё.
2. **Счётчик задач — голая цифра** с подсказкой только в `title`: на касание подсказка не появляется, скринридер читает просто «3».
3. **Кнопка «Удалить»** сделана текстовой ghost-кнопкой и не отличается от остальных. Когда статус единственный, причина блокировки лежит в `title` на `disabled`-кнопке, а такая подсказка не показывается.
4. **«Сохранить» у каждой строки активна всегда**, даже если в ней ничего не меняли: в списке N одинаковых кнопок.
5. **Ширина селектов зашита** (`w-36` в `status-selects.tsx`), растянуть их на мобильных нельзя.
6. **Форма добавления статуса** выровнена иначе, чем строки, и не показывает выбранный цвет (нет `StatusDot`).
7. **«Опасная зона» без красной рамки:** у `Card` обводка сделана через `ring-1 ring-foreground/10`, без `border`, поэтому `className="border-destructive/40"` ничего не меняет.
8. **Скелетон страницы** — один прямоугольник `h-64`, по форме он не похож на три карточки настроек.
9. **Порядок меняется только стрелками ↑/↓:** каждое нажатие — отдельный запрос и перерисовка, перенести статус через несколько позиций неудобно. Это и есть запрос на drag and drop.

## Решение по drag and drop (сводка)

- dnd-kit уже стоит (`@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2). Паттерны берём с доски (`src/components/tasks/kanban-board.tsx`): сенсоры Pointer, Touch и Keyboard, локальное состояние со сбросом при новых данных с сервера, `startTransition` + action с объектом-аргументом, при ошибке `toast.error` и `router.refresh()`, русские объявления для скринридера, `usePrefersReducedMotion`.
- Тянуть можно **только за ручку** (`GripVertical`, `setActivatorNodeRef`), чтобы поля и селекты в строке работали как обычно. Движение ограничено вертикальной осью (свой модификатор на несколько строк, без новой зависимости `@dnd-kit/modifiers`).
- Сервер получает `prevStatusId` (`null` — в начало), так же как `movePlacementAction` получает `prevTaskId`. Если набор статусов успел измениться на сервере, перестановка остаётся корректной. Неизвестный `prevStatusId` даёт `NOT_FOUND`, клиент откатывает порядок.
- Стрелки ↑/↓ убираем: с клавиатуры статус переносится ручкой (Space — взять, стрелки — двигать, Space — отпустить, Escape — отменить). Старый `direction` в модели, схеме, сервисе и action удаляем, чтобы не держать два пути.

## Tasks

### Phase 1: Серверная перестановка по `prevStatusId`

- [x] **Task 1: `StatusSet.moveAfter` вместо `move(direction)`**
  - Файлы: `src/modules/projects/models/status-set.ts`, `src/modules/projects/models/status-set.test.ts`.
  - Метод `moveAfter(id: string, prevId: string | null): boolean` ставит статус сразу после `prevId` (`null` — первым). Возвращает `false`, если порядок не изменился (статус уже стоит после `prevId`). Ошибки: `NotFoundError` при неизвестном `id` или `prevId`, `ValidationError` при `prevId === id`. Позиции после перестановки по-прежнему 0..n-1 (геттер `statuses`).
  - Удалить `move(direction)` и тип `StatusDirection`, убрать его из `models/index.ts` и `client.ts`, если он там экспортируется.
  - Тесты (замена блока `StatusSet.move`): в начало (`null`), в конец, в середину вниз и вверх, no-op на месте, `prevId === id`, неизвестные `id` и `prevId`.
  - Логирование: в модели нет (чистый доменный код).

- [x] **Task 2: схема, сервис и action перестановки** (зависит от Task 1)
  - Файлы: `src/modules/projects/slices/status/status.schema.ts`, `status.service.ts`, `status.actions.ts`, `status.service.test.ts`, `status.schema.test.ts`, `src/modules/projects/client.ts`.
  - `moveStatusSchema`: `{ workspaceId, projectId, statusId, prevStatusId: entityIdField.nullable() }` вместо `direction`.
  - `moveStatus(session, { …ref, statusId, prevStatusId })`: `assertIds` проверяет и `prevStatusId`, когда он не `null`. Внутри `mutateStatusSet(..., 'move', set => set.moveAfter(...))`. Если порядок не изменился, `saveSet` не вызывается. Посмотреть, умеет ли `mutateStatusSet` пропускать сохранение; если нет — добавить такую возможность, сохранив транзакцию и проверку права `manageProjects`.
  - `moveStatusAction(raw: { workspaceId; projectId; statusId; prevStatusId: string | null }): Promise<ActionResult<null>>` — по образцу `movePlacementAction`: не форма, `revalidateWorkspace()` только при успехе, ошибка через `toActionError(error, { action: 'moveStatus' })`.
  - Тесты сервиса: сохранённые позиции после переноса в начало и в середину, `NOT_FOUND` для `prevStatusId` из другого проекта, без `saveSet` при no-op. Тест схемы: `prevStatusId: null` проходит, мусорный id отклоняется.
  - Логирование: `log.debug({ userId, workspaceId, projectId, statusId, prevStatusId }, '[status.moveStatus] start')`; `log.info({ projectId, statusId, prevStatusId, moved }, '[status] moved')`; ошибки доступа и валидации уже логирует `toActionError` — второй раз не логировать.

- [x] **Task 3: чистая функция перестановки для клиента** (зависит от Task 1)
  - Файлы: `src/modules/projects/models/status-order.ts` (новый), `status-order.test.ts` (новый), экспорт через `models/index.ts` и `client.ts`.
  - `reorderStatuses<T extends { id: string }>(items: T[], activeId: string, overId: string): { items: T[]; prevStatusId: string | null } | null` — `arrayMove` по индексам и `prevStatusId` нового места; `null`, если `activeId === overId` или id не найден. Зависеть от `@dnd-kit/sortable` модель не должна: перестановку написать самим (несколько строк).
  - Тесты: перенос вниз и вверх, в начало (`prevStatusId: null`), в конец, на то же место, неизвестный id.
  - Логирование: нет (чистая функция).

### Phase 2: Вёрстка настроек

- [x] **Task 4: перенести `usePrefersReducedMotion` в общее место**
  - Файлы: `src/components/tasks/use-prefers-reduced-motion.ts` → `src/lib/use-prefers-reduced-motion.ts`; обновить импорт в `src/components/tasks/kanban-board.tsx`.
  - Проверить, что правила границ в `eslint.config.mjs` (блок `src/components/**`) разрешают импорт из `@/lib/*`.
  - Логирование: нет.

- [x] **Task 5: новая раскладка строки статуса** (баги 1–5)
  - Файлы: `src/components/projects/status-row.tsx`, `src/components/projects/status-selects.tsx`.
  - Раскладка (grid, не `flex-wrap`):
    - строка 1: ручка (место под `GripVertical`, подключается в Task 7) · `StatusDot` · поле названия (`min-w-0 flex-1`) · счётчик · кнопка удаления;
    - строка 2 на мобильных: категория и цвет по 50% (`grid-cols-2`) и «Сохранить»; на `sm+` всё в одну строку, а селекты фиксированной ширины.
    - Сверить на 375 px: ширина страницы не больше viewport, элементы не переносятся по-разному в разных строках.
  - `CategorySelect` / `ColorSelect`: принимать `className` для триггера (по умолчанию `w-36`), на мобильных — `w-full`.
  - Счётчик: видимый текст с правильным склонением («3 задачи», «нет задач») мелким `text-muted-foreground`. Функцию `tasksLabel` из `delete-status-dialog.tsx` вынести в общий файл `src/components/projects/tasks-label.ts` и использовать в обоих местах.
  - Удаление: icon-кнопка `Trash2` (`size="icon-sm"`, `variant="ghost"`, `hover:text-destructive`) с `aria-label="Удалить статус «…»"`. Для единственного статуса кнопку не показывать, а под списком вывести видимую подсказку «В проекте должен остаться хотя бы один статус» (в `status-list.tsx`).
  - «Сохранить» неактивна, пока название, категория и цвет совпадают с сохранёнными (сравнить с `status`; название — через управляемое состояние или `onInput`).
  - Стрелки ↑/↓ и `moveStatusAction` в виде формы из строки удалить (перестановка — в Task 7).
  - Логирование: нет (клиент); ошибки остаются в `role="alert"` под строкой.

- [x] **Task 6: форма добавления, «Опасная зона», скелетон** (баги 6–8; зависит от Task 5)
  - Файлы: `src/components/projects/add-status-form.tsx`, `src/app/(app)/w/[workspaceSlug]/projects/[projectId]/settings/page.tsx`.
  - `AddStatusForm` повторяет сетку строки из Task 5: пустое место под ручку, `StatusDot` выбранного цвета, поле, селекты (`w-full` на мобильных), «Добавить». Визуально отделить её от списка (`border-dashed` или `bg-muted/40`), чтобы она не выглядела очередным статусом.
  - «Опасная зона»: `className="ring-destructive/30"` вместо неработающего `border-destructive/40`; проверить в тёмной теме.
  - Скелетон `Suspense`: три блока по форме карточек (заголовок + 2–3 полосы), `animate-pulse`, `aria-hidden`.
  - Логирование: нет.

### Phase 3: Drag and drop

- [x] **Task 7: сортируемый список статусов** (зависит от Tasks 2, 3, 4, 5)
  - Файлы: `src/components/projects/status-list.tsx` (станет `'use client'`), `src/components/projects/sortable-status-row.tsx` (новый) или `useSortable` прямо в `status-row.tsx`, `src/components/projects/status-announcements.ts` (новый).
  - `DndContext` + `SortableContext` с `verticalListSortingStrategy`; `id` через `useId()` (как `dndId` на доске) против рассинхрона гидратации.
  - Сенсоры: `PointerSensor` (`distance: 4`), `TouchSensor` (`delay: 200, tolerance: 6`), `KeyboardSensor` с `sortableKeyboardCoordinates`. Слушатели и `attributes` — только на ручке (`setActivatorNodeRef`, `<button type="button" aria-label="Перетащить статус «…»" className="cursor-grab touch-none">`).
  - Модификатор вертикальной оси — локальная функция `({ transform }) => ({ ...transform, x: 0 })`.
  - Состояние: локальный порядок `order` и `serverStatuses` со сбросом при новом `statuses` с сервера (паттерн `serverCards` с доски). В `onDragEnd` вызвать `reorderStatuses(...)`; если результат `null` — ничего не делать. Иначе сразу применить новый порядок и в `startTransition` вызвать `moveStatusAction({ ..., prevStatusId })`. При ошибке — `toast.error(result.error.message)`, вернуть порядок с сервера и `router.refresh()`.
  - Пока запрос идёт, ручки неактивны (`pending` из `useTransition`), чтобы не отправлять перестановки параллельно.
  - Строка во время перетаскивания: `opacity-60` + `shadow` + `ring-2 ring-primary/40`, `transition: null` при `prefers-reduced-motion`. `Card` обрезает содержимое (`overflow-hidden`): если строку у края обрезает, использовать `DragOverlay` с копией строки только для чтения.
  - `key` строки не должен меняться при перестановке: сейчас ключ собран из полей без позиции — так и оставить.
  - `status-announcements.ts`: русские `screenReaderInstructions` и `announcements` (взят / позиция N из M / перемещён / отменено) по образцу `board-announcements.ts`.
  - Подпись в `CardDescription` на странице: «Перетащите статус за ручку, чтобы изменить порядок колонок доски».
  - Логирование: на клиенте `console.*` нет; серверную часть логирует Task 2.

### Phase 4: Проверка и документация

- [x] **Task 8: прогон проверок** (зависит от Tasks 1–7)
  - `pnpm check` (typecheck, lint, format:check, test) — без ошибок. Убедиться, что не осталось ссылок на `StatusDirection`, `direction` и `move(` старой модели (`rg "StatusDirection|direction: 'up'"`).

- [x] **Task 9: визуальная проверка в браузере** (зависит от Task 8)
  - Нужен рабочий dev-сервер (`pnpm dev`; если снова падает jest-worker — перезапустить его).
  - Playwright: настройки проекта с 4–6 статусами, один из них с задачами. Проверить:
    - 1440 и 375 px, светлая и тёмная темы: строки выровнены одинаково, `document.documentElement.scrollWidth === innerWidth`, у «Опасной зоны» видна красная обводка;
    - перетаскивание мышью (`browser_drag`) и с клавиатуры (Tab до ручки, Space, ↓, Space): порядок сохраняется после перезагрузки и совпадает с колонками доски;
    - откат: перетаскивание при удалённом на сервере соседнем статусе даёт toast и возвращает порядок;
    - единственный статус: кнопки удаления нет, подсказка видна.
  - Если найдутся баги, которых нет в списке выше, — исправить в рамках задач 5–7.

- [x] **Task 10: документация** (зависит от Task 9)
  - `docs/architecture.md`, раздел про проекты и статусы: перестановка перетаскиванием, контракт `moveStatusAction({ …, prevStatusId })`, чистая функция `reorderStatuses`.
  - `AGENTS.md`: упомянуть `src/lib/use-prefers-reduced-motion.ts` в структуре; в строке `src/modules/projects/index.ts` отметить `client.ts` с `moveStatusAction` и `reorderStatuses`.

## Commit Plan
- **Commit 1** (после Tasks 1–3): `feat(projects): move status after a given status instead of up/down`
- **Commit 2** (после Tasks 4–6): `fix(projects): settings layout on mobile, status row actions and danger zone ring`
- **Commit 3** (после Tasks 7–10): `feat(projects): reorder statuses with drag and drop`
