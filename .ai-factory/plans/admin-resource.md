# План реализации: Администрирование ресурса — журнал действий, пространства, имперсонация, настройки

Branch: none (main; `git.create_branches: false`)
Created: 2026-10-19

## Settings
- Testing: yes (Vitest)
- Logging: standard (INFO на изменениях, WARN на отказах и «не найдено»; чтения — `debug`)
- Docs: yes  # обязательный docs checkpoint в /aif-implement через /aif-docs

## Roadmap Linkage
Milestone: "Администрирование ресурса"
Rationale: План закрывает этап целиком: подпункт «Пространства» (список, удаление, смена владельца, доступ администратора — через имперсонацию) и добавляет журнал действий, карточку пользователя, обзор и настройки ресурса. После плана этап отмечается `[x]`.

## Рамки этапа

**Входит:**
- **Журнал действий** (`AuditEvent`) — одна таблица для событий безопасности и ключевых действий:
  - безопасность: регистрация, вход (успешный — с методом: пароль / GitHub / 2FA), неудачный вход, выход, запрос и сброс пароля, смена пароля, подтверждение email, включение и отключение 2FA, новые резервные коды, завершение сессий, привязка и отвязка GitHub, выпуск и отзыв токенов;
  - пространство: создание, переименование, архив, восстановление, удаление; вступление по приглашению, исключение участника, смена роли и прав; приглашение отправлено и отменено; агент создан, отключён, включён; проект создан, в архиве, восстановлен, удалён;
  - содержимое: задача создана, в архиве, восстановлена, удалена; документ (заметка или файл) создан, удалён. Правки полей задачи в журнал **не** дублируются — у события задачи есть ссылка на неё, подробности — в её истории (`TaskHistoryEntry`);
  - администрирование: все действия администратора (блокировка, роль, сессии, 2FA, удаление, подтверждение email, письмо сброса, имперсонация, пространства, настройки).
- **Видимость событий** (поле каталога, не выбор пользователя):
  - `workspace` — события пространства и содержимого: видны всем участникам пространства в профиле участника (`/w/[slug]/members/[userId]`, секция «Последние действия») — только действия этого участника в этом пространстве;
  - `self` — события безопасности: видны самому пользователю (`/profile/security`, «Журнал входов и безопасности») и администратору;
  - `admin` — действия администраторов: только администратору.
  - IP и User-Agent хранятся только у событий безопасности и показываются только администратору и самому пользователю.
- **Админка — пользователи:** карточка `/admin/users/[userId]` — сведения (профиль, роль, бан, email и его подтверждение, 2FA, GitHub-аккаунт), пространства с ролями, активные сессии (IP, браузер, завершить одну или все), токены доступа (отозвать), журнал пользователя (события, где он автор или субъект). Новые действия: «Подтвердить email вручную», «Отправить письмо сброса пароля», «Отправить письмо подтверждения повторно», «Войти от имени».
- **Админка — журнал** `/admin/activity`: все события ресурса с фильтрами (пользователь, категория, тип, пространство, период), курсорная пагинация.
- **Имперсонация** (плагин `admin`): вход от имени пользователя на 1 час для поддержки и доступа к чужому пространству; баннер «Вы действуете от имени …» с кнопкой «Вернуться»; события под имперсонацией помечаются администратором (`impersonatorId`) и видны в ленте участника с пометкой «через администратора».
- **Админка — пространства** `/admin/workspaces` и `/admin/workspaces/[workspaceId]`: список (название, ключ, владельцы, участники, проекты, задачи, занятое хранилище, архив, дата создания; поиск, фильтр «активные / в архиве», сортировка, пагинация), карточка (участники с ролями, счётчики, квота, журнал пространства). Действия: в архив, восстановить, удалить навсегда (только из архива, ввод названия), назначить владельца (из участников-людей; прежний владелец — остаётся владельцем или становится участником по выбору), квота хранилища пространства.
- **Обзор ресурса** `/admin`: пользователи (всего, новые за 7/30 дней, заблокированные, администраторы, с 2FA), пространства (активные / в архиве), задачи, документы, занятое хранилище, активные сессии, неудачные входы за 24 часа; регистрации по дням за 30 дней (столбцы); состояние БД, хранилища, почты (`checkHealth`) и кнопка «Отправить тестовое письмо» себе.
- **Настройки ресурса** `/admin/settings`: регистрация — открыта / только по приглашению (есть активное приглашение на этот email) / закрыта; разрешённые домены email (пусто — любые); квота хранилища пространства по умолчанию. `ADMIN_EMAILS` регистрируются всегда (защита от потери доступа).
- **Срок хранения журнала** — `AUDIT_RETENTION_DAYS` (по умолчанию 180), очистка через `POST /api/cron/cleanup` (Bearer `CRON_SECRET`) и systemd-таймер.

