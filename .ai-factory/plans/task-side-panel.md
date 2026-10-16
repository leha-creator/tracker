# План реализации: боковая панель задачи (как в Asana) и новая компоновка формы задачи

Branch: none (`git.create_branches: false`, работа в текущей ветке `main`)
Created: 2026-10-16

## Settings
- Testing: yes — только для логики (Vitest, `environment: node`): разбор параметра `?task`, построение ссылок панели, проверка адреса возврата после создания и удаления. Вёрстку проверять скриншотами Playwright на 1440 и 375 px.
- Logging: standard — изменения в основном в UI. В клиентских компонентах `console.*` запрещён (ESLint). В Server Actions — `createLogger('tasks.actions')`: `debug` для адреса перехода после создания и удаления, `warn`, если присланный `returnTo` отклонён. Новых `info`-логов не добавлять.
- Docs: yes — обязательный чекпоинт: `docs/architecture.md` (раздел «Задачи / доска / список» и навигация) и `AGENTS.md` (новая папка `src/components/tasks/task-panel/`, параметр `?task`).

## Roadmap Linkage
Milestone: "none"
Rationale: Skipped by user — подходящего этапа в ROADMAP.md нет (UX-доработка уже закрытых этапов «Задачи» и «Канбан-доска»).

## Контекст

### Что есть сейчас
- Клик по карточке доски (`kanban-board.tsx:322`) и по строке списка (`task-list-table.tsx:57`) уводит на отдельную страницу `/w/[slug]/tasks/[n]`. Доска пропадает.
- «Новая задача» (`ProjectNav`, пустой список, `/tasks`) ведёт на `/w/[slug]/tasks/new`. Это карточка `max-w-2xl` с формой в столбик. `createTaskAction` после успеха делает `redirect` на страницу задачи.
- Страница задачи (`tasks/[taskNumber]/page.tsx`) собрана из разрозненных блоков. Форма полей — обычные инпуты с подписями сверху и кнопкой «Сохранить». «Проекты» лежат в отдельной колонке 22rem. Вложения и комментарии идут ниже, под `border-t`. Нет единой шапки с действиями.
- `comment.actions.ts` и `attachment.actions.ts` вызывают `revalidatePath('/w/[workspaceSlug]/tasks/[taskNumber]', 'page')`. Если открыть задачу поверх доски, после комментария панель не обновится.
- Layout не получает `searchParams` (Next 16, `layout.md`). Поэтому панель рендерят страницы (доска, список проекта, `/tasks`), а не layout.

### Целевое поведение (по образцу Asana, скриншот `Снимок экрана 2026-10-16 134932.png`)
- Клик по карточке или строке открывает задачу **в панели справа**: `?task=<номер>`. Доска или список остаются слева. Ссылкой можно поделиться, после перезагрузки панель снова открыта. Остальные параметры URL (фильтры и сортировка списка) сохраняются.
- «Новая задача» открывает ту же панель в режиме создания: `?task=new`. Проект (и на доске — первый статус) выбран заранее. После создания панель переключается на созданную задачу (`?task=<n>`) на той же странице.
- Отдельные страницы `/tasks/[n]` и `/tasks/new` остаются (полноэкранный режим, кнопка «Развернуть» в панели) и используют ту же компоновку.
- Компоновка панели (сверху вниз):
  1. **Тулбар** (sticky): слева — ключ задачи (`TSK-12`, моноширинный, копируется кликом); справа иконки «Скопировать ссылку», «Развернуть» (→ `/tasks/[n]`), меню «⋯» (Удалить задачу), «Закрыть» (`→|`).
  2. **Крошки**: проекты задачи («Проект A / Проект B»).
  3. **Название** — крупное (text-2xl, semibold), без рамки, редактируется на месте (textarea с автовысотой).
  4. **Мета**: «Автор · создана … · изменена …» мелким muted-текстом.
  5. **Свойства** — сетка «подпись (8rem, muted) — значение»: Ответственный (аватар + select без рамки), Срок (дата, просроченный — красным), Приоритет (индикатор + select), Проекты (строки «● Проект — статус ▾ — ×» и «+ Добавить в проект»).
  6. **Описание** — заголовок «Описание», textarea без рамки с placeholder «Что нужно сделать?», рамка появляется при фокусе.
  7. **Вложения** — как сейчас, но в стиле секции панели.
  8. **Комментарии** — лента, а **форма комментария закреплена внизу панели** (sticky bottom, как в Asana).
