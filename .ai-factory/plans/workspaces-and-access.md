# План реализации: Рабочие пространства и доступы

Branch: none (main; `git.create_branches: false`)
Created: 2026-10-15

## Settings
- Testing: yes (Vitest)
- Logging: verbose
- Docs: yes  # обязательный docs checkpoint в /aif-implement через /aif-docs

## Roadmap Linkage
Milestone: "Рабочие пространства и доступы"
Rationale: План покрывает этап целиком: создание пространства, приглашения, участники, роли владельца и участника, общий слой проверки доступа `requireWorkspaceAccess()`.

## Рамки этапа

**Входит:**
- Плагин Better Auth `organization`, переименованный в терминах домена: `Workspace`, `WorkspaceMember`, `WorkspaceInvitation`, поле `workspaceId`.
- Роли в пространстве: `owner` / `member` (роль плагина `admin` не используется).
- Создание, переименование и удаление пространства; список своих пространств; переключатель пространств в шапке.
- Участники: список, смена роли, исключение, выход из пространства. Инвариант: в пространстве всегда есть хотя бы один владелец.
- Приглашения по email: одноразовая ссылка со сроком действия, письмо через SMTP (локально — Mailpit), копирование ссылки владельцем, отмена, принятие и отклонение получателем.
- Сквозной слой: `requireWorkspaceAccess(session, workspaceId, minRole)` и вариант для страниц по slug.

**Не входит (следующие этапы):**
- Неявный доступ глобального администратора ко всем пространствам, управление чужими пространствами — этап «Администрирование ресурса». На этом этапе `admin` работает с пространствами как обычный пользователь (по членству).
- Подтверждение email, сброс пароля (почтовый транспорт появится здесь, но эти сценарии — отдельно).
- Проекты, задачи и прочие данные пространства — следующие этапы. Страница пространства — заглушка.
- Teams и динамические роли плагина — не включаем.

## Ключевые решения

- **Плагин `organization` + доменные имена.** `schema.organization.modelName = 'workspace'`, `schema.member.modelName = 'workspaceMember'`, `schema.invitation.modelName = 'workspaceInvitation'`, `fields: { organizationId: 'workspaceId' }` для member/invitation, `schema.session.fields.activeOrganizationId = 'activeWorkspaceId'`. Так в коде и БД везде `workspaceId`, как требуют ARCHITECTURE.md и AGENTS.md. Сопоставление проверить сгенерированной схемой CLI (Task 2) до написания миграции.
- **Роли через access control.** `createAccessControl(defaultStatements)`, `roles: { owner: ownerAc, member: memberAc }`, `creatorRole: 'owner'`. Роль `admin` плагина не регистрируется — приглашение с ней невозможно.
- **Мутации — через `getAuth().api.*` плагина, чтение — через репозитории модуля.** Плагин отвечает за создание пространства с владельцем, приглашения, срок их действия, проверку email получателя при принятии. Списки и DTO для UI читаются собственными репозиториями с фильтром по `workspaceId` — без лишних HTTP-слоёв и с нужными полями.
- **Доступ проверяем сами до вызова плагина.** Каждый сервисный метод начинается с `requireWorkspaceAccess()`. Проверки плагина — второй рубеж, их ошибки маппятся в доменные (`workspaces.errors.ts`).
- **Инварианты в моделях.** «Нельзя убрать/понизить последнего владельца», «приглашение истекло / уже обработано», «принять может только адресат» — методы моделей `Membership` и `Invitation` (чистый TS). Плагин частично проверяет то же самое, но правило фиксируется в домене и тестируется.
- **Письмо отправляет сервис модуля, а не колбэк плагина.** `sendInvitationEmail` плагина не используем: шаблон письма — доменный, а `shared/` не должен зависеть от модулей. Сервис `invitation` вызывает `createInvitation`, затем `sendMail()` из `shared/mail`. Сбой отправки не откатывает приглашение: логируется `ERROR`, владелец видит ссылку и может скопировать её вручную.
- **Ссылка приглашения** — `${BETTER_AUTH_URL}/invite/<invitationId>`. id генерирует Better Auth (случайная строка), срок — `invitationExpiresIn` 7 дней, при повторном приглашении старые отменяются (`cancelPendingInvitationsOnReInvite: true`).
- **Текущее пространство — из URL** (`/w/[workspaceSlug]`), а не из `session.activeWorkspaceId`. Поле в схеме остаётся (требование плагина), но приложение на него не опирается: вкладки с разными пространствами не мешают друг другу.
- **Slug.** Генерируется из названия (транслитерация кириллицы, `a-z0-9-`, 3–48 символов) с возможностью правки в форме. Зарезервированы служебные (`new`, `settings`, `api` и т.п.). Занятый slug → `ConflictError` с ошибкой поля `slug`.
- **Неучастнику — 404.** Страницы пространства отдают `notFound()`, если пользователь не участник (не раскрываем существование пространства). Server Actions возвращают `FORBIDDEN`/`NOT_FOUND`.
- **Cache Components.** Всё, что читает сессию и членство, — внутри `<Suspense>`; `params` — Promise. Перед UI-задачами перечитать `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`, `forms.md`, `server-actions.md`.