**Не входит:**
- Режим «только просмотр» чужого пространства без членства — доступ администратора только через имперсонацию.
- Журнал правок полей задач, комментариев, вложений, перемещений по доске (есть история задачи и журнал MCP).
- Создание пользователей администратором, смена email/пароля/имени пользователя из админки.
- Уведомления пользователям о действиях администратора (блокировка, смена владельца).
- Экспорт журнала в CSV, внешние SIEM.
- Очистка объектов S3 удалённого пространства (отдельный пункт этапа «Эксплуатация», поведение как у удаления владельцем).

## Ключевые решения

- **Запись — `src/shared/audit/`, чтение — модуль `src/modules/audit/`.** Писать события нужно из `shared/auth` (хук `session.create.after` — единственное место, которое видит вход любым способом), а `shared` не зависит от модулей. Поэтому каталог типов и запись — сквозная инфраструктура, как `shared/realtime`:
  - `audit-catalog.ts` — `AUDIT_EVENT_KINDS` (`auth.sign_in`, `auth.sign_in_failed`, `workspace.member_removed`, `task.created`, `admin.user_banned`, …), для каждого: `category` (`security` | `workspace` | `content` | `admin`), `visibility` (`self` | `workspace` | `admin`), Zod-схема `data` (снимок для показа: `taskKey`, `title`, `workspaceName`, `role`, `method`, `reason`…; без секретов и свободного текста больше 200 символов).
  - `record-audit-event.ts` — `recordAuditEvent(input)`: валидирует `data` схемой типа, **никогда не бросает** (ошибка → `log.error`, как `notify`), пишет одной вставкой. Вызывается после успешного изменения (вне транзакции изменения; потеря события при падении процесса допустима — это не история задачи).
  - `auditActorFromSession(session)` → `{ actorId, impersonatorId, viaTokenId }` — единый способ указать автора (личный токен или агент — `viaTokenId`; имперсонация — `impersonatorId`).
  - `auditRequestContext(headers)` → `{ ip, userAgent }` (IP через `getClientIp`, User-Agent обрезается до 300 символов) — только для событий безопасности.
