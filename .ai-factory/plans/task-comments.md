# План реализации: Комментарии к задачам

Branch: none (main; `git.create_branches: false`)
Created: 2026-10-16

## Settings
- Testing: yes (Vitest)
- Logging: standard (INFO на изменениях, WARN на отказах и «не найдено»; чтения — `debug`)
- Docs: yes  # обязательный docs checkpoint в /aif-implement через /aif-docs

## Roadmap Linkage
Milestone: "Комментарии к задачам"
Rationale: План покрывает этап целиком: участники пространства обсуждают задачу на её странице.

## Рамки этапа

**Входит:**
- Блок «Комментарии» на странице задачи `/w/[workspaceSlug]/tasks/[taskNumber]`: лента в хронологическом порядке (старые сверху), форма добавления внизу.
- Комментарий — простой текст (1–5000 символов), переносы строк сохраняются.
- Автор, дата создания, пометка «изменён» после редактирования.
- Добавить комментарий может любой участник пространства.
- Редактировать — только автор. Удалить — автор или владелец пространства (то же правило, что у удаления задачи).
- Удаление задачи удаляет её комментарии (каскад).
- По умолчанию показываются последние 50 комментариев; если их больше — ссылка «Показать все (N)» (`?comments=all`).

**Не входит:**
- Rich-text / Markdown, упоминания `@user`, реакции, ответы-треды.
- Вложения в комментариях (этап «Вложения»).
- Уведомления по почте и обновление в реальном времени.
- Счётчик комментариев на карточке доски и в строке списка.
- История правок и журнал активности задачи.

## Ключевые решения

- **Модель БД `TaskComment`** (новая миграция `add_task_comments`):
  ```prisma
  model TaskComment {
    id          String    @id @default(uuid(7)) @db.Uuid
    workspaceId String
    taskId      String    @db.Uuid
    /// Автор; null — пользователь удалён (комментарий остаётся).
    authorId    String?
    /// Простой текст.
    body        String
    createdAt   DateTime  @default(now())
    updatedAt   DateTime  @updatedAt
    /// Момент последнего редактирования текста; null — не редактировался.
    editedAt    DateTime?

    task   Task  @relation(fields: [taskId, workspaceId], references: [id, workspaceId], onDelete: Cascade)
    author User? @relation("TaskCommentAuthor", fields: [authorId], references: [id], onDelete: SetNull)

    @@index([taskId, createdAt])
    @@index([workspaceId])
  }
  ```
  - Составной FK `(taskId, workspaceId)` → `Task(id, workspaceId)`: комментарий не окажется в чужом пространстве (как у `TaskPlacement`).
  - Обратные связи: `Task.comments TaskComment[]`, `User.taskComments TaskComment[] @relation("TaskCommentAuthor")`.
  - Отдельный `editedAt`, а не `updatedAt`: `updatedAt` меняется при любом `update`, а пометка «изменён» нужна только при смене текста.
  - Выход участника из пространства комментарии не трогает: пользователь существует, имя автора остаётся.