## Commit Plan
- **Commit 1** (после задач 1–3): `feat(workspaces): add organization plugin schema, mail transport and env`
- **Commit 2** (после задач 4–6): `feat(workspaces): add workspace access guard, domain models and services`
- **Commit 3** (после задач 7–8): `feat(workspaces): add workspace, member and invitation actions`
- **Commit 4** (после задач 9–12): `feat(workspaces): add workspace pages, members settings and invite acceptance`

## Tasks

### Phase 1: Инфраструктура

- [x] Task 1: Почтовый транспорт: Mailpit, env, `shared/mail`
  - **По факту:** `SMTP_HOST` по умолчанию `127.0.0.1` (nodemailer сам резолвит `localhost`, на Windows/WSL lookup зависал на 30 с; на `[::1]:1025` слушает `wslrelay`); у транспорта короткие таймауты (DNS 5 с, соединение и приветствие 10 с, сокет 20 с).
  - `compose.yml`: сервис `mailpit` (`axllent/mailpit`, точный тег последнего стабильного релиза), порты `${MAILPIT_SMTP_PORT:-1025}:1025` и `${MAILPIT_UI_PORT:-8025}:8025`, healthcheck. `package.json`: `infra:up` поднимает и `mailpit`.
  - `pnpm add nodemailer` + `pnpm add -D @types/nodemailer` — точные версии без `^`.
  - `src/shared/env/env.ts`: `SMTP_HOST` (default `localhost`), `SMTP_PORT` (`z.coerce.number().int()`, default `1025`), `SMTP_SECURE` (`z.stringbool()`, default `false`), `SMTP_USER` / `SMTP_PASSWORD` (optional), `MAIL_FROM` (default `Tasker <no-reply@tasker.local>`).
  - `.env.example`: секция `# --- Почта (SMTP; локально — Mailpit, UI http://localhost:8025) ---`.
  - `src/shared/mail/` (`import 'server-only'`): `mailer.ts` — ленивый singleton транспорта nodemailer через `globalThis` (как `prisma`/`getAuth`); `sendMail({ to, subject, text, html })`; `escapeHtml()` для подстановок в HTML-шаблоны; `index.ts`.
  - `src/shared/logger/logger.ts`: добавить в `redact` `*.smtpPassword`/`auth.pass`, если транспорт попадает в логи.
  - Тесты: `env.test.ts` — дефолты SMTP, нечисловой `SMTP_PORT` → ошибка с ключом без значения; `mail/escape-html.test.ts` — `<script>`, кавычки, `&`.
  - Логирование (`createLogger('mail')`): `INFO [mail] transport initialized { host, port, secure }` (без пароля); `DEBUG [mail.send] { to: maskEmail(to), subject }`; `INFO [mail.send] sent { messageId }`; `ERROR [mail.send] failed { err, to: maskEmail(to) }` и re-throw как `InternalError`.
  - Files: `compose.yml`, `package.json`, `pnpm-lock.yaml`, `.env.example`, `src/shared/env/env.ts`, `src/shared/env/env.test.ts`, `src/shared/mail/mailer.ts`, `src/shared/mail/escape-html.ts`, `src/shared/mail/escape-html.test.ts`, `src/shared/mail/index.ts`, `src/shared/logger/logger.ts`.