- **Модель `AuditEvent`**: `id` (uuid7), `kind String` (тип из каталога — строка, а не enum: новый тип без миграции), `category AuditCategory` (enum, для фильтра и индекса), `actorId String?` (FK `SetNull`) + `actorName String?` (снимок имени — событие удалённого пользователя остаётся читаемым), `impersonatorId String?` (FK `SetNull`), `viaTokenId Uuid?` (FK `SetNull`), `targetUserId String?` (FK `SetNull`; субъект: кого заблокировали, чей вход не удался), `workspaceId String?` (FK `SetNull`; имя — в `data`), `data Json`, `ip String?`, `userAgent String?`, `createdAt`. Индексы: `(actorId, createdAt)`, `(targetUserId, createdAt)`, `(workspaceId, actorId, createdAt)`, `(category, createdAt)`, `(createdAt)`.
- **Неудачный вход** пишется в `credentials.service` и шаге 2FA (`two-factor.service`) с `targetUserId` найденного по email пользователя (поиск по email — в репозитории модуля `auth`); для несуществующего email событие не пишется (не раскрываем и не копим чужие адреса), остаётся `warn` в логе. Успешный вход — в `databaseHooks.session.create.after` (`method` из `ctx.path`: `/sign-in/email`, `/callback/github`, `/two-factor/*`); сессии имперсонации там пропускаются — их пишет сервис имперсонации.
- **Чтение** (`src/modules/audit/`): срез `event/` — `listMemberWorkspaceActivity(session, workspaceId, userId, cursor)` (проверка членства через `requireWorkspaceAccess`; только `visibility = workspace`, `workspaceId`, `actorId = userId`), `listMySecurityEvents(cursor)`, `listAdminAuditEvents(query)` и `listUserAuditEvents(userId, cursor)` (`requireAdmin()`); `models/` — разбор фильтров и курсора (`createdAt` + `id`, по образцу `parseActivityCursor`), `describeAuditEvent(kind, data)` → строка «Перевёл в архив задачу TSK-42 „…“» и ссылка (чистая функция, тестируется). DTO даты — ISO + отформатированная строка на сервере. `purgeExpiredAuditEvents({ now, retentionDays })` — системная функция без сессии (только для `/api/cron/cleanup`), удаляет пачками по 5000.
- **Свежесть имени пространства и задачи**: снимок в `data` на момент события (переименования не переписывают журнал); ссылка строится по `workspaceId`/номеру задачи, для удалённых — без ссылки.
- **Имперсонация**: `admin({ impersonationSessionDuration: 3600 })`; правило модели `assertCanImpersonate(actor, target)` — не себя, не администратора (сначала снять роль), не агента (дублирует хук сессии), не заблокированного. `AuthSession.session.impersonatedBy: string | null` (из `Session.impersonatedBy`). `requireNotImpersonating(session)` в `shared/access` — запрещает под имперсонацией: смену пароля, 2FA, завершение сессий, выпуск токенов, привязку GitHub (`ForbiddenError` «Недоступно при входе от имени пользователя»). `stopImpersonating` возвращает исходную сессию администратора. Важно: под имперсонацией `getFreshSession` даёт роль пользователя — админка закрыта, это ожидаемо.
- **Пространства — системные функции в модуле `workspaces`** (без проверки сессии, JSDoc «только для admin, уже вызвавшего `requireAdmin()`» — как `listSoleOwnedWorkspaces`): `listAllWorkspaces(query)`, `getWorkspaceForAdmin(id)`, `setWorkspaceArchivedBySystem(id, archivedAt)`, `deleteWorkspaceBySystem(id)` (Prisma `delete` с каскадом — плагин `deleteOrganization` требует членства), `transferWorkspaceOwnership({ workspaceId, newOwnerUserId, demotePreviousOwners })` (транзакция; цель — участник-человек, не агент; после — минимум один владелец, правило модели `Membership`), `setWorkspaceStorageQuota(id, mb | null)`. Счётчики проектов/задач — `groupBy` в репозитории пространств; занятое хранилище — новая системная `getStorageUsageByWorkspaces(ids)` в `documents`.
- **Админ-срезы** в `src/modules/admin/slices/`: `user/` (расширение: карточка, сессии, токены, письма, подтверждение email), `workspace/`, `impersonation/`, `settings/`, `overview/`. Модели: `admin-workspace-query.ts`, `admin-workspace.ts` (правила), `impersonation.ts`. Зависимости `admin` → `audit`, `workspaces`, `documents`, `api-tokens`, `profiles`, `integrations/github` (GitHub-аккаунт пользователя) — только через `index.ts`; обратных нет.
- **Сессии и токены пользователя**: сессии — `auth.api.listUserSessions` / `revokeUserSession` через `callAdminApi`; токены — новые функции `api-tokens`: `listUserApiTokensForAdmin(userId)`, `revokeApiTokenBySystem(tokenId)` (только токены этого пользователя, не агентские). Подтверждение email — `auth.api.adminUpdateUser({ data: { emailVerified: true } })`; письмо сброса — `auth.api.requestPasswordReset` для email пользователя; оба — с `enforceRateLimit` (новые правила `admin-mail`: 10/час на администратора).
- **Настройки ресурса** — `src/shared/resource-settings/` (как `shared/github-app`): модель `ResourceSettings` (одна строка `id = 'default'`: `signupMode` enum `open | invite_only | closed`, `allowedEmailDomains String[]`, `defaultWorkspaceQuotaMb Int?`, `updatedAt`, `updatedById`), `loadResourceSettings()` с кешем процесса на 30 с и сбросом при сохранении. Применение:
  - `databaseHooks.user.create.before` — `assertSignupAllowed({ email, settings, hasPendingInvitation, isAdminEmail })` (чистая функция); отказ → `APIError('FORBIDDEN', 'Регистрация закрыта')`. Покрывает email и GitHub. Агенты создаются в обход (проверить путь создания в `agents`; при необходимости — пропуск по `isAgent`).
  - `credentials.errors` — маппинг отказа в понятное сообщение формы; `/register` при `closed` показывает сообщение вместо формы, ссылка «Регистрация» на `/login` скрывается.
  - Квота документов: `workspace.storageQuotaMb ?? settings.defaultWorkspaceQuotaMb ?? env.DOCUMENTS_WORKSPACE_QUOTA_MB` — функция `resolveWorkspaceQuotaMb` в `documents/models`.
- **Обзор** — `admin/slices/overview/`: один сервис `getResourceOverview()` (агрегаты `count`/`groupBy` параллельно; регистрации по дням — `$queryRaw` с `date_trunc('day', …)` в UTC), `checkHealth()` из `shared/health`, `sendTestMailAction` (rate limit, на свой email, письмо через `sendMail`, результат — в форму, ошибка SMTP — без деталей клиенту).
- **Навигация админки**: «Обзор», «Пользователи», «Пространства», «Журнал», «Настройки», «Интеграции». `/admin` — страница обзора вместо редиректа.
- **UI** — как в существующей админке (`components/admin/users/`): таблицы, тулбар с URL-состоянием, `ConfirmActionDialog`, `SettingsSection` для настроек. Лента событий — общий компонент `components/audit/audit-event-list.tsx` (иконка категории, текст, относительное время `format-relative-time`, пометки «через агента» `ViaAgentBadge` и «через администратора», «Показать ещё» по курсору через Server Action).

## Совместимость с будущим IdP

Позже вход переедет в отдельный сервис `auth.plwedding.ru` (этап роадмапа «Единый вход (SSO) для tasker и meet»): tasker и meet станут OIDC-клиентами, локальные сессии Better Auth в tasker останутся. Регистрация остаётся свободной, своего допуска поверх IdP у tasker не будет. Журнал и админка должны работать и после переезда, поэтому оставшиеся задачи (7–17) делаются с такими ограничениями:

- **Владелец типа события.** В каталоге `shared/audit` у каждого типа есть `owner: 'identity' | 'app'`:
  - `identity` — события учётной записи: `auth.*` и действия администратора над учётной записью (`admin.user_banned`, `user_unbanned`, `user_sessions_revoked`, `user_session_revoked`, `user_two_factor_reset`, `user_email_verified`, `password_reset_sent`). Как и вход, они переедут в IdP;
  - `app` — пространства, содержимое, токены, агенты, имперсонация, пространства в админке, квоты.

  Тест каталога проверяет, что у каждого типа указан владелец.
- **Источник событий не важен для показа.** `AuditEventDto` и `describeAuditEvent(kind, data)` строятся только из `kind`, `data` и снимков (`actorName`), без зависимости от локальных связей. Событие из IdP с тем же `kind` и `data` выглядит так же. Курсор `createdAt + id` (uuid7) позволяет слить две ленты по времени. Функции чтения (`listMySecurityEvents`, `listUserAuditEvents`, `listAdminAuditEvents`) — единственная точка, где потом добавится вторая лента из API IdP.
- **Операции над учётной записью — через один порт.** Сессии, бан, роль, сброс 2FA, подтверждение email, письма сброса и подтверждения (задачи 7, 8) вызываются только через `callAdminApi` и функции модуля `auth`, без `auth.api` из других срезов. После переезда меняется реализация порта (HTTP к admin API IdP), сервисы, actions и UI остаются прежними.
- **Метрики учётных записей — через модуль `auth`.** Для обзора (задача 16) нужны регистрации по дням, неудачные входы за 24 часа, активные сессии, число пользователей с 2FA и заблокированных. Их отдают функции модуля `auth`, а не прямые запросы `overview` к `User` и `Session`, чтобы потом заменить источник одним местом.
- **Настройки ресурса — две независимые группы** (задачи 14, 15):
  - «Регистрация» (`signupMode`, `allowedEmailDomains`, по умолчанию `open`) — `identity`, переедет в IdP вместе с проверкой в `user.create.before`;
  - «Хранилище» (`defaultWorkspaceQuotaMb`) — остаётся в tasker.

  Отдельные функции (`getSignupPolicy` и `resolveWorkspaceQuotaMb`) и отдельные секции формы; группа «Регистрация» должна удаляться без правок в группе «Хранилище».
- **Имперсонация остаётся в tasker** (задача 10): она работает на локальных сессиях. `requireNotImpersonating` для пароля, 2FA и сессий потеряет смысл, когда эти действия переедут в IdP; для токенов и привязки GitHub защита остаётся.
- **Срок хранения** (задача 17): `purgeExpiredAuditEvents` — без привязки к типам событий, чтобы IdP мог взять ту же функцию для своей таблицы.
- **История при переезде** (решается в плане SSO, не здесь): строки `owner = identity` переносятся в таблицу журнала IdP той же схемы, `userId` сопоставляется с `sub`. Либо остаются в tasker только для чтения и сливаются в ленте. Обе схемы возможны, если соблюдены пункты выше.

## Commit Plan
- **Commit 1** (после задач 1–4): `feat(audit): add audit event log with security and workspace events`
- **Commit 2** (после задач 5–6): `feat(audit): member activity feed and personal security log`
- **Commit 3** (после задач 7–9): `feat(admin): user card, sessions, tokens and global activity log`
- **Commit 4** (после задачи 10): `feat(admin): impersonation with audit and banner`
- **Commit 5** (после задач 11–13): `feat(admin): workspaces management`
- **Commit 6** (после задач 14–17): `feat(admin): resource settings, overview and audit retention`
- **Commit 7** (после задачи 18): `docs: admin resource milestone`

## Tasks

### Phase 1: Журнал действий — данные и запись

- [x] Task 1: Схема БД
  - `prisma/schema.prisma`: enum `AuditCategory`, модель `AuditEvent` (поля и индексы — см. «Ключевые решения»), связи в `User` (`auditEventsAsActor`, `…AsImpersonator`, `…AsTarget`), `Workspace`, `ApiToken`; enum `SignupMode`, модель `ResourceSettings`; `Workspace.storageQuotaMb Int?` (поле вне схемы плагина `organization`, как `icon`). Обновить комментарий-шапку в `AGENTS.md` позже (задача 18).
  - Миграция `pnpm db:migrate --name admin_audit_and_settings`; проверить сгенерированный SQL (индексы, `ON DELETE SET NULL`).
  - Логи: не применимо.

