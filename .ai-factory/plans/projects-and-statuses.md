# План реализации: Проекты и статусы

Branch: none (main; `git.create_branches: false`)
Created: 2026-10-15

## Settings
- Testing: yes (Vitest)
- Logging: verbose
- Docs: yes  # обязательный docs checkpoint в /aif-implement через /aif-docs

## Roadmap Linkage
Milestone: "Проекты и статусы"
Rationale: План покрывает этап целиком: проекты в пространстве, настраиваемые упорядоченные статусы-колонки и права на управление ими.

## Рамки этапа

**Входит:**
- Новый модуль `projects` (срезы `project`, `status`; модели; публичные `index.ts` / `client.ts`).
- Проект: создание, редактирование (название, описание), удаление с подтверждением вводом названия; список проектов пространства на странице «Обзор».
- Статусы проекта: набор по умолчанию при создании проекта, добавление, переименование, смена категории и цвета, перемещение вверх/вниз, удаление.
- Право «Управление проектами»: по умолчанию только у владельца пространства; владелец может выдать и отозвать его отдельным участникам на странице «Участники».
- Страницы проекта: шапка с вкладками, доска-заглушка (пустые колонки по статусам), настройки проекта.

**Не входит (следующие этапы):**
- Задачи и размещения (`TaskPlacement`). Удаление статуса и проекта пока не проверяет задачи — проверка «перенести задачи в другой статус» добавляется на этапе «Задачи».
- Перетаскивание (dnd-kit) — этап «Канбан-доска». Порядок статусов меняется кнопками.
- Архивирование проектов, шаблоны наборов статусов, ключ проекта (`WEB-123`) — не планируются на этом этапе.
- Неявный доступ глобального администратора — этап «Администрирование ресурса».

## Ключевые решения

- **Право управления проектами — флаг участника.** В `WorkspaceMember` добавляется `canManageProjects Boolean @default(false)`, объявленный в плагине через `schema.member.additionalFields: { canManageProjects: { type: 'boolean', defaultValue: false, input: false } }` (`input: false`: клиентский API плагина его не принимает). Владелец имеет право всегда, независимо от флага. Флаг читается тем же запросом, что и членство (`findMembership`), — без лишнего запроса.
- **Проверка права — в `shared/access`.** `WorkspaceAccess` получает `permissions: { manageProjects: boolean }`; новая функция `requireWorkspacePermission(session, workspaceId, 'manageProjects')` (неучастнику — `NOT_FOUND`, без права — `FORBIDDEN`). Правило «owner ⇒ всё разрешено» — в чистой функции `resolveWorkspacePermissions(role, flags)` в `workspace-role.ts`.
- **Выдача права — исключение из правила «мутации только через плагин».** У плагина нет API для произвольного поля участника, поэтому `setMemberPermission` в срезе `member` обновляет строку через репозиторий (`updateMany` с `where: { id, workspaceId }` — защита от IDOR). Решение зафиксировать комментарием в репозитории и в `docs/architecture.md`. При понижении владельца до участника флаг не меняется (по умолчанию `false`).
- **Статусы — данные, категория — enum.** `ProjectStatus(name, category, color, position)`. Категория `todo | in_progress | done` (Prisma enum `StatusCategory`) нужна будущим этапам: фильтр «выполненные», перевод задачи в `done` по merge PR. Цвет — ключ из фиксированной палитры (`gray`, `blue`, `green`, `amber`, `red`, `violet`), валидируется Zod, в БД `String`.
- **Набор по умолчанию** создаётся в той же транзакции, что и проект: «К выполнению» (`todo`, `gray`), «В работе» (`in_progress`, `blue`), «Готово» (`done`, `green`).
- **Порядок статусов — целое `position`.** Набор маленький (лимит 20), перемещение вверх/вниз переписывает позиции всего набора в транзакции (`0..n-1`). Уникального индекса по `(projectId, position)` нет — он мешал бы обмену позиций; порядок восстанавливается при каждом изменении. Lexorank нужен карточкам, не колонкам.
- **Инварианты — в модели `StatusSet`** (чистый TS): минимум один статус, максимум 20, имя уникально в проекте без учёта регистра, перемещение у границы — no-op, нормализация позиций. Сервис загружает набор, вызывает метод модели, сохраняет результат.
- **Целостность пространства на уровне БД.** `ProjectStatus` хранит `workspaceId` и ссылается на проект составным FK `(projectId, workspaceId) → Project(id, workspaceId)` (`@@unique([id, workspaceId])` в `Project`). Статус не может оказаться в чужом пространстве; будущий `TaskPlacement` сможет сделать так же. Все запросы — с `workspaceId` в `where`.
- **Идентификаторы** собственных моделей — `String @id @default(uuid(7)) @db.Uuid`; `workspaceId` — `String` (как у моделей плагина). URL проекта — `/w/[workspaceSlug]/projects/[projectId]`; некорректный UUID в URL → `notFound()` (Zod-проверка до запроса, иначе Postgres бросит ошибку приведения типа).
- **Имя проекта уникально в пространстве** (`@@unique([workspaceId, name])`, trim; занято → `ConflictError` с `fieldErrors.name`). Лимит — 200 проектов на пространство.
- **`FormState` переезжает в `shared/types`.** Модулю `projects` нужен тот же тип состояния форм; модули не импортируют друг друга без необходимости. `workspaces.form-state.ts` удаляется, `workspaces/client.ts` реэкспортирует тип из `@/shared/types` для совместимости.
- **Удаление** проекта и пространства каскадное (`onDelete: Cascade`): удаление пространства уносит проекты и статусы.
- **Cache Components.** Всё, что читает сессию и данные пространства, — внутри `<Suspense>`; `params` — Promise. Перед UI-задачами перечитать `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`, `forms.md`, `server-actions.md`.