- [x] Task 2: Prisma-схема пространств и миграция
  - **По факту:** эталон сверен по исходникам плагина (`organization.mjs`: `fieldName` поддерживается для всех полей; у организации нет `updatedAt`, `teamId` есть только при включённых teams), CLI не запускался.
  - Сгенерировать эталон: `pnpm dlx @better-auth/cli@1.7.6 generate --output <scratchpad>/auth-schema.prisma` с конфигом из Task 3 (временно, или минимальный конфиг в scratchpad), сверить имена полей с `schema.d.mts` плагина. Переносить вручную, по соглашениям проекта.
  - `prisma/schema.prisma`, секция `// ── Рабочие пространства (Better Auth organization) ──`:
    - `Workspace`: `id`, `name`, `slug @unique`, `logo?`, `metadata?`, `createdAt`; связи `members`, `invitations`;
    - `WorkspaceMember`: `id`, `workspaceId` (FK → Workspace, `onDelete: Cascade`), `userId` (FK → User, Cascade), `role String` (`"owner" | "member"`, doc-комментарий), `createdAt`; `@@unique([workspaceId, userId])`, `@@index([userId])`;
    - `WorkspaceInvitation`: `id`, `workspaceId` (FK, Cascade), `email`, `role`, `status String @default("pending")`, `expiresAt`, `inviterId` (FK → User, Cascade), `createdAt`; `@@index([workspaceId, status])`, `@@index([email])`;
    - `Session.activeWorkspaceId String?`; обратные связи в `User` (`workspaceMemberships`, `sentInvitations`).
  - `pnpm db:migrate --name add_workspaces`.
  - Логирование: не требуется (схема). Проверка: `pnpm db:generate` без ошибок, таблицы и индексы созданы.
  - Files: `prisma/schema.prisma`, `prisma/migrations/*_add_workspaces/migration.sql`.

- [x] Task 3: Подключение плагина `organization` (depends on 2)
  - **По факту:** опцию `ac` не передаём: тип `defaultAc` несовместим с `AccessControl`, а плагин и так использует его по умолчанию; роли — `{ owner: ownerAc, member: memberAc }`.
  - `src/shared/auth/auth.ts`: `organization({...})` перед `nextCookies()`:
    - `ac`, `roles: { owner: ownerAc, member: memberAc }`, `creatorRole: 'owner'`;
    - `allowUserToCreateOrganization: (user) => !user.banned`, `organizationLimit: 50`;
    - `invitationExpiresIn: 7 * 24 * 60 * 60`, `cancelPendingInvitationsOnReInvite: true`, `invitationLimit: 100`;
    - `schema` с переименованиями из «Ключевых решений»;
    - `organizationHooks` (если доступны в 1.7.6) — только для логов `afterCreateOrganization`, `afterAcceptInvitation`, `afterRemoveMember`.
  - Константы ролей и TTL — экспортировать из `src/shared/access/workspace-role.ts` (Task 4) или локально с комментарием о синхронизации.
  - Обновить лог `[auth] better-auth initialized` — `plugins: ['admin', 'organization', 'next-cookies']`.
  - Проверить типы: `getAuth().api.createOrganization / createInvitation / acceptInvitation / rejectInvitation / cancelInvitation / removeMember / updateMemberRole / leaveOrganization / updateOrganization / deleteOrganization` доступны и принимают `headers`.
  - Логирование: `INFO [auth.organization] workspace created { workspaceId, userId }`, `INFO [auth.organization] invitation accepted { workspaceId, userId }`, `INFO [auth.organization] member removed { workspaceId, userId }` (из хуков; без email).
  - Files: `src/shared/auth/auth.ts`.