- [x] Task 2: `src/shared/audit/` — каталог и запись
  - `audit-catalog.ts`: `AUDIT_EVENT_KINDS`, `AUDIT_CATEGORIES`, метаданные типа (`category`, `visibility`, `dataSchema`), тип `AuditEventKind`, `AuditEventData<K>`.
  - `record-audit-event.ts`: `recordAuditEvent({ kind, actor, targetUserId?, workspaceId?, data, request? })` — валидация, вставка через `prisma`, never-throw; `auditActorFromSession`, `auditRequestContext`; `index.ts`.
  - Правило границ в `eslint.config.mjs` (если `shared/*` перечислены поимённо).
  - Тесты: `audit-catalog.test.ts` (у каждого типа есть категория/видимость/схема; события безопасности — `self`, админские — `admin`), `record-audit-event.test.ts` (неверные данные → не бросает, `log.error`; ip/userAgent отбрасываются у не-security; обрезка длинных строк; актор из сессии токена и имперсонации).
  - Логи: `debug` `[audit.record]` (`kind`, `actorId`, `workspaceId`), `error` `[audit.record] failed` (`kind`, `err`); данные события не логировать.

- [x] Task 3: События аутентификации и безопасности
  - `src/shared/auth/session.ts`: `impersonatedBy` в `AuthSession.session` (и в `getFreshSession`).
  - `src/shared/auth/auth.ts`: `databaseHooks.session.create.after` → `auth.sign_in` (`method`, ip, UA; пропуск имперсонации и агентов); `user.create.after` → `auth.signed_up`; `afterEmailVerification` → `auth.email_verified`.
  - `src/modules/auth/`: `credentials.service` (неудачный вход → `auth.sign_in_failed` с `targetUserId`, выход → `auth.sign_out`), `password.service` (`password_reset_requested` — только при существующем пользователе, `password_reset`, `password_changed`), `two-factor.service` (`two_factor_enabled`, `_disabled`, `backup_codes_regenerated`, неудачный код → `sign_in_failed` с `method: 'two-factor'`), `session.service` (`sessions_revoked`), GitHub-привязка в `integrations/github/slices/identity` (`github_linked`, `github_unlinked`), `api-tokens` (`token_issued`, `token_revoked` — с `workspaceId`, имя токена в `data`, без значения).
  - Репозиторий `auth`: `findUserIdByEmail(email)`.
  - Тесты: дополнить `credentials.service.test.ts`, `password.service.test.ts`, `two-factor.service.test.ts`, `session.service.test.ts` — событие пишется с нужным типом/субъектом; для неизвестного email — не пишется; ошибка записи не ломает вход.
  - Логи: существующие `info`/`warn` сохраняются; новых не нужно (пишет `shared/audit`).

- [x] Task 4: События пространства, содержимого и администратора
  - `workspaces`: `workspace.service` (`created`, `renamed`, `archived`, `restored`, `deleted` — снимок имени), `member.service` (`member_removed`, `member_role_changed`, `member_permissions_changed`, вступление — в `afterAcceptInvitation` хуке или сервисе приглашений → `member_joined`), `invitation.service` (`invitation_sent`, `invitation_canceled`; email приглашённого в `data` — маской `maskEmail`).
  - `agents`: `agent_created`, `agent_disabled`, `agent_enabled`. `projects`: `project_created`, `project_archived`, `project_restored`, `project_deleted`.
  - `tasks`: `task.created`, `task.archived`, `task.restored`, `task.deleted` (`taskKey`, `title` до 200 символов) — в сервисах, общих для UI и MCP, чтобы действия агентов попадали автоматически (`auditActorFromSession` даёт `viaTokenId`).
  - `documents`: `document.created` (заметка и подтверждённая загрузка файла), `document.deleted`.
  - `admin/slices/user/user.service.ts`: `admin.user_banned` (срок и причина до 500 символов в `data` — видимость `admin`, в pino причина по-прежнему не пишется), `user_unbanned`, `user_role_changed`, `user_sessions_revoked`, `user_two_factor_reset`, `user_deleted` (снимок email маской, имя) — `targetUserId` = пользователь.
  - Тесты: по одному кейсу «пишет событие» в существующих `*.service.test.ts` затронутых срезов (мок `recordAuditEvent`); проверка, что события задач через сессию токена несут `viaTokenId`.
  - Логи: не добавлять (пишет `shared/audit`).

### Phase 2: Журнал — чтение и ленты для пользователей

- [x] Task 5: Модуль `src/modules/audit/`
  - `models/audit-query.ts` (`AdminAuditQuery { userId?, category?, kind?, workspaceId?, from?, to?, cursor? }`, `parseAdminAuditParams`, `parseAuditCursor`/`encodeAuditCursor`), `models/describe-audit-event.ts` (`describeAuditEvent(kind, data, { perspective })` → `{ text, href | null }`; формы «Вошёл через GitHub», «Заблокировал пользователя … на 7 дней», «Создал задачу TSK-42 „…“»).
  - `slices/event/`: `event.repository.ts` (выборки с `take: limit + 1`, `select` только нужных полей, join имён актора/субъекта/администратора), `event.service.ts` (`listMemberWorkspaceActivity`, `listMySecurityEvents`, `listAdminAuditEvents`, `listUserAuditEvents`, `purgeExpiredAuditEvents`), `event.dto.ts` (`AuditEventDto { id, kind, category, text, href, actor, impersonator, viaAgent, ip?, userAgent?, createdAt }` — ip/UA только в админских и «моих» выборках), `event.actions.ts` (`loadMoreMemberActivityAction`, `loadMoreMySecurityEventsAction`, `loadMoreAdminAuditAction`).
  - `index.ts`, `client.ts`.
  - Тесты: `describe-audit-event.test.ts` (каждый тип каталога даёт текст; удалённая задача — без ссылки), `audit-query.test.ts` (некорректные параметры, курсор), `event.service.test.ts` (не-участник → `NotFoundError`/`ForbiddenError`; лента участника фильтрует `visibility = workspace` и `workspaceId`; не-админ → `ForbiddenError`; ip не попадает в ленту участника).
  - Логи: `debug` на выборках (`actorId`, `workspaceId`, `count`, `hasMore`), `info` `[audit.purge]` (`deleted`, `cutoff`).