## Commit Plan
- **Commit 1** (после задач 1–3): `feat(projects): add projects schema and manage-projects permission`
- **Commit 2** (после задач 4–6): `feat(projects): add project and status models, services and actions`
- **Commit 3** (после задач 7–10): `feat(projects): add project pages, status settings and permission toggle`

## Tasks

### Phase 1: Схема и доступ

- [x] Task 1: Prisma-схема проектов, статусов и права участника
  - **По факту:** Prisma 7 не генерирует клиент при `migrate dev` — после миграции нужен `pnpm db:generate`.
  - `prisma/schema.prisma`:
    - `WorkspaceMember.canManageProjects Boolean @default(false)` с doc-комментарием («владелец имеет право всегда»);
    - `enum StatusCategory { todo in_progress done }`;
    - секция `// ── Проекты и статусы ──`: `Project` — `id` (`uuid(7)`, `@db.Uuid`), `workspaceId` (FK → Workspace, `onDelete: Cascade`), `name`, `description String?`, `createdById String?` (FK → User, `onDelete: SetNull`), `createdAt`, `updatedAt @updatedAt`; `@@unique([workspaceId, name])`, `@@unique([id, workspaceId])`, `@@index([workspaceId])`;
    - `ProjectStatus` — `id` (`uuid(7)`), `projectId @db.Uuid`, `workspaceId`, `name`, `category StatusCategory @default(todo)`, `color String @default("gray")`, `position Int`, `createdAt`, `updatedAt`; составная связь `project Project @relation(fields: [projectId, workspaceId], references: [id, workspaceId], onDelete: Cascade)`; `@@unique([projectId, name])`, `@@index([projectId, position])`, `@@index([workspaceId])`;
    - обратные связи в `Workspace` (`projects`) и `User` (`createdProjects`).
  - `pnpm db:migrate --name add_projects_and_statuses`; проверить SQL миграции: составной FK, `DEFAULT false` для существующих строк `WorkspaceMember`.
  - Логирование: не требуется (схема). Проверка: `pnpm db:generate` без ошибок.
  - Files: `prisma/schema.prisma`, `prisma/migrations/*_add_projects_and_statuses/migration.sql`.