- **Срез `slices/comment/` в модуле `tasks`** — как в `ARCHITECTURE.md`. Файлы: `comment.schema.ts`, `comment.repository.ts`, `comment.service.ts`, `comment.actions.ts`, `comment.dto.ts`.
- **Правила — в модели `models/task-comment.ts`** (чистый TS): `TASK_COMMENT_MAX_LENGTH = 5000`, `TASK_COMMENTS_PAGE_SIZE = 50`, `normalizeCommentBody` (trim, `\r\n` → `\n`, не более двух пустых строк подряд), `canEditComment` / `assertCanEditComment` (только автор), `canDeleteComment` / `assertCanDeleteComment` (автор или `owner`).
- **Защита от IDOR.** Каждая операция: `requireWorkspaceAccess(session, workspaceId)` → задача по `id` + `workspaceId` (иначе `NotFoundError('Задача не найдена')`) → комментарий по `id` + `taskId` + `workspaceId` (иначе `NotFoundError('Комментарий не найден')`). Невалидный UUID — `NotFoundError` без запроса к БД (`isEntityId`). Изменения — через `updateMany` / `deleteMany` с тем же `where`, `count === 0` → `NotFoundError`.
- **Чтение.** `listTaskComments(session, workspaceId, taskId, { all })` → `TaskCommentsDto { items: TaskCommentDto[], total, truncated }`. Последние `TASK_COMMENTS_PAGE_SIZE` берутся `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]` и разворачиваются; `count` и `findMany` — в одной `prisma.$transaction([...])`. `all = true` — без `take`. Флаги `canEdit` / `canDelete` вычисляются на сервере для текущего пользователя.
- **DTO.** `TaskCommentDto { id, body, author: TaskUserDto | null, createdAt: Date, editedAt: Date | null, canEdit, canDelete }`. Используется существующий `toUserDto`.
- **Server Actions** (`FormState` + `useActionState`, как у задач): `createCommentAction`, `updateCommentAction`, `deleteCommentAction`. Ревалидация — только страница задачи: `revalidatePath('/w/[workspaceSlug]/tasks/[taskNumber]', 'page')`. Перед реализацией проверить сигнатуру в `node_modules/next/dist/docs` (раздел `revalidatePath`); если вариант с типом `'page'` для динамического сегмента не подходит — использовать `'/w/[workspaceSlug]', 'layout'`, как остальные actions модуля.
- **Безопасность вывода.** Текст выводится как обычный текст React (`whitespace-pre-wrap break-words`), без `dangerouslySetInnerHTML` — XSS исключён без санитайзера.
- **UI.** Блок комментариев — отдельный `<Suspense>` на странице задачи: поля задачи показываются, не дожидаясь комментариев. Даты форматируются на сервере (`Intl.DateTimeFormat('ru')`) и передаются в клиентские компоненты строками вместе с `dateTime` для `<time>` — иначе разные часовые пояса сервера и браузера дадут hydration mismatch. Форма добавления после успеха очищается (смена `key` формы по счётчику успешных отправок). `Ctrl/⌘+Enter` отправляет форму. Удаление — через существующий `ConfirmActionDialog`.

## Commit Plan
- **Commit 1** (после задач 1–3): `feat(tasks): add task comments model, service and actions`
- **Commit 2** (после задач 4–5): `feat(task-page): comments section on task page`

## Tasks

### Phase 1: Данные и домен

- [x] Task 1: Модель `TaskComment` в схеме и миграция
  - `prisma/schema.prisma`: модель `TaskComment` (см. «Ключевые решения»), связи `Task.comments` и `User.taskComments` (`@relation("TaskCommentAuthor")`). Раздел-комментарий `// ── Комментарии ──` с пояснением про составной FK.
  - `pnpm db:migrate --name add_task_comments`; проверить SQL: составной FK на `Task("id","workspaceId")` с `ON DELETE CASCADE`, FK на `User` с `ON DELETE SET NULL`, индексы.
  - Логирование: нет (схема).
  - Files: `prisma/schema.prisma`, `prisma/migrations/<ts>_add_task_comments/migration.sql`.

- [x] Task 2: Доменная модель комментария (depends on 1)
  - `src/modules/tasks/models/task-comment.ts`: константы `TASK_COMMENT_MAX_LENGTH`, `TASK_COMMENTS_PAGE_SIZE`; `normalizeCommentBody(body)`; `canEditComment(comment: { authorId: string | null }, actor)`, `assertCanEditComment` → `ForbiddenError('Редактировать комментарий может только его автор')`; `canDeleteComment`, `assertCanDeleteComment` → `ForbiddenError('Удалить комментарий может его автор или владелец пространства')`. Тип актёра — как `TaskActor` в `models/task.ts` (`{ userId, role }`).
  - `models/index.ts` — реэкспорт; `client.ts` — экспорт `TASK_COMMENT_MAX_LENGTH`.
  - Тесты `task-comment.test.ts`: нормализация (trim, `\r\n`, схлопывание пустых строк, сохранение одиночных переносов); автор может редактировать и удалять; владелец — только удалять; участник — ничего; `authorId = null` (удалённый пользователь) — редактировать не может никто, удалить может владелец.
  - Логирование: модели не логируют.
  - Files: `src/modules/tasks/models/{task-comment,task-comment.test,index}.ts`, `src/modules/tasks/client.ts`.