- **Поля не выглядят как поля, пока их не трогают.** Открытая задача читается как готовый документ: без рамок, фона, стрелок у select и маски даты. При наведении появляется лёгкая обводка и курсор (`pointer` у выбора, `text` у текста), значит можно нажать. По нажатию (или фокусу с клавиатуры) — обычный вид поля. Подробности — Task 3a.
- Сохранение полей — **автоматическое**: select и дата сохраняются при изменении, название и описание — при blur и по `Ctrl/Cmd+Enter`. Вместо кнопки «Сохранить» — индикатор «Сохраняем… / Сохранено» в тулбаре. Ошибка — `toast.error` и подсветка поля.
- Раскладка: на `lg+` панель зафиксирована справа под шапкой приложения (`top: var(--app-header-h)`, ширина `min(42rem, 45vw)`), со своей прокруткой. `main` получает отступ справа и снимает `max-w-7xl`, чтобы доска занимала оставшееся место. На `< lg` панель открывается поверх контента на весь экран.
- `Esc` (вне открытых select и диалогов) закрывает панель. При открытии фокус переходит на заголовок панели. Активная карточка или строка подсвечивается (`aria-current="true"`).
- Если задача не найдена (удалена или чужая), панель показывает «Задача не найдена» с кнопкой «Закрыть», без 404 всей страницы.

### Архитектурные ограничения
- Компоненты не обращаются к Prisma: данные приходят из `@/modules/tasks`, `@/modules/projects`, `@/modules/workspaces` (как сейчас в `TaskAttachmentsSection`).
- Клиентские компоненты импортируют только `@/modules/*/client`.
- Доступ проверяется в сервисах (`requireWorkspaceAccessBySlug` в серверном компоненте панели и проверки внутри `getTaskByNumber` и др.).
- `returnTo` из формы — пользовательский ввод. Принимать только относительный путь внутри `/w/<slug>/` текущего пространства, без `//`, `\`, схемы и `..`. Иначе — запасной путь `/w/<slug>/tasks/<n>` (защита от open redirect).

## Tasks

### Phase 1: Адреса панели и серверная часть

- [x] **Task 1: Чистые функции адресов панели.**
  Создать `src/components/tasks/task-panel/task-panel-href.ts`:
  - `parseTaskPanelParam(raw: string | string[] | undefined): { mode: 'closed' } | { mode: 'new' } | { mode: 'view'; number: number }`. Номер проверять тем же правилом, что `taskNumberSchema` (положительное целое; импорт схемы из `@/modules/tasks/client`, если она там экспортирована, иначе добавить экспорт). Мусор → `closed`.
  - `taskPanelHref(pathname, search: URLSearchParams | string, task: number | 'new' | null): string` — ставит или убирает `task`, сохраняет остальные параметры. При смене задачи убирает `comments`.
  - `taskPageHref(slug, number)` — полноэкранная страница.
  - Тесты `task-panel-href.test.ts`: пустой и массивный параметр, `0`, `-1`, `1.5`, `abc`, `new`; сохранение фильтров списка; закрытие без лишнего `?`; сброс `comments`.
  - Логи: не нужны (чистые функции).

- [x] **Task 2: Возврат на исходную страницу после создания и удаления; ревалидация панели.**
  - `src/modules/tasks/slices/task/task-redirect.ts`: `resolveReturnPath(returnTo: unknown, workspaceSlug: string, fallback: string): string` — правила из раздела «Архитектурные ограничения». Тесты `task-redirect.test.ts`: внешний URL, `//evil`, `/w/other-slug/...`, `/w/slug/../x`, обратный слеш, пустое значение, корректный путь с query.
  - `task.actions.ts`:
    - `createTaskAction` читает необязательное поле `returnTo`. Если оно есть и прошло проверку, переход на `${returnTo}` с `task=<n>` (через `URLSearchParams`; функцию склейки положить рядом в `task-redirect.ts`). Иначе — как сейчас, `/tasks/<n>`.
    - `deleteTaskAction` с `returnTo` переходит на `returnTo` без `task` (панель закрывается), иначе на `/tasks`.
    - Логи: `log.debug({ to }, '[tasks.actions.create] redirect')` уже есть — сохранить. Добавить `log.warn({ action, workspaceSlug }, '[tasks.actions] returnTo rejected')`, если значение было, но не прошло проверку (сам `returnTo` в лог не писать целиком — обрезать до 200 символов).
  - `comment.actions.ts`, `attachment.actions.ts`: заменить `revalidatePath('/w/[workspaceSlug]/tasks/[taskNumber]', 'page')` на `revalidatePath('/w/[workspaceSlug]', 'layout')`, чтобы панель поверх доски и списка тоже обновлялась.
  - Экспортировать нужное через `src/modules/tasks/index.ts` / `client.ts` только если используется снаружи модуля.
  - Зависит от: —.