<!-- Commit checkpoint: tasks 1-3 -->

### Phase 2: Доступ и домен

- [x] Task 4: Роли пространства и `requireWorkspaceAccess` в `src/shared/access` (depends on 2)
  - `src/shared/access/workspace-role.ts` (чистый TS): `WORKSPACE_ROLES = ['owner', 'member'] as const`, `WorkspaceRole`, `parseWorkspaceRole()` (неизвестное → `null`, а не повышение прав), `hasWorkspaceRole(actual, min)` (ранги `member < owner`).
  - `src/shared/access/workspace-access.ts` (`import 'server-only'`):
    - `requireWorkspaceAccess(session, workspaceId, minRole = 'member'): Promise<WorkspaceAccess>` — `{ userId, workspaceId, memberId, role }`; нет членства → `NotFoundError('Пространство не найдено')` (не раскрываем существование), роль ниже → `ForbiddenError`;
    - `requireWorkspaceAccessBySlug(slug, minRole)` для страниц: `requireUserOrRedirect()` + поиск по slug; не найдено / не участник → `notFound()`, роль ниже → `notFound()`; возвращает `{ session, workspace: { id, slug, name }, access }`;
    - поиск членства — один запрос `prisma.workspaceMember.findUnique({ where: { workspaceId_userId } })` с `select`; обёртка `cache()` из React на время запроса.
  - `src/shared/access/index.ts`: экспорт, убрать комментарий-заготовку.
  - Тесты: `workspace-role.test.ts` (ранги, неизвестная роль); `workspace-access.test.ts` с `vi.mock('@/shared/db')` и `vi.mock('@/shared/auth')`: не участник → `NOT_FOUND`, `member` при `minRole: 'owner'` → `FORBIDDEN`, `owner` проходит, неизвестная роль в БД → `FORBIDDEN`, забаненный → `FORBIDDEN` (через `requireUser`).
  - Логирование (`createLogger('access')`): `DEBUG [access.requireWorkspaceAccess] { userId, workspaceId, role }`; `WARN [access.requireWorkspaceAccess] not a member { userId, workspaceId }`; `WARN [access.requireWorkspaceAccess] insufficient role { userId, workspaceId, role, minRole }`.
  - Files: `src/shared/access/workspace-role.ts`, `src/shared/access/workspace-access.ts`, `src/shared/access/index.ts`, `src/shared/access/workspace-role.test.ts`, `src/shared/access/workspace-access.test.ts`.

- [x] Task 5: Доменные модели модуля `workspaces` (depends on 4)
  - `src/modules/workspaces/models/workspace-slug.ts`: `slugify(name)` (транслитерация кириллицы, нижний регистр, `-` вместо прочего, схлопывание, обрезка до 48), `RESERVED_SLUGS`, `validateSlug()` → `ValidationError` с `fieldErrors.slug`.
  - `models/membership.ts`: класс `Membership` + функции над списком владельцев: `assertCanChangeRole(target, newRole, ownersCount)`, `assertCanRemove(target, ownersCount)`, `assertCanLeave(self, ownersCount)` — запрет оставить пространство без владельца (`ValidationError` с понятным сообщением: «Назначьте другого владельца перед…»).
  - `models/invitation.ts`: `Invitation` — `isExpired(now)`, `assertAcceptableBy(email, now)` (статус `pending`, не истекло, email совпадает без учёта регистра → иначе `NotFoundError`/`ForbiddenError`/`ValidationError`), `inviteUrl(baseUrl)`.
  - Модели — без Prisma, Next.js, React (ESLint-правило для `models/` уже есть).
  - Тесты: таблицы кейсов для `slugify` («Отдел продаж» → `otdel-prodazh`, эмодзи/пустое, длина), `validateSlug` (зарезервированные, короткие), `Membership` (последний владелец: понижение/удаление/выход запрещены; при двух владельцах — разрешены), `Invitation` (истекло, чужой email, не pending, регистр email).
  - Логирование: модели не логируют (чистые функции); ошибки логируются сервисами и `toActionError`.
  - Files: `src/modules/workspaces/models/workspace-slug.ts`, `membership.ts`, `invitation.ts`, `index.ts` (внутренний реэкспорт), `*.test.ts`.