- [x] Task 3: Срез `comment`: схема, репозиторий, сервис, actions, публичный API (depends on 2)
  - **По факту:** `updateComment` и `deleteComment` не загружают задачу отдельно: `where` комментария уже содержит `taskId` + `workspaceId`. `listTaskComments` тоже не проверяет задачу (страница её уже загрузила), фильтр — `workspaceId` + `taskId`. Существование задачи при создании — `commentRepository.taskExists`.
  - `comment.schema.ts` (Zod): `createCommentSchema { workspaceId, taskId, body }`, `updateCommentSchema { workspaceId, taskId, commentId, body }`, `deleteCommentSchema { workspaceId, taskId, commentId }`. `body` — `string → normalizeCommentBody → min(1, 'Напишите комментарий') → max(TASK_COMMENT_MAX_LENGTH)`. Переиспользовать `workspaceIdField` и `entityIdField` из `task.schema.ts`.
  - `comment.repository.ts` (`server-only`): `COMMENT_SELECT` (`id, body, authorId, createdAt, editedAt, author: { id, name, image }`); `listForTask(workspaceId, taskId, take?)` → `prisma.$transaction([count, findMany])`; `find(workspaceId, taskId, commentId)`; `create(data)`; `updateBody(workspaceId, taskId, commentId, body)` (ставит `editedAt: new Date()`, возвращает `count`); `delete(...)` → `count`. Существование задачи — через `taskRepository.findById` (или лёгкий `exists` в `comment.repository`, если `TASK_SELECT` избыточен).
  - `comment.dto.ts`: `TaskCommentDto`, `TaskCommentsDto`.
  - `comment.service.ts` (`server-only`): `listTaskComments`, `createComment`, `updateComment`, `deleteComment` — порядок проверок как в «Защите от IDOR». `updateComment` с тем же текстом — no-op без `editedAt`.
  - `comment.actions.ts` (`'use server'`): три action на `FormState`; `toActionError(error, { action: '…' })`; при ошибке возвращать `values: formValues(formData, ['body'])`; `requireUser()` для сессии.
  - `src/modules/tasks/index.ts`: `export { listTaskComments } from './slices/comment/comment.service'`. `client.ts`: actions, `createCommentSchema` (если нужен клиенту), типы DTO.
  - Тесты:
    - `comment.schema.test.ts`: пустой и пробельный текст → ошибка поля `body`; длина > лимита; нормализация; невалидный `commentId`.
    - `comment.service.test.ts` (моки по образцу `task.service.test.ts`): неучастник → `NOT_FOUND`; задача чужого пространства → `NOT_FOUND`; комментарий другой задачи → `NOT_FOUND`; редактирование чужого → `FORBIDDEN`; владелец удаляет чужой; участник не удаляет чужой; `count = 0` → `NOT_FOUND`; список: разворот порядка, `truncated` при `total > 50`, `all` без `take`, флаги `canEdit`/`canDelete`.
  - Логирование (`createLogger('tasks.comment')`):
    - `log.debug({ userId, workspaceId, taskId, all, total }, '[comment.list]')`;
    - `log.info({ workspaceId, taskId, commentId, userId, length }, '[comment] created|updated|deleted')`; для удаления — ещё `byOwner: boolean`;
    - `log.warn({ workspaceId, taskId, commentId, userId, role }, '[comment.update|delete] forbidden')` и `log.warn(..., '[comment] not found')`.
    - Текст комментария не логировать — только длину.
  - Files: `src/modules/tasks/slices/comment/{comment.schema,comment.schema.test,comment.repository,comment.service,comment.service.test,comment.actions,comment.dto}.ts`, `src/modules/tasks/{index,client}.ts`.

<!-- Commit checkpoint: tasks 1-3 -->

### Phase 2: UI