- [x] Task 6: Ленты в профиле участника и в своём профиле
  - `src/components/audit/audit-event-list.tsx` (+ `audit-event-item.tsx`, `load-more-audit-events.tsx`): иконка категории, текст со ссылкой, `time` с относительным временем, `ViaAgentBadge`, пометка «через администратора», пустое состояние.
  - `src/app/(app)/w/[workspaceSlug]/members/[userId]/page.tsx`: секция «Последние действия» (20 событий + «Показать ещё») под карточками задач, в отдельном `<Suspense>`.
  - `src/app/(app)/profile/security/page.tsx`: секция «Журнал безопасности» (`SettingsSection`) — входы с IP и браузером (разбор UA — существующая модель `auth`), смены пароля, 2FA, сессии, токены.
  - Логи: нет (клиентские компоненты и тонкие страницы).

### Phase 3: Админка — пользователи и общий журнал

- [x] Task 7: Сервис карточки пользователя и новые действия
  - `admin/slices/user/`: `getAdminUserDetail(userId)` (профиль через `profiles`, пространства и роли — новая `listUserMemberships(userId)` в `workspaces`, GitHub-аккаунт — `integrations/github`, сессии — `listUserSessions` плагина + разбор UA), `revokeUserSession({ userId, sessionToken })`, `revokeUserApiToken({ userId, tokenId })`, `verifyUserEmail`, `sendPasswordResetEmail`, `resendVerificationEmail`; actions и Zod-схемы; события `admin.user_session_revoked`, `admin.user_token_revoked`, `admin.user_email_verified`, `admin.password_reset_sent`.
  - `api-tokens`: `listUserApiTokensForAdmin`, `revokeApiTokenBySystem` (проверка владельца токена и что токен личный).
  - `shared/rate-limit`: правило `admin-mail`.
  - Тесты: `user.service.test.ts` — агент/не найден → `NotFoundError`; отзыв чужого токена → `NotFoundError`; подтверждение уже подтверждённого → `ValidationError`; rate limit на письмах; событие пишется.
  - Логи: `info` `[admin.user.revokeSession]`, `[admin.user.revokeToken]`, `[admin.user.verifyEmail]`, `[admin.user.sendPasswordReset]`; `warn` на отказах; email — `maskEmail()`.

- [x] Task 8: UI карточки пользователя
  - `src/app/(app)/admin/users/[userId]/page.tsx` (`requireAdminOrNotFound`, `notFound()` на `NotFoundError`); ссылка на карточку из имени в `admin-users-table.tsx`.
  - `src/components/admin/users/detail/`: `user-detail-header.tsx` (аватар, имя, бейджи, меню действий — переиспользовать `user-actions-menu.tsx` + новые пункты), `user-memberships.tsx` (ссылки на `/admin/workspaces/[id]`), `user-sessions-table.tsx` (завершить одну), `user-tokens-table.tsx` (отозвать), журнал — `AuditEventList` с админской перспективой (IP, UA).
  - Логи: нет.

- [x] Task 9: Общий журнал `/admin/activity`
  - `src/app/(app)/admin/activity/page.tsx` + `src/components/admin/activity/`: тулбар фильтров (пользователь — поиск по email/имени через `searchAdminUsersAction`, категория, тип, пространство, период), лента с курсором, состояние в URL (`admin-activity-href.ts`).
  - `admin-nav.tsx`: вкладки «Обзор», «Пользователи», «Пространства», «Журнал», «Настройки», «Интеграции» (ссылки на ещё не готовые разделы добавлять вместе с задачами).
  - Логи: нет.

### Phase 4: Имперсонация