### Phase 2: Компоновка задачи

- [x] **Task 3: Строительные блоки «свойств» и полей без рамки.**
  - `src/components/tasks/task-panel/task-property.tsx`: `TaskPropertyList` (`dl`, сетка `grid-cols-[8rem_minmax(0,1fr)]`, на узких экранах подпись над значением) и `TaskProperty` (`dt` muted text-sm + `dd`, min-h-9, выравнивание по центру).
  - `task-fields.tsx`: у `PriorityField`, `DueDateField`, `AssigneeField` появляется вариант `variant="inline"`: без внешнего `Label`, подпись через `aria-labelledby` на `dt` свойства; триггер select — `variant ghost`-подобный (без рамки, рамка на hover и focus), ширина по содержимому. У ответственного внутри значения — `AssigneeAvatar`, у приоритета — индикатор из `priority-level.ts`, у просроченного срока — `text-destructive`. Добавить колбэк `onCommit?: () => void` (вызывается после выбора значения), чтобы форма сохранялась автоматически.
  - `TaskTitleField` (textarea с автовысотой через `field-sizing: content`, класс `text-2xl font-semibold`, без рамки, `maxLength=TASK_TITLE_MAX_LENGTH`, Enter не переносит строку, а делает commit) и `TaskDescriptionField variant="inline"` (без рамки до фокуса, placeholder «Что нужно сделать?», `min-h-24`). Обоим — `resize-none overflow-hidden field-sizing-content`: в покое нет уголка изменения размера и полосы прокрутки, textarea неотличима от заголовка и абзаца (`whitespace-pre-wrap`).
  - **Срок в inline-варианте** не показывает нативный `<input type="date">` в покое (маска `дд.мм.гггг` и значок выдают поле). В покое — кнопка с текстом даты через `formatDueDate(value, 'long')` из `due-date.tsx` (просроченная — `text-destructive`, пустая — «Без срока» muted). По нажатию кнопка заменяется на `input type=date` с `autoFocus` и `showPicker()` (в `try/catch`: не во всех браузерах доступен). `change` → `onCommit`, `blur` или `Esc` → снова текст. Кнопка «×» (очистить срок, `aria-label="Убрать срок"`) видна только при наведении или фокусе внутри строки. Скрытое поле `dueDate` хранит значение независимо от режима отображения.
  - Старый вариант по умолчанию не ломать, пока Task 5 и Task 8 не переведут всех пользователей; затем удалить неиспользуемое.
  - Логи: не нужны (клиентская вёрстка).

- [x] **Task 3a: Режим «чтения» для полей задачи: незаметные поля, обводка при наведении, поле при нажатии.**
  - Общие классы — константа `INLINE_FIELD` (и `INLINE_TEXT_FIELD` для название/описание) в `src/components/tasks/task-fields.tsx`, применяются через `className` к `SelectTrigger`, `Input`, `Textarea`. **`src/components/ui/*` не править** (генерируется shadcn CLI — правило AGENTS.md); всё переопределяется снаружи через `cn()` (tailwind-merge снимет конфликтующие классы).
  - Три состояния:
    - **покой:** `border-transparent bg-transparent shadow-none dark:bg-transparent`, стрелка `SelectTrigger` скрыта (`[&>svg:last-child]:opacity-0`), подпись значения обычным текстом. Пустые значения — muted-текст: «Не назначен», «Без срока», «Добавьте описание…». Приоритет «Без приоритета» — muted;
    - **наведение** (`hover:`): лёгкая обводка `hover:border-border/70` (в тёмной теме `dark:hover:border-border` и `dark:hover:bg-input/20`), стрелка проявляется (`hover:[&>svg:last-child]:opacity-100`), курсор `cursor-pointer` у select и кнопки срока, `cursor-text` у название и описания. Переход `transition-[border-color,background-color,opacity] duration-150`;
    - **фокус и редактирование** (`focus-visible:` / `focus:` / `data-[state=open]:`): обычный вид поля — `border-ring ring-3 ring-ring/50 bg-background`, стрелка видна. Для клавиатуры то же через `focus-visible`, чтобы без мыши поле находилось;
    - **ошибка:** `aria-invalid:border-destructive` действует и в покое.
  - Тач-устройства (`@media (hover: none)` — вариант `[@media(hover:none)]:` или кастомный variant в `globals.css`): без обводки при наведении, нажатие сразу открывает выбор или ввод.
  - Отступы: у полей `-mx-2 px-2` (текст стоит вровень с подписями и заголовком, а обводка выходит наружу), высота строки свойства не меняется между состояниями (никаких прыжков вёрстки).
  - Поле комментария внизу панели **не** использует режим чтения: это ввод, а не свойство задачи.
  - Логи: не нужны (клиентская вёрстка).
  - Зависит от: Task 3.