- [x] Task 4: Компоненты комментариев (depends on 3)
  - **По факту:** общее поле текста — `comment-body-field.tsx` (Ctrl/⌘+Enter, Esc). Форма добавления сбрасывается встроенным сбросом React после action, `key` не нужен. Счётчик символов не делали: хватает `maxLength`. Выход из режима правки — внутри обёртки над `updateCommentAction` в `useActionState`. Аватар автора скрыт от скринридеров (`aria-hidden`), потому что у `AssigneeAvatar` подпись «Ответственный», а имя автора выводится рядом текстом.
  - Перед началом перечитать `node_modules/next/dist/docs/01-app/02-guides/forms.md` (или актуальный раздел о Server Actions в формах) и `preserving-ui-state.md`.
  - `src/components/tasks/comments/comment-form.tsx` (`'use client'`): `Textarea` + кнопка «Отправить»; `useActionState(createCommentAction)`; скрытые `workspaceId`, `taskId`; `maxLength`, счётчик символов при приближении к лимиту; `Ctrl/⌘+Enter` → `requestSubmit()`; ошибка поля через `FormField`/`FormError`; очистка после успеха (смена `key` у формы); `aria-label="Новый комментарий"`.
  - `comment-item.tsx` (`'use client'`): автор (`AssigneeAvatar` + имя или «Удалённый пользователь»), `<time dateTime>` с серверной подписью, «(изменён)» с подсказкой времени правки; текст `whitespace-pre-wrap break-words`. Режим редактирования (только `canEdit`): та же форма с `updateCommentAction`, «Сохранить» / «Отмена», `Esc` — отмена, после успеха — выход из режима. Удаление (только `canDelete`): `ConfirmActionDialog` «Удалить комментарий?».
  - `comment-list.tsx` (серверный компонент): принимает `TaskCommentsDto`, форматирует даты и рендерит `<ol>` из `CommentItem`; пустое состояние «Комментариев пока нет»; при `truncated` — ссылка `Link` «Показать все (N)» на `?comments=all` (с `scroll: false`).
  - Логирование: клиентские компоненты не логируют; ошибки action показываются в форме (`toast` — только для удаления, как в `task-placements.tsx`).
  - Files: `src/components/tasks/comments/{comment-form,comment-item,comment-list}.tsx`.

- [x] Task 5: Блок комментариев на странице задачи (depends on 4)
  - **По факту:** заголовок «Комментарии (N)» рендерится внутри Suspense вместе со списком (N известно только после запроса). Ручная проверка в Playwright (dev, порт 3005) пройдена по всем пунктам; тестовые данные удалены из локальной БД.
  - `src/app/(app)/w/[workspaceSlug]/tasks/[taskNumber]/page.tsx`: принять `searchParams`; под сеткой полей — `<section aria-labelledby="task-comments-heading">` с заголовком «Комментарии (N)» и отдельным `<Suspense fallback={скелетон}>` вокруг серверного `TaskCommentsSection`, который вызывает `listTaskComments(session, workspace.id, task.id, { all: comments === 'all' })` и рендерит `CommentList` + `CommentForm`. `searchParams` читать внутри Suspense (Cache Components).
  - Описание диалога удаления задачи: «Задача исчезнет со всех досок вместе с комментариями. Действие нельзя отменить.»
  - Проверить вручную (`pnpm dev`): добавить, отредактировать, удалить; владелец удаляет чужой комментарий; участник не видит кнопок у чужого; длинный текст с переносами; > 50 комментариев → ссылка «Показать все»; удаление задачи удаляет комментарии.
  - `pnpm check` и `pnpm build` зелёные.
  - Логирование: страница не логирует (логирует сервис).
  - Files: `src/app/(app)/w/[workspaceSlug]/tasks/[taskNumber]/page.tsx`.

<!-- Commit checkpoint: tasks 4-5 -->

## Риски

- **Большие ветки обсуждения.** `?comments=all` загружает всё без пагинации. Для текущих объёмов приемлемо; при росте — курсор «Показать ранние» по `(createdAt, id)`.
- **Конкурентное редактирование.** Последняя запись побеждает; блокировок нет — для комментариев одного автора это не проблема.
- **Ревалидация.** Если `revalidatePath` по шаблону страницы не сработает для `[taskNumber]` — откат на ревалидацию layout пространства (дороже, но уже используется).