- [x] Task 2: Поле `canManageProjects` в плагине `organization` (depends on 1)
  - `src/shared/auth/auth.ts`: `schema.member.additionalFields.canManageProjects = { type: 'boolean', defaultValue: false, input: false, required: false }`. Проверить по `node_modules/better-auth/dist/plugins/organization/*.d.mts`, что `input: false` поддерживается для member и что `addMember`/`acceptInvitation` создают участника с `false`.
  - Обновить комментарий в `schema.prisma` о синхронизации переименований и полей с `auth.ts`.
  - Логирование: без изменений (лог `[auth] better-auth initialized` уже есть).
  - Проверка: `pnpm typecheck`; принятие приглашения создаёт участника с `canManageProjects = false`.
  - Files: `src/shared/auth/auth.ts`, `prisma/schema.prisma` (комментарий).

- [x] Task 3: Права пространства и `requireWorkspacePermission` (depends on 1)
  - `src/shared/access/workspace-role.ts`: `WORKSPACE_PERMISSIONS = ['manageProjects'] as const`, `WorkspacePermission`, `WorkspacePermissions = Record<WorkspacePermission, boolean>`, `resolveWorkspacePermissions(role, { canManageProjects })` — owner ⇒ все `true`, member ⇒ по флагам.
  - `src/shared/access/workspace-access.ts`:
    - `findMembership` и `findWorkspaceBySlug` дополнительно выбирают `canManageProjects`;
    - `WorkspaceAccess.permissions` заполняется через `resolveWorkspacePermissions`;
    - `requireWorkspacePermission(session, workspaceId, permission)` — поверх `requireWorkspaceAccess`; нет права → `ForbiddenError('Недостаточно прав для управления проектами')`;
    - `requireWorkspaceAccessBySlug` возвращает `access.permissions` (страницы решают, показывать ли кнопки управления).
  - `src/shared/access/index.ts`: экспорт новых функций и типов.
  - Тесты: `workspace-role.test.ts` — owner без флага получает право, member без флага — нет, member с флагом — да; `workspace-access.test.ts` — `requireWorkspacePermission`: неучастник → `NOT_FOUND`, member без флага → `FORBIDDEN`, member с флагом и owner проходят.
  - Логирование (`createLogger('access')`): `DEBUG [access.requireWorkspacePermission] { userId, workspaceId, permission }`; `WARN [access.requireWorkspacePermission] permission denied { userId, workspaceId, role, permission }`.
  - Files: `src/shared/access/workspace-role.ts`, `src/shared/access/workspace-access.ts`, `src/shared/access/index.ts`, `src/shared/access/workspace-role.test.ts`, `src/shared/access/workspace-access.test.ts`.

<!-- Commit checkpoint: tasks 1-3 -->

### Phase 2: Домен и серверная логика

- [x] Task 4: Доменные модели модуля `projects` и перенос `FormState` (depends on 1)
  - **По факту:** `isEntityId()` в `models/project.ts` отсекает не-UUID id до запроса в сервисах.
  - `src/shared/types/form-state.ts`: перенести `FormState<T>` и `formValues()` из `src/modules/workspaces/workspaces.form-state.ts`, экспорт из `src/shared/types/index.ts`; обновить импорты в `workspaces` (actions, `client.ts` реэкспортирует тип); старый файл удалить.
  - `src/modules/projects/models/status-category.ts`: `STATUS_CATEGORIES = ['todo', 'in_progress', 'done'] as const`, `StatusCategory`, `STATUS_CATEGORY_LABELS` («К выполнению», «В работе», «Готово»).
  - `models/status-color.ts`: `STATUS_COLORS` (палитра из «Ключевых решений»), `StatusColor`, `parseStatusColor()` (неизвестное → `gray`).
  - `models/status-set.ts`: класс `StatusSet` над массивом `{ id, name, category, color, position }`: `static createDefault()`, `add({ name, category, color })`, `rename(id, name)`, `update(id, { category?, color? })`, `move(id, 'up' | 'down')`, `remove(id)`, `toPositions()`; инварианты: минимум один статус (`ValidationError` «В проекте должен остаться хотя бы один статус»), максимум `STATUS_LIMIT = 20`, имя 1..40 символов после trim, уникально без учёта регистра (`ValidationError` с `fieldErrors.name`), неизвестный `id` → `NotFoundError`, перемещение у границы — без изменений, позиции всегда `0..n-1`.
  - `models/project.ts`: `normalizeProjectName()` (trim, схлопывание пробелов), константы `PROJECT_NAME_MIN_LENGTH = 2`, `PROJECT_NAME_MAX_LENGTH = 80`, `PROJECT_DESCRIPTION_MAX_LENGTH = 2000`, `PROJECT_LIMIT = 200`; `assertDeleteConfirmed(name, confirmName)` → `ValidationError` с `fieldErrors.confirmName`.
  - `models/index.ts` — внутренний реэкспорт. Модели — без Prisma, Next.js, React (ESLint-правило для `models/` уже действует); ошибки импортировать из `@/shared/errors/app-error`, как в `workspaces/models`.
  - Тесты (таблицы кейсов): `status-set.test.ts` — набор по умолчанию, дубликат имени в другом регистре, лимит 20, удаление последнего, `move` у верхней/нижней границы, нормализация позиций после удаления из середины; `project.test.ts` — нормализация имени, подтверждение удаления; `status-color.test.ts` — неизвестный цвет.
  - Логирование: модели не логируют (чистые функции); ошибки логируют сервисы и `toActionError`.
  - Files: `src/shared/types/form-state.ts`, `src/shared/types/index.ts`, `src/modules/workspaces/workspaces.form-state.ts` (удалить), `src/modules/workspaces/client.ts`, `src/modules/workspaces/slices/*/*.actions.ts`, `src/modules/projects/models/{status-category,status-color,status-set,project,index}.ts`, `src/modules/projects/models/*.test.ts`.