- [x] **Task 4: `TaskDetailsView` — единая компоновка просмотра задачи (для панели и для страницы).**
  - Новый серверный компонент `src/components/tasks/task-panel/task-details-view.tsx`. Пропсы: `session`, `workspace`, `taskNumber`, `variant: 'panel' | 'page'`, `closeHref?`, `returnTo`, `commentsMode`. Загружает задачу, участников, проекты и статусы через `Promise.all` (как сейчас страница). `NotFoundError` → в варианте `panel` рендерит `TaskPanelNotFound`, в варианте `page` вызывает `notFound()`.
  - Структура — разделы 1–8 из «Целевого поведения». Тулбар — клиентский `task-panel-toolbar.tsx`: копирование ссылки (`navigator.clipboard`, `toast.success('Ссылка скопирована')`), «Развернуть» (только в панели), меню `DropdownMenu` с «Удалить задачу» → `ConfirmActionDialog` в управляемом режиме (`open/onOpenChange`) с полем `returnTo`, «Закрыть» (`Link` на `closeHref`, `scroll={false}`). Иконки lucide (`Link2`, `Maximize2`, `MoreHorizontal`, `PanelRightClose`), у каждой `aria-label` и `title`.
  - `TaskDetailsForm` переписать: одна `<form>` вокруг названия, свойств и описания. Автосохранение через `form.requestSubmit()` из `onCommit`, blur и `Ctrl/Cmd+Enter`. Ничего не отправлять, если значения не изменились (сравнить `FormData` с последним сохранённым снимком в `useRef`). Убрать `key={task.updatedAt}` (иначе после сохранения пропадает фокус в соседнем поле). Пересоздание — только при смене задачи (`key={task.id}` у родителя). Состояние «Сохраняем… / Сохранено» показывать в тулбаре через `useFormStatus` или поднятое состояние. Ошибки: `toast.error(message)` + `aria-invalid` у поля.
  - Блок «Проекты» внутри свойств: переделать `TaskPlacements` и `AddToProjectForm` в компактные строки (`StatusDot` цвета первого статуса, название проекта — ссылка на доску, `StatusSelect` без рамки, кнопка `×` с `aria-label="Убрать из проекта «…»"` + существующий `ConfirmActionDialog`). «+ Добавить в проект» по клику раскрывает inline два select и кнопку.
    - `StatusSelect` (сейчас `w-44` с рамкой, `task-fields.tsx`) получает `variant="inline"` с классами из Task 3a, ширина по содержимому. Строка проекта — `group`; кнопка `×` видна только при `group-hover` / `group-focus-within` (`opacity-0 group-hover:opacity-100 group-focus-within:opacity-100`, на тач-устройствах видна всегда). «+ Добавить в проект» — приглушённая текстовая кнопка (`text-muted-foreground hover:text-foreground`), без рамки. Раскрытые селекты добавления — в обычном виде полей (это активный ввод).
  - Вложения: `TaskAttachmentsSection` — заголовок секции в едином стиле (`text-sm font-semibold`), сетка миниатюр в одну колонку при ширине панели < 32rem (container query `@container`).
  - Комментарии: лента в теле панели. `CommentForm` в варианте `panel` — `sticky bottom-0` с фоном, верхней границей и компактным полем, раскрывающимся при фокусе. Ссылку «Показать все» в `CommentList` строить через `taskPanelHref(..., { comments: 'all' })` / `taskHref` — передавать готовый `showAllHref` вместо склейки `?comments=all` (сейчас ломает уже существующие параметры).
  - Логи: серверных побочных эффектов нет; чтения логируются в сервисах модулей как сейчас.
  - Зависит от: Task 1, Task 2, Task 3, Task 3a.