- [x] Task 6: Репозитории, маппинг ошибок плагина и сервисы (depends on 3, 4, 5)
  - **По факту:** `fieldErrors` перенесены из `ValidationError` в базовый `AppError` (`ConflictError` по slug/email тоже подсвечивает поле формы); общий вызов плагина — `src/modules/workspaces/organization-api.ts` (`callOrganizationApi`). Сервисы принимают `session` первым аргументом.
  - `src/modules/workspaces/workspaces.errors.ts`: `mapOrganizationError(error)` — `APIError` плагина → доменные: `ORGANIZATION_SLUG_ALREADY_TAKEN`/`ORGANIZATION_ALREADY_EXISTS` → `ConflictError` (`fieldErrors.slug`); `USER_IS_ALREADY_A_MEMBER…`/`USER_IS_ALREADY_INVITED…` → `ConflictError` (`fieldErrors.email`); `INVITATION_NOT_FOUND`/`ORGANIZATION_NOT_FOUND`/`MEMBER_NOT_FOUND` → `NotFoundError`; `YOU_ARE_NOT_ALLOWED_*`/`YOU_ARE_NOT_THE_RECIPIENT…` → `ForbiddenError`; `YOU_CANNOT_LEAVE_…_OWNER` → `ValidationError`; `*_LIMIT_REACHED` → `ValidationError`; прочее → re-throw.
  - Срез `slices/workspace/`: `workspace.repository.ts` (`listForUser(userId)` с ролью и числом участников, `findBySlug`, `findById`); `workspace.service.ts`: `listMyWorkspaces(session)`, `createWorkspace(session, { name, slug? })` (slug из модели, `api.createOrganization`), `renameWorkspace` (owner), `deleteWorkspace` (owner, `api.deleteOrganization`).
  - Срез `slices/member/`: `member.repository.ts` (`listByWorkspace(workspaceId)` с `user { id, name, email, image }`, `countOwners(workspaceId)`, `findInWorkspace(workspaceId, memberId)` — всегда с `workspaceId`, защита от IDOR); `member.service.ts`: `listMembers` (member), `changeMemberRole` (owner + `Membership.assertCanChangeRole` → `api.updateMemberRole`), `removeMember` (owner + `assertCanRemove` → `api.removeMember`), `leaveWorkspace` (member + `assertCanLeave` → `api.leaveOrganization`).
  - Срез `slices/invitation/`: `invitation.repository.ts` (`listPending(workspaceId)`, `findForRecipient(id)` с названием пространства и именем пригласившего); `invitation.mail.ts` — тема и text/html письма (`escapeHtml` для названия пространства и имени); `invitation.service.ts`: `inviteMember(session, workspaceId, { email, role })` (owner → `api.createInvitation` → `sendMail`, ошибка почты не пробрасывается, возвращает `{ invitationId, inviteUrl, emailSent }`), `listInvitations` (owner), `cancelInvitation` (owner, проверка `workspaceId` приглашения), `getInvitationForRecipient(session, id)` (модель `assertAcceptableBy`, DTO без лишних полей), `acceptInvitation` / `rejectInvitation` (`api.*`, возвращает slug пространства).
  - Все сервисы: первым делом `requireUser()` / `requireWorkspaceAccess()`; вызовы `getAuth().api.*` с `headers: await headers()`, ошибки через `mapOrganizationError`; наружу — DTO, не Prisma-объекты.
  - Тесты: `workspaces.errors.test.ts` (таблица кодов); `invitation.mail.test.ts` (экранирование HTML, ссылка в тексте); сервисы `member.service.test.ts` с моками `@/shared/access`, репозитория и `getAuth`: не-owner не может сменить роль, последний владелец не понижается, `memberId` из чужого пространства → `NOT_FOUND`; `invitation.service.test.ts`: сбой `sendMail` → результат с `emailSent: false`, приглашение не откатывается.
  - Логирование (`createLogger('workspaces.<slice>')`): `DEBUG` на входе каждого метода (`userId`, `workspaceId`, без email в открытом виде — `maskEmail`); `INFO [workspaces.workspace] created { workspaceId, slug, userId }`, `renamed`, `deleted`; `INFO [workspaces.member] role changed { workspaceId, memberId, from, to, byUserId }`, `removed`, `left`; `INFO [workspaces.invitation] created { workspaceId, invitationId, role, emailSent }`, `accepted`, `rejected`, `cancelled`; `WARN` на нарушение инварианта (последний владелец, чужое приглашение); `ERROR [workspaces.invitation] email failed { invitationId, err }`.
  - Files: `src/modules/workspaces/workspaces.errors.ts`, `src/modules/workspaces/slices/{workspace,member,invitation}/*.{repository,service}.ts`, `src/modules/workspaces/slices/invitation/invitation.mail.ts`, `*.test.ts`.