- [x] Task 5: Репозитории и сервисы проектов, статусов и выдачи права (depends on 2, 3, 4)
  - **По факту:** гонки набора статусов решены блокировкой строки проекта (`SELECT … FOR UPDATE` в `statusRepository.lockProject`) в начале каждой мутации. Занятое название проекта проверяется до вставки (`isNameTaken`), P2002 (`isUniqueViolation` в `shared/db`) — только на гонку: иначе Prisma пишет ожидаемый конфликт в лог как ERROR. Правило «владельцу право не настраивается» — метод `Membership.assertPermissionsConfigurable()`.
  - Срез `slices/project/`:
    - `project.repository.ts` (`import 'server-only'`): `listByWorkspace(workspaceId)` (с числом статусов, сортировка по имени), `findInWorkspace(workspaceId, projectId)`, `countInWorkspace(workspaceId)`, `createWithStatuses(tx, data, statuses)`, `update(workspaceId, projectId, data)` (`updateMany` с `workspaceId` в `where`, 0 строк → `null`), `delete(workspaceId, projectId)`. Prisma-ошибку `P2002` по `(workspaceId, name)` перевести в `ConflictError` (`fieldErrors.name`).
    - `project.dto.ts`: `ProjectListItemDto { id, name, description, statusesCount }`, `ProjectDto { id, workspaceId, name, description, createdAt }`.
    - `project.service.ts`: `listProjects(session, workspaceId)` (member), `getProject(session, workspaceId, projectId)` (member; чужой проект → `NotFoundError`), `createProject(session, workspaceId, { name, description? })` (`manageProjects`, лимит, `prisma.$transaction` + `StatusSet.createDefault()`), `updateProject` (`manageProjects`), `deleteProject(session, workspaceId, { projectId, confirmName })` (`manageProjects` + `assertDeleteConfirmed`).
  - Срез `slices/status/`:
    - `status.repository.ts`: `listByProject(workspaceId, projectId)` (по `position`), `replaceSet(tx, workspaceId, projectId, { created, updated, deletedIds })` — применяет изменения набора в транзакции, всегда с `workspaceId` и `projectId` в `where`.
    - `status.dto.ts`: `ProjectStatusDto { id, name, category, color, position }`.
    - `status.service.ts`: `listStatuses(session, workspaceId, projectId)` (member); `addStatus`, `updateStatus` (имя, категория, цвет), `moveStatus(…, direction)`, `deleteStatus` — `manageProjects`; каждая мутация: `prisma.$transaction` → загрузить набор → метод `StatusSet` → `replaceSet`. Проверять, что `projectId` принадлежит `workspaceId` (иначе `NotFoundError`). Комментарий у `deleteStatus`: проверка задач в статусе — на этапе «Задачи».
  - Срез `workspaces/slices/member/`: `member.repository.ts` — `setCanManageProjects(workspaceId, memberId, value)` (`updateMany` по `{ id, workspaceId }`, комментарий о том, почему в обход плагина); `member.service.ts` — `setMemberPermission(session, workspaceId, { memberId, permission, value })`: owner; участник с ролью owner → `ValidationError` («У владельца это право есть всегда»); `MemberDto` получает `canManageProjects`.
  - Все сервисы: `import 'server-only'`, первым делом `requireWorkspaceAccess` / `requireWorkspacePermission`; наружу — DTO.
  - Тесты (моки `@/shared/access`, репозиториев и `@/shared/db`): `project.service.test.ts` — без права → `FORBIDDEN`, проект чужого пространства → `NOT_FOUND`, создание создаёт три статуса по умолчанию, лимит проектов, неверное подтверждение удаления; `status.service.test.ts` — удаление последнего статуса → `VALIDATION`, `move` сохраняет нормализованные позиции, статус чужого проекта → `NOT_FOUND`; `member.service.test.ts` — не-owner не выдаёт право, owner-цель → `VALIDATION`, `memberId` чужого пространства → `NOT_FOUND`.
  - Логирование (`createLogger('projects.<slice>')`, `createLogger('workspaces.member')`): `DEBUG` на входе каждого метода (`userId`, `workspaceId`, `projectId`/`statusId`); `INFO [projects.project] created { workspaceId, projectId, userId }`, `updated`, `deleted`; `INFO [projects.status] added { projectId, statusId, category }`, `updated { projectId, statusId, fields }`, `moved { projectId, statusId, direction }`, `deleted`; `INFO [workspaces.member] permission changed { workspaceId, memberId, permission, value, byUserId }`; `WARN` на нарушение инварианта (последний статус, лимиты, дубликат имени); названия проектов и статусов в логи не писать.
  - Files: `src/modules/projects/slices/project/project.{repository,dto,service}.ts`, `src/modules/projects/slices/status/status.{repository,dto,service}.ts`, `src/modules/workspaces/slices/member/member.{repository,service,dto}.ts`, `*.test.ts`.