- [x] **Task 5: Форма создания в той же компоновке.**
  - `CreateTaskForm` → компоновка как у просмотра: тулбар «Новая задача» + «Закрыть»; крупное поле названия с `autoFocus` и placeholder «Название задачи»; свойства (Ответственный, Срок, Приоритет, «Проект» = select проекта + `StatusSelect`); описание. Внизу sticky-футер: «Создать задачу» (primary) и «Отмена» (ghost, ссылка на `closeHref`). `Ctrl/Cmd+Enter` отправляет форму.
  - Новые пропсы: `defaultStatusId?`, `returnTo?`, `closeHref?`, `variant`. Скрытое поле `returnTo`.
  - Серверная обёртка `src/components/tasks/task-panel/task-create-view.tsx`: грузит участников, проекты и статусы (как `tasks/new/page.tsx`).
  - Поля формы создания — те же inline-поля из Task 3a (покой, наведение, фокус), чтобы новая задача выглядела так же, как открытая. Исключение — название: при открытии оно сразу в фокусе и выглядит как поле.
  - Зависит от: Task 2, Task 3, Task 3a.

### Phase 3: Панель и подключение

- [x] **Task 6: Оболочка панели и раскладка страницы.**
  - `src/components/tasks/task-panel/task-panel.tsx` (сервер): принимает `workspaceSlug`, `searchParams` (Promise), `basePath`, `defaults` (`projectId`, `statusId`) и разбирает `?task` через `parseTaskPanelParam`. `closed` → `null`. `new` → `TaskCreateView`. `view` → `TaskDetailsView variant="panel"`. Оборачивается в `TaskPanelFrame` и собственный `Suspense` со скелетоном панели (тулбар, полоса заголовка, 4 строки свойств), чтобы доска не ждала панель.
  - `task-panel-frame.tsx` (клиент): `<aside data-task-panel aria-labelledby="task-panel-title">`. На `lg+` — `fixed right-0 bottom-0 top-[var(--app-header-h)] w-[min(42rem,45vw)] border-l bg-background shadow-xl` со своей прокруткой (`overflow-y-auto`, `overscroll-contain`). На `< lg` — `fixed inset-0 z-50` поверх контента. `Esc` закрывает (`router.push(closeHref, { scroll: false })`), если событие не перехвачено открытым select или диалогом (`event.defaultPrevented`). При смене `task` фокус переходит на заголовок (`tabIndex={-1}`). Анимация появления `motion-safe:` slide-in 150 ms.
  - `globals.css`: на `lg+` `main:has([data-task-panel])` получает `max-width: none` и `margin-right: min(42rem, 45vw)`. Доска (`[data-board]`) продолжает занимать высоту экрана. Проверить, что `edge-fade-x` и горизонтальная прокрутка доски работают с суженной шириной.
  - Логи: не нужны (клиентская вёрстка); при ошибке загрузки задачи — существующие логи сервисов.
  - Зависит от: Task 4, Task 5.

- [x] **Task 7: Подключить панель на доске, в списках и в кнопках «Новая задача».**
  - `projects/[projectId]/board/page.tsx`: принимать `searchParams`, рядом с `BoardSection` рендерить `<TaskPanel basePath={boardPath} defaults={{ projectId }} />` (первый статус проекта как статус по умолчанию — передавать из `listStatuses`, уже загружаемого в `BoardSection`, или выбирать в `TaskCreateView`).
  - `projects/[projectId]/list/page.tsx` и `tasks/page.tsx`: так же, `basePath` — текущий путь списка.
  - `KanbanBoard` / `SortableTaskCard` / `TaskCard`: `href` карточки строить через `taskPanelHref(pathname, searchParams, card.number)` (`usePathname` + `useSearchParams` в клиентской доске; доска уже клиентская), `scroll={false}`. Активная карточка: `aria-current="true"` + `ring-2 ring-primary/40`. То же в `DragOverlay` (`kanban-board.tsx:259`).
  - `TaskListTable`: ссылки строк через `taskPanelHref`, активная строка подсвечена `bg-muted`. Таблица — серверный компонент: передавать готовый `rowHref(number)` нельзя (функция), поэтому передать `basePath` + текущий `search` (строка) и строить href на сервере той же чистой функцией.
  - `ProjectNav.newTaskHref`, «Новая задача» в `TaskListEmpty` проекта и на `/tasks` → `?task=new` на текущей странице. На доске «Новая задача» ведёт на `${boardPath}?task=new`.
  - Пагинация, фильтры и сортировка списка строятся из `TaskListQuery` и сбрасывают `task` — это допустимо (панель закрывается при смене страницы). Проверить, что `parseTaskListParams` игнорирует `task` и `comments`.
  - Зависит от: Task 1, Task 6.