<!-- Commit checkpoint: tasks 4-6 -->

### Phase 3: Server Actions

- [x] Task 7: Zod-схемы и Server Actions пространства и участников (depends on 6)
  - **По факту:** состояние форм — `FormState<T>` (`workspaces.form-state.ts`, успех или ошибка + введённые значения). Кроме `index.ts` есть `client.ts` — публичный API без server-only кода для клиентских компонентов (actions, схемы, `slugify`, типы); модели импортируют `@/shared/errors/app-error` напрямую. Ревалидация — `revalidatePath('/', 'layout')`.
  - `slices/workspace/workspace.schema.ts`: `createWorkspaceSchema` (`name` trim 2..80, `slug` optional — пустая строка → `undefined`, формат `^[a-z0-9-]{3,48}$`), `renameWorkspaceSchema` (`workspaceId`, `name`), `deleteWorkspaceSchema` (`workspaceId`, `confirmName` — должен совпасть с названием, проверка в сервисе).
  - `slices/member/member.schema.ts`: `changeMemberRoleSchema` (`workspaceId`, `memberId`, `role` из `WORKSPACE_ROLES`), `removeMemberSchema`, `leaveWorkspaceSchema`.
  - `*.actions.ts` (`'use server'`) под `useActionState` (`(prev, formData) => Promise<ActionResult<T>>`, как в `credentials.actions.ts`): `createWorkspaceAction` → `redirect('/w/<slug>')` вне `try/catch`; `renameWorkspaceAction`; `deleteWorkspaceAction` → `redirect('/')`; `changeMemberRoleAction`, `removeMemberAction`; `leaveWorkspaceAction` → `redirect('/')`. После мутаций — `revalidatePath` для `/`, `/w/[workspaceSlug]` (layout) и страницы участников.
  - `src/modules/workspaces/index.ts`: actions, read-функции (`listMyWorkspaces`, `getWorkspaceSettings`, `listMembers`, `listInvitations`, `getInvitationForRecipient`), схемы и DTO-типы.
  - Тесты: схемы (пустой slug, недопустимые символы, роль `admin` отклоняется).
  - Логирование: actions не логируют бизнес-события (это делают сервисы); `DEBUG [workspaces.actions] redirect { to }`; ошибки — через `toActionError`.
  - Files: `src/modules/workspaces/slices/workspace/workspace.{schema,actions}.ts`, `src/modules/workspaces/slices/member/member.{schema,actions}.ts`, `src/modules/workspaces/index.ts`, `*.schema.test.ts`.