- [x] Task 6: Zod-схемы, Server Actions и публичный API (depends on 5)
  - `slices/project/project.schema.ts`: `createProjectSchema` (`workspaceId`, `name` 2..80 после нормализации, `description` optional — пустая строка → `undefined`, до 2000), `updateProjectSchema` (+ `projectId` — `z.uuid()`), `deleteProjectSchema` (`workspaceId`, `projectId`, `confirmName`); `projectIdSchema` для проверки параметра URL.
  - `slices/status/status.schema.ts`: `addStatusSchema` (`workspaceId`, `projectId`, `name` 1..40, `category` из `STATUS_CATEGORIES`, `color` из `STATUS_COLORS`), `updateStatusSchema` (+ `statusId`), `moveStatusSchema` (`direction: 'up' | 'down'`), `deleteStatusSchema`.
  - `*.actions.ts` (`'use server'`, под `useActionState`, по образцу `workspace.actions.ts`): `createProjectAction` → `redirect('/w/<slug>/projects/<id>/board')` вне `try/catch` (slug — из DTO сервиса или скрытого поля, проверенного сервисом); `updateProjectAction`; `deleteProjectAction` → `redirect('/w/<slug>')`; `addStatusAction`, `updateStatusAction`, `moveStatusAction`, `deleteStatusAction`. После мутаций — `revalidatePath('/w/[workspaceSlug]', 'layout')`.
  - `workspaces/slices/member/member.schema.ts` + `member.actions.ts`: `setMemberPermissionSchema` (`workspaceId`, `memberId`, `permission` из `WORKSPACE_PERMISSIONS`, `value` — `z.stringbool()`), `setMemberPermissionAction`; экспорт через `workspaces/client.ts`.
  - `src/modules/projects/index.ts` (сервер: read-функции `listProjects`, `getProject`, `listStatuses` + всё из `client.ts`) и `client.ts` (actions, схемы, константы, `STATUS_CATEGORY_LABELS`, `STATUS_COLORS`, DTO-типы) — по образцу `workspaces`.
  - Тесты: `project.schema.test.ts` (пустое описание, короткое имя, невалидный UUID), `status.schema.test.ts` (неизвестная категория и цвет, направление), `member.schema.test.ts` (неизвестное право, `value` `"true"`/`"false"`).
  - Логирование: actions не логируют бизнес-события; `DEBUG [projects.actions] redirect { to }`; ошибки — через `toActionError(error, { action })`.
  - Files: `src/modules/projects/slices/project/project.{schema,actions}.ts`, `src/modules/projects/slices/status/status.{schema,actions}.ts`, `src/modules/projects/{index,client}.ts`, `src/modules/workspaces/slices/member/member.{schema,actions}.ts`, `src/modules/workspaces/client.ts`, `*.schema.test.ts`.