- [x] Task 10: Вход от имени пользователя
  - `src/shared/auth/auth.ts`: `impersonationSessionDuration: 3600`.
  - `src/modules/admin/models/impersonation.ts`: `assertCanImpersonate`; `slices/impersonation/`: `startImpersonation({ userId })` (`requireAdmin` → правило → `enforceRateLimit` → `callAdminApi(impersonateUser)` → `admin.impersonation_started`), `stopImpersonation()` (`stopImpersonating` → `admin.impersonation_stopped`, актор — администратор из `impersonatedBy`); actions с редиректом на `/` и обратно на карточку пользователя.
  - `src/shared/access/`: `requireNotImpersonating(session)`; вызвать в сервисах смены пароля, 2FA, сессий, токенов, привязки GitHub.
  - Баннер: `src/components/layout/impersonation-banner.tsx` в шапке `(app)` (по `session.session.impersonatedBy`: «Вы действуете от имени {name} — до {время}», кнопка «Вернуться к своей учётной записи»). Пункт «Войти от имени» в меню пользователя админки (с подтверждением).
  - Пометка «через администратора» в ленте участника — по `impersonatorId` (задача 6).
  - Тесты: `impersonation.test.ts` (себя, админа, агента, заблокированного), `impersonation.service.test.ts` (события старта и выхода, rate limit), `guards.test.ts` (`requireNotImpersonating`).
  - Логи: `info` `[admin.impersonation.start]` (`actorId`, `userId`), `[admin.impersonation.stop]`; `warn` на отказах и попытках запрещённых действий под имперсонацией.

### Phase 5: Админка — пространства

- [x] Task 11: Системные функции модулей для пространств
  - `workspaces`: репозиторий и сервис — `listAllWorkspaces(query)` (поиск по названию/slug/ключу, архив, сортировка, пагинация, владельцы и счётчики участников/проектов/задач одним набором запросов), `getWorkspaceForAdmin`, `listUserMemberships`, `setWorkspaceArchivedBySystem`, `deleteWorkspaceBySystem`, `transferWorkspaceOwnership`, `setWorkspaceStorageQuota`; правило `assertCanTransferOwnership` в `models/` (цель — участник, не агент; итог — ≥ 1 владелец). Публикация реалтайм-события пространства при смене ролей и архиве, если так делают обычные сервисы.
  - `documents`: `getStorageUsageByWorkspaces(ids)`, `resolveWorkspaceQuotaMb` (используется в `file.service.ts` вместо `workspaceQuotaBytes()`; источник настроек ресурса — задача 14, до неё — `null`).
  - Тесты: `member/workspace.service.test.ts` — передача агенту → `ValidationError`; не-участнику → `NotFoundError`; понижение прежних владельцев; удаление не из архива → `ValidationError`; `resolveWorkspaceQuotaMb` — порядок приоритетов.
  - Логи: `info` `[workspace.system.archive|restore|delete|transferOwnership|setQuota]` (`workspaceId`, `actorId` передаётся аргументом), `debug` на списке.

- [x] Task 12: Админ-срез пространств
  - `admin/models/admin-workspace-query.ts` (`parseAdminWorkspaceListParams`, сортировки, фильтр архива), `admin/models/admin-workspace.ts` (подтверждение названием, лимиты квоты 0–1 000 000 МБ).
  - `admin/slices/workspace/`: сервис (`listAdminWorkspaces`, `getAdminWorkspaceDetail` — + журнал пространства через `audit`, `archive`, `restore`, `delete`, `transferOwnership`, `setStorageQuota`; всё после `requireAdmin()`), actions, схемы, DTO; события `admin.workspace_archived`, `_restored`, `_deleted`, `_owner_changed`, `_quota_changed` с `workspaceId` и снимком названия.
  - Тесты: `admin-workspace-query.test.ts`, `workspace.service.test.ts` (не-админ, неверное подтверждение, события).
  - Логи: `info` на изменениях, `warn` на отказах, `debug` на списке.

- [x] Task 13: UI пространств
  - `src/app/(app)/admin/workspaces/page.tsx`, `src/app/(app)/admin/workspaces/[workspaceId]/page.tsx`.
  - `src/components/admin/workspaces/`: тулбар, таблица, пагинация, `admin-workspaces-href.ts`, меню действий; диалоги `delete-workspace-dialog.tsx` (ввод названия), `transfer-ownership-dialog.tsx` (выбор участника, флажок «Сделать прежних владельцев участниками»), `storage-quota-dialog.tsx` (МБ или «по умолчанию»); на карточке — участники, счётчики, хранилище (занято / квота), журнал пространства, кнопка «Войти от имени владельца» (имперсонация).
  - Вкладка «Пространства» в `admin-nav.tsx`.
  - Логи: нет.

### Phase 6: Настройки, обзор, срок хранения

- [x] Task 14: Настройки ресурса — хранение и применение
  - `src/shared/resource-settings/`: `loadResourceSettings()` (кеш 30 с), `saveResourceSettings(input, actorId)` (upsert, сброс кеша), `assertSignupAllowed` (чистая), `SIGNUP_MODES`.
  - `src/shared/auth/auth.ts`: проверка в `user.create.before` (наличие активного приглашения — запрос `WorkspaceInvitation` по email со статусом `pending` и неистёкшим сроком); проверить, что создание агентов не проходит через хук или пропускается.
  - `src/modules/auth/`: маппинг отказа в `credentials.errors.ts`; `getSignupPolicy()` для страниц `/register` и `/login`; сообщение для входа через GitHub (`social.messages.ts`).
  - `documents`: `resolveWorkspaceQuotaMb` берёт `defaultWorkspaceQuotaMb` из настроек.
  - Тесты: `assert-signup-allowed.test.ts` (режимы, домены без учёта регистра, `ADMIN_EMAILS`, приглашение), `credentials.errors.test.ts`.
  - Логи: `info` `[resourceSettings.save]` (`actorId`, изменённые ключи), `warn` `[auth.hooks] signup rejected` (`reason`, домен email — без локальной части).