- [x] Task 8: Zod-схемы и Server Actions приглашений (depends on 6)
  - `slices/invitation/invitation.schema.ts`: `inviteMemberSchema` (`workspaceId`, `email` — trim + lowercase + `z.email()`, `role` default `member`), `cancelInvitationSchema`, `respondInvitationSchema` (`invitationId`).
  - `invitation.actions.ts`: `inviteMemberAction` → `ActionResult<{ inviteUrl, emailSent }>` (UI показывает ссылку для копирования); `cancelInvitationAction`; `acceptInvitationAction` → `redirect('/w/<slug>')`; `rejectInvitationAction` → `redirect('/')`.
  - Нельзя пригласить себя (email текущего пользователя) → `ValidationError` поля `email` (в сервисе).
  - Экспорт через `src/modules/workspaces/index.ts`.
  - Тесты: схема (нормализация email, роль по умолчанию, неизвестная роль).
  - Логирование: как в Task 7.
  - Files: `src/modules/workspaces/slices/invitation/invitation.{schema,actions}.ts`, `invitation.schema.test.ts`, `src/modules/workspaces/index.ts`.

<!-- Commit checkpoint: tasks 7-8 -->

### Phase 4: UI

- [x] Task 9: Главная: список пространств и создание (depends on 7)
  - `src/app/(app)/page.tsx`: вместо приветствия — список «Мои пространства» (название, роль, число участников, ссылка `/w/<slug>`) и кнопка «Создать пространство»; пустое состояние с призывом создать первое. Данные — `listMyWorkspaces()` в компоненте внутри `<Suspense>`.
  - `src/app/(app)/workspaces/new/page.tsx` + `src/components/workspaces/create-workspace-form.tsx` (`'use client'`, `useActionState`): название, slug (подсказка-превью `slugify` на клиенте — экспортировать `slugify` через публичный API модуля, модель чистая), ошибки полей.
  - shadcn: добавить недостающие компоненты CLI (`dialog`, `dropdown-menu`, `select`, `table`, `alert-dialog` — по мере необходимости в задачах 9–12), вручную не править.
  - Логирование: страницы и компоненты не логируют; серверные события — в сервисах.
  - Files: `src/app/(app)/page.tsx`, `src/app/(app)/workspaces/new/page.tsx`, `src/components/workspaces/create-workspace-form.tsx`, `src/components/workspaces/workspace-list.tsx`, `src/components/ui/*` (CLI).

- [x] Task 10: Layout пространства, переключатель и общие настройки (depends on 7, 9)
  - `src/app/(app)/w/[workspaceSlug]/layout.tsx`: навигация пространства (Обзор, Участники, Настройки — последние для owner); данные через `requireWorkspaceAccessBySlug` внутри `<Suspense>`, не top-level `await`, блокирующий `{children}`.
  - `src/app/(app)/w/[workspaceSlug]/page.tsx`: заглушка «Проекты появятся на следующем этапе», название и роль пользователя.
  - `src/components/workspaces/workspace-switcher.tsx` в шапке `(app)/layout.tsx` (в своём `<Suspense>`): список пространств пользователя + «Создать пространство».
  - `src/app/(app)/w/[workspaceSlug]/settings/page.tsx` (owner, иначе `notFound()`): переименование; «Опасная зона» — удаление с подтверждением вводом названия (`alert-dialog`).
  - Логирование: нет (UI); отказ доступа логирует guard (Task 4).
  - Files: `src/app/(app)/layout.tsx`, `src/app/(app)/w/[workspaceSlug]/layout.tsx`, `page.tsx`, `settings/page.tsx`, `src/components/workspaces/workspace-switcher.tsx`, `workspace-nav.tsx`, `rename-workspace-form.tsx`, `delete-workspace-dialog.tsx`.

- [x] Task 11: Участники и приглашения (depends on 8, 10)
  - `src/app/(app)/w/[workspaceSlug]/settings/members/page.tsx`: доступна всем участникам (чтение); управление — только owner (сервер всё равно проверяет).
    - Таблица участников: имя, email, роль; для owner — смена роли (`select`) и «Исключить» (`alert-dialog`); у себя — «Покинуть пространство».
    - Форма приглашения (owner): email + роль; после успеха — ссылка с кнопкой «Копировать» и пометка, ушло ли письмо (`emailSent`).
    - Список ожидающих приглашений (owner): email, роль, срок, «Скопировать ссылку», «Отменить».
  - Ошибки инвариантов (последний владелец) показываются сообщением из `ActionResult`.
  - Логирование: нет (UI).
  - Files: `src/app/(app)/w/[workspaceSlug]/settings/members/page.tsx`, `src/components/workspaces/members-table.tsx`, `invite-member-form.tsx`, `pending-invitations.tsx`, `copy-link-button.tsx`.