- [x] **Task 8: Полноэкранные страницы на новой компоновке.**
  - `tasks/[taskNumber]/page.tsx` → `TaskDetailsView variant="page"` внутри `PageContainer size="narrow"`-подобной колонки (`max-w-3xl mx-auto`). Тулбар без «Развернуть», «Закрыть» → `/w/<slug>/tasks`. Комментарии — та же sticky-форма внизу.
  - `tasks/new/page.tsx` → `TaskCreateView variant="page"` (без `returnTo`: после создания — на `/tasks/<n>`, как сейчас).
  - Удалить из `task-fields.tsx`, `task-details-form.tsx`, `create-task-form.tsx` код старых вариантов, ставший неиспользуемым.
  - Зависит от: Task 4, Task 5.

### Phase 4: Проверка и документация

- [x] **Task 9: Проверка.**
  - `pnpm check` (typecheck, lint, format, test) — без ошибок.
  - Playwright на `localhost:3000` (данные `/w/design-audit` или новое пространство), скриншоты 1440 и 375 px:
    - доска → клик по карточке → панель справа, доска видна и прокручивается; `Esc` закрывает; перезагрузка с `?task=N` открывает панель;
    - смена ответственного, срока, приоритета, статуса в проекте → «Сохранено», карточка на доске обновилась без перезагрузки;
    - правка названия → blur → сохранено, фокус не потерян;
    - комментарий и вложение в панели → лента обновилась (проверка ревалидации из Task 2);
    - «Новая задача» на доске → панель создания с выбранным проектом → создание → панель показывает новую задачу, карточка появилась в первой колонке;
    - список с фильтром → открыть задачу → фильтр в URL сохранён; закрыть — фильтр на месте;
    - удаление из панели → панель закрыта, остались на доске;
    - `?task=999999` и `?task=abc` → «Задача не найдена» и закрытая панель соответственно, без 404 страницы;
    - `returnTo=https://evil.example` в форме (DevTools) → переход на `/tasks/<n>`, в логе `warn`;
    - 375 px: панель на весь экран, нет горизонтальной прокрутки страницы, кнопка «Закрыть» доступна;
    - режим чтения (Task 3a), светлая и тёмная тема: скриншот панели без наведения — ни одной видимой рамки, фона поля, стрелки select или маски даты; наведение на ответственного, срок и описание — лёгкая обводка и правильный курсор (`getComputedStyle(el).cursor`); нажатие — обычный вид поля; между состояниями высота строк не меняется;
    - срок: нажатие открывает выбор даты, выбор сохраняет и возвращает текст, «×» очищает; пустой срок показывает «Без срока».
  - Проверить клавиатуру: Tab по тулбару, свойствам и форме комментария; видимый фокус; `aria-current` на активной карточке.
  - Зависит от: Task 7, Task 8.

- [x] **Task 10: Документация.**
  - `docs/architecture.md`: раздел о задачах, доске и списке — панель `?task`, режимы `new`/`view`, `returnTo` и его проверка, ревалидация комментариев и вложений через layout пространства, автосохранение полей.
  - `AGENTS.md`: в дереве `src/components/tasks/` добавить `task-panel/` (панель задачи: оболочка, просмотр, создание, адреса `?task`); в «Ключевых точках входа» ничего не менять, если публичный API модулей не изменился.
  - Зависит от: Task 9.

## Commit Plan
- **Commit 1** (после Task 1–2): `feat(tasks): task panel URL helpers and safe return path after create/delete`
- **Commit 2** (после Task 3, 3a, 4, 5): `feat(tasks): Asana-like task layout with inline properties and autosave`
- **Commit 3** (после Task 6–8): `feat(tasks): open and create tasks in a side panel on board and lists`
- **Commit 4** (после Task 9–10): `docs: task side panel`