- [x] Task 15: Страница настроек
  - `admin/slices/settings/`: `getAdminResourceSettings`, `updateResourceSettingsAction` (Zod: режим, до 50 доменов с проверкой формата, квота 1–1 000 000 МБ или пусто), событие `admin.settings_changed` (`changed` — список ключей и новые значения).
  - `src/app/(app)/admin/settings/page.tsx`, `src/components/admin/settings/resource-settings-form.tsx` (`SettingsSection`: «Регистрация», «Домены email», «Хранилище»); вкладка «Настройки».
  - Тесты: `settings.schema.test.ts`, `settings.service.test.ts`.
  - Логи: `info` на сохранении (через `shared/resource-settings`), `warn` на отказе валидации.

- [x] Task 16: Обзор ресурса
  - `admin/slices/overview/`: `getResourceOverview()` (агрегаты, регистрации по дням за 30 дней, неудачные входы за 24 часа из `AuditEvent`, активные сессии `expiresAt > now`, хранилище — сумма по `documents` и вложениям задач), `sendTestMailAction` (`enforceRateLimit('admin-mail')`, `sendMail` на свой email, событие `admin.test_mail_sent`).
  - `src/app/(app)/admin/page.tsx`: обзор вместо `redirect('/admin/users')`; `src/components/admin/overview/`: плитки (как `components/dashboard/`), столбцы регистраций (без внешних библиотек, как полосы дашборда), блок «Состояние» (`checkHealth`), карточка «Почта» с кнопкой тестового письма; ссылки с плиток на отфильтрованные списки (`/admin/users?status=banned`, `/admin/activity?kind=auth.sign_in_failed`).
  - Тесты: `overview.service.test.ts` (не-админ, заполнение пропущенных дней нулями — чистая функция `fillDailySeries` в `models/`), тест чистой функции.
  - Логи: `debug` `[admin.overview]` (длительность), `info` `[admin.testMail] sent`, `warn` при ошибке SMTP.

- [x] Task 17: Срок хранения журнала
  - `src/shared/env/`: `AUDIT_RETENTION_DAYS` (int, 30–3650, по умолчанию 180); `.env.example`.
  - `src/app/api/cron/cleanup/route.ts`: как `cron/reminders` (вынести `isAuthorized` в общий `src/app/api/cron/cron-auth.ts`), вызывает `purgeExpiredAuditEvents`; заодно — удаление истёкших `ActionRateLimit`, если это ещё нигде не делается.
  - `deploy/tasker/cleanup.sh`, `deploy/tasker/systemd/tasker-cleanup.service` и `.timer` (ежедневно ночью), установка в `deploy/bootstrap-server.sh`; `scripts/run-cleanup.mjs` и `pnpm cleanup:run`.
  - Тесты: `route.test.ts` (без секрета — 404, неверный — 401), `event.service.test.ts` — граница срока.
  - Логи: `info` `[cron.cleanup]` (`auditDeleted`, `rateLimitDeleted`), `warn` на 401.

### Phase 7: Документация и дорожная карта

- [x] Task 18: Документация, `AGENTS.md`, `ROADMAP.md`
  - `docs/architecture.md`: раздел «Журнал действий» (каталог, видимость, запись в `shared/audit`, что не пишется, срок хранения), «Администрирование» — карточка пользователя, пространства (системные функции), имперсонация (ограничения, баннер, пометки), настройки ресурса (регистрация, домены, квоты), обзор.
  - `docs/configuration.md`: `AUDIT_RETENTION_DAYS`, приоритет квот; `docs/production.md`: таймер `tasker-cleanup`; `docs/getting-started.md`: первый администратор и режим регистрации.
  - `AGENTS.md`: модуль `audit`, `shared/audit`, `shared/resource-settings`, маршруты `/admin` (обзор), `/admin/users/[userId]`, `/admin/workspaces(/[id])`, `/admin/activity`, `/admin/settings`, `/api/cron/cleanup`, модели `AuditEvent`, `ResourceSettings`, `Workspace.storageQuotaMb`, `components/audit/`.
  - `.ai-factory/ROADMAP.md`: подпункт «Пространства» → `[x]`, новые подпункты `[x]` «Журнал действий», «Имперсонация», «Обзор и настройки ресурса» (план `admin-resource`); этап `[x]`, строка в таблице «Завершено».
  - Логи: не применимо.