- [x] Task 12: Принятие приглашения по ссылке (depends on 8)
  - **Проверено вручную (2026-10-15, `next start` на :3100):** создание пространства (slug из кириллицы), приглашение (сбой SMTP → ссылка в UI, `emailSent: false`; после исправления письмо в Mailpit, старое приглашение отменено), «чужое» приглашение, регистрация по ссылке с возвратом, принятие, 404 на `/settings` для участника, запрет понижать последнего владельца (select откатывается), назначение второго владельца, выход, 404 для бывшего участника. Тестовые данные удалены.
  - `src/app/(app)/invite/[invitationId]/page.tsx`: proxy уже уводит неавторизованного на `/login?returnTo=/invite/<id>`; формы входа/регистрации сохраняют `returnTo` — проверить сценарий «нет аккаунта → регистрация → возврат на приглашение».
  - Страница: `getInvitationForRecipient()` в `<Suspense>`; показывает пространство, кто пригласил, роль, срок; кнопки «Принять» / «Отклонить». Состояния: истекло, уже принято/отменено, адресовано другому email (подсказать выйти и войти под нужным email, сам email приглашения не раскрывать целиком — `maskEmail`), не найдено → `notFound()`.
  - Логирование: нет (UI); события — в `invitation.service`.
  - Проверка вручную (сквозной сценарий): A создаёт пространство → приглашает B → письмо в Mailpit (http://localhost:8025) → B регистрируется по ссылке → принимает → видит пространство; A понижает себя при единственном владельце → ошибка; A назначает B владельцем, затем покидает пространство → успех; C открывает `/w/<slug>` → 404; `pnpm check` и `pnpm build` зелёные.
  - Files: `src/app/(app)/invite/[invitationId]/page.tsx`, `src/components/workspaces/invitation-response.tsx`.

<!-- Commit checkpoint: tasks 9-12 -->

## Риски и что проверить

- **Переименование моделей/полей плагина.** Prisma-адаптер обращается к `prisma.<modelName>`; убедиться, что `fields: { organizationId: 'workspaceId' }` поддерживается для member и invitation в 1.7.6 (эталон через CLI в Task 2). Запасной вариант, если переименование полей не работает: оставить поле Prisma-клиента `organizationId` (адаптер работает по именам полей клиента), а наружу из репозиториев отдавать DTO с `workspaceId`. Выбранный вариант отметить в плане.
- **Гонка «последний владелец».** Проверка `ownersCount` и вызов плагина не атомарны: два одновременных понижения могут оставить пространство без владельца. Для этапа приемлемо (редкий сценарий); плагин сам проверяет часть случаев. Зафиксировать в docs как известное ограничение.
- **Неподтверждённые email.** Подтверждения email пока нет: человек, зарегистрировавшийся с чужим адресом, примет приглашение, только если у него есть ссылка (id — случайная строка). Включение `requireEmailVerificationOnInvitation` — вместе с подтверждением email.
- **Rate limiting** приглашений: вызовы `auth.api.*` из Server Actions обходят встроенный лимит; ограничение — `invitationLimit` на пространство. Полноценный лимит — этап «Готовность к продакшену».
- **Cache Components.** Страницы `/w/[workspaceSlug]/*` и `/invite/*` читают сессию — проверить `pnpm build` на ошибки «uncached data outside Suspense»; `revalidatePath` после мутаций обновляет layout пространства и переключатель.
- `pnpm check` и `pnpm build` должны оставаться зелёными после каждой commit-точки.