<!-- Commit checkpoint: tasks 4-6 -->

### Phase 3: UI

- [x] Task 7: Список проектов на «Обзоре» и создание проекта (depends on 6)
  - `src/app/(app)/w/[workspaceSlug]/page.tsx`: вместо заглушки — карточки проектов (название, описание в одну строку, число статусов, ссылка на доску); кнопка «Создать проект» только при `access.permissions.manageProjects`; пустое состояние (для управляющих — призыв создать, для остальных — «Проектов пока нет»). Данные — `listProjects()` внутри `<Suspense>`.
  - `src/app/(app)/w/[workspaceSlug]/projects/new/page.tsx`: без права → `notFound()`; `src/components/projects/create-project-form.tsx` (`'use client'`, `useActionState`, `FormField`/`FormError`): название, описание (`textarea` — добавить через shadcn CLI, если нет).
  - `src/components/workspaces/workspace-nav.tsx`: «Обзор» → «Проекты» (активна и на `/projects/*`).
  - Логирование: страницы и компоненты не логируют; события — в сервисах, отказы — в guard.
  - Files: `src/app/(app)/w/[workspaceSlug]/page.tsx`, `src/app/(app)/w/[workspaceSlug]/projects/new/page.tsx`, `src/components/projects/project-list.tsx`, `src/components/projects/create-project-form.tsx`, `src/components/workspaces/workspace-nav.tsx`, `src/components/ui/textarea.tsx` (CLI).

- [x] Task 8: Layout проекта и доска-заглушка (depends on 6, 7)
  - **По факту:** `/projects/[projectId]` → `/board` — через `redirects` в `next.config.ts` (до рендера, без Suspense); параметр ограничен регуляркой UUID, чтобы не задеть `/projects/new`. Проект для layout и страниц загружает `projects/[projectId]/_lib/load-project.ts` (`cache()`, невалидный id / чужой проект → `notFound()`).
  - `src/app/(app)/w/[workspaceSlug]/projects/[projectId]/layout.tsx`: шапка проекта (название, описание) и вкладки «Доска», «Настройки» (последняя — при `manageProjects`); данные внутри `<Suspense>`, `{children}` не ждёт шапку. Невалидный `projectId` (`projectIdSchema`) или проект чужого пространства → `notFound()`.
  - `projects/[projectId]/page.tsx` → `redirect('board')`.
  - `projects/[projectId]/board/page.tsx`: горизонтальный ряд колонок по `listStatuses()` — цветной маркер, название, пустое состояние «Задачи появятся на следующем этапе»; горизонтальная прокрутка на узких экранах.
  - `src/components/projects/status-badge.tsx` — маркер цвета статуса (классы Tailwind по ключу палитры, без динамической сборки имён классов).
  - Логирование: нет (UI).
  - Files: `src/app/(app)/w/[workspaceSlug]/projects/[projectId]/{layout,page}.tsx`, `src/app/(app)/w/[workspaceSlug]/projects/[projectId]/board/page.tsx`, `src/components/projects/project-nav.tsx`, `src/components/projects/board-columns.tsx`, `src/components/projects/status-badge.tsx`.

- [x] Task 9: Настройки проекта: свойства, статусы, удаление (depends on 8)
  - `projects/[projectId]/settings/page.tsx`: без `manageProjects` → `notFound()`.
    - Форма «Основное»: название и описание (`updateProjectAction`).
    - «Статусы»: список по порядку; у каждого — название (инлайн-переименование), `select` категории, выбор цвета, кнопки «↑»/«↓» (`aria-label`, неактивны у границ), «Удалить» (`alert-dialog`, неактивна у единственного статуса); форма «Добавить статус» внизу. Ошибки инвариантов — сообщением из `ActionResult` (toast `sonner` или `FormError`).
    - «Опасная зона»: удаление проекта с подтверждением вводом названия (переиспользовать подход `delete-workspace-dialog.tsx`).
  - Логирование: нет (UI).
  - Files: `src/app/(app)/w/[workspaceSlug]/projects/[projectId]/settings/page.tsx`, `src/components/projects/project-settings-form.tsx`, `src/components/projects/status-list.tsx`, `src/components/projects/status-row.tsx`, `src/components/projects/add-status-form.tsx`, `src/components/projects/delete-project-dialog.tsx`.

- [x] Task 10: Выдача права «Управление проектами» участникам (depends on 6)
  - **Проверено (2026-10-15, `next start` на :3000, скрипт Playwright, 28 проверок, стабильно в 6 прогонах):** весь сквозной сценарий ниже плюс дубликаты названий проекта и статуса, неактивные кнопки у границ и у единственного статуса, `FORBIDDEN` на устаревшей странице после отзыва права. Тестовые данные удалены.
  - `src/components/workspaces/members-table.tsx`: колонка «Проекты» — для owner переключатель (`checkbox`/`switch` через shadcn CLI) у участников с ролью `member`; у владельцев — неактивная отметка «всегда»; для не-владельцев — только чтение. Отправка — `setMemberPermissionAction`, откат состояния при ошибке.
  - `src/app/(app)/w/[workspaceSlug]/settings/members/page.tsx`: передать `canManageProjects` из `MemberDto`.
  - Логирование: нет (UI); событие логирует `member.service`.
  - Проверка вручную (сквозной сценарий): owner A создаёт проект → видит три статуса по умолчанию → добавляет, переименовывает, перемещает и удаляет статусы; удаление последнего статуса → ошибка; участник B не видит «Создать проект» и получает 404 на `/projects/new` и `/settings` проекта; A выдаёт B право → B создаёт проект и меняет статусы; A отзывает право → у B снова 404; `projectId` чужого пространства и невалидный UUID → 404; удаление проекта и удаление пространства уносят статусы; `pnpm check` и `pnpm build` зелёные.
  - Files: `src/components/workspaces/members-table.tsx`, `src/app/(app)/w/[workspaceSlug]/settings/members/page.tsx`, `src/components/ui/switch.tsx` (CLI).

<!-- Commit checkpoint: tasks 7-10 -->

## Риски и что проверить

- **`additionalFields` для member в Better Auth 1.7.** Проверить, что плагин не перетирает `canManageProjects` при `updateMemberRole` и не отдаёт поле на запись через клиентский API (`input: false`). Запасной вариант, если поле мешает плагину: отдельная таблица `WorkspaceMemberPermission(workspaceId, memberId, permission)` — `requireWorkspacePermission` от этого не меняется.
- **Составной FK и Prisma 7.** Убедиться, что `@relation(fields: [projectId, workspaceId], references: [id, workspaceId])` генерирует корректный SQL и не конфликтует с типами (`projectId @db.Uuid` ↔ `Project.id @db.Uuid`, `workspaceId` — `text` с обеих сторон).
- **Гонки при изменении набора статусов.** Две одновременные правки набора могут перезаписать друг друга. Транзакция + `SELECT … FOR UPDATE` на строку проекта (`$queryRaw`) или уровень `Serializable` для мутаций набора — выбрать при реализации и отметить в плане.
- **Отзыв права при открытой странице.** Права проверяются на каждой мутации, поэтому устаревшая страница получит `FORBIDDEN` — сообщение должно быть понятным.
- **Cache Components.** Новые страницы читают сессию — проверить `pnpm build` на ошибки «uncached data outside Suspense»; `revalidatePath` по layout пространства обновляет список проектов и шапку проекта.
- `pnpm check` и `pnpm build` должны оставаться зелёными после каждой commit-точки.
