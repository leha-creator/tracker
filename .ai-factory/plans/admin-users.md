# План реализации: Администрирование ресурса — пользователи

Branch: none (main; `git.create_branches: false`)
Created: 2026-10-16

## Settings
- Testing: yes (Vitest)
- Logging: standard (INFO на изменениях, WARN на отказах и «не найдено»; чтения — `debug`)
- Docs: yes  # обязательный docs checkpoint в /aif-implement через /aif-docs

## Roadmap Linkage
Milestone: "Администрирование ресурса"
Rationale: План закрывает часть этапа — управление пользователями. Управление пространствами (список, удаление, смена владельца, доступ администратора к чужому пространству) — отдельный план; в `ROADMAP.md` этап остаётся открытым, добавляется подпункт «Пользователи».

## Рамки этапа

**Входит:**
- Раздел `/admin/users` (и `/admin` → редирект или карточка-навигация на него): таблица всех пользователей ресурса.
  - Колонки: имя + email, глобальная роль, статус (активен / заблокирован до … / бессрочно, причина), число пространств, дата регистрации.
  - Поиск по имени и email (`q`, без учёта регистра), фильтры: роль (`user` / `admin`), статус (`active` / `banned`). Сортировка: дата регистрации (по умолчанию, новые сверху), имя, email. Пагинация по 50. Состояние — в URL (как в списке задач).
- Действия над пользователем (меню в строке):
  - **Заблокировать** — диалог: необязательная причина (до 500 символов) и срок (бессрочно / 1 день / 7 дней / 30 дней). Все сессии пользователя завершаются (это делает плагин).
  - **Разблокировать**.
  - **Сделать администратором / Снять роль администратора**.
  - **Завершить все сессии** (принудительный выход без блокировки).
  - **Удалить** — с подтверждением (ввод email пользователя). Запрещено, если пользователь — единственный владелец хотя бы одного пространства: ошибка перечисляет такие пространства и предлагает заблокировать.
- Свежая сессия (без cookie-кеша) для проверки роли администратора.

**Не входит:**
- Управление пространствами из админки (следующий план этапа).
- Создание пользователей администратором, смена email/пароля/имени, имперсонация.
- Журнал действий администратора (audit log) — только структурированные логи.
- Уведомления пользователю по почте о блокировке/удалении.
- Мгновенная потеря доступа заблокированным пользователем вне админки (см. «Ключевые решения» — окно до 5 минут).

## Ключевые решения

- **Новый модуль `src/modules/admin/`** со срезом `slices/user/`: `user.schema.ts`, `user.repository.ts`, `user.service.ts`, `user.actions.ts`, `user.dto.ts`; `models/` — правила; `admin-api.ts` — обёртка `callAdminApi` (по образцу `workspaces/organization-api.ts`) с маппингом ошибок плагина в доменные (`admin.errors.ts`: `YOU_CANNOT_BAN_YOURSELF`, `YOU_CANNOT_REMOVE_YOURSELF` → `ValidationError`; `USER_NOT_FOUND` → `NotFoundError`; `YOU_ARE_NOT_ALLOWED_*` → `ForbiddenError`; прочее → `InternalError` с логом). `index.ts` (сервер), `client.ts` (actions, Zod-схемы, константы и типы для клиентских компонентов).
  - Зависимости: `admin` → `workspaces` (через `index.ts`). Обратной зависимости нет. Добавить `admin` в правила границ `eslint.config.mjs`, если там перечислены модули поимённо.
- **Чтение — своим репозиторием (Prisma), изменения — через `auth.api.*` плагина `admin`** (как у пространств): `listUsers` плагина умеет искать только по одному полю и не отдаёт счётчики. Мутации: `banUser`, `unbanUser`, `setRole`, `revokeUserSessions`, `removeUser` — плагин сам удаляет сессии и учётные записи.
- **Число пространств и единоличное владение** — из модуля `workspaces` (новые функции в публичном API, без проверки сессии, для серверных модулей, которые уже проверили права — как `isWorkspaceMember`):
  - `countWorkspacesByUsers(userIds: string[]): Promise<Map<string, number>>` — один `groupBy` по `WorkspaceMember.userId`.
  - `listSoleOwnedWorkspaces(userId): Promise<{ id, name, slug }[]>` — пространства, где пользователь `owner` и других владельцев нет.
- **Правила — в модели `models/admin-user.ts`** (чистый TS, без Prisma):
  - `BAN_DURATIONS = ['forever', '1d', '7d', '30d']` → `banDurationToSeconds()` (`forever` → `undefined`); `BAN_REASON_MAX_LENGTH = 500`; `ADMIN_USERS_PAGE_SIZE = 50`.
  - `resolveBanState({ banned, banExpires }, now)` → `{ kind: 'active' } | { kind: 'banned', until: Date | null }`: истёкший бан считается снятым (плагин снимает его только при следующем входе).
  - `assertCanManageUser(actorId, target)` — нельзя действовать над собой (бан, снятие роли, удаление, завершение сессий): защищает от потери последнего администратора и самоблокировки.
  - `assertCanBan(target)` / `assertCanDelete(target, soleOwned)` — администратора нельзя заблокировать или удалить, пока у него есть роль `admin` (сначала снять роль — явный двухшаговый сценарий); удаление запрещено при непустом `soleOwned` (`ConflictError` с названиями пространств).
  - `assertRoleChange(target, role)` — роль уже такая → `ValidationError`.
- **Разбор параметров списка** — `models/admin-user-query.ts`: `parseAdminUserListParams(searchParams)` → `AdminUserListQuery { q, role, status, sort, dir, page }` с безопасными значениями по умолчанию (по образцу `task-list-query.ts`); `q` обрезается до 100 символов. Фильтр `status=banned` учитывает срок: `banned = true AND (banExpires IS NULL OR banExpires > now)`.
- **Свежая сессия для админки.** В `shared/auth/session.ts` добавить `getFreshSession()` — `getAuth().api.getSession({ headers, query: { disableCookieCache: true } })` (тот же маппинг в DTO, `cache()` на запрос). `requireAdmin()` и `requireAdminOrNotFound()` используют её: снятая роль или блокировка действуют в админке сразу. Остальной код остаётся на `getSession()` с cookie-кешем 5 минут — заблокированный пользователь теряет доступ к пространствам не позже чем через 5 минут (сессии в БД удалены, кеш истекает). Задокументировать в `docs/architecture.md`.
- **Безопасность.** Каждый сервисный метод первым делом вызывает `requireAdmin()`; `userId` во входе — непустая строка до 64 символов (id Better Auth — не UUID). Удаление требует совпадения введённого email с email пользователя (проверка на сервере). DTO не содержит `Account`/паролей; email в логах — только через `maskEmail()`.
- **DTO.** `AdminUserDto { id, name, email, image, role, ban: { kind, until, reason }, workspacesCount, createdAt, isCurrentUser }`; `AdminUserListDto { items, total, page, pageCount }`. Даты форматируются на сервере (`Intl.DateTimeFormat('ru')`) и передаются строками вместе с ISO для `<time>` — как в комментариях.
- **Server Actions** (`FormState` + `useActionState`): `banUserAction`, `unbanUserAction`, `setUserRoleAction`, `revokeUserSessionsAction`, `deleteUserAction`. Ревалидация — только `revalidatePath('/admin', 'layout')`: данные других страниц эти действия не меняют. Перед реализацией сверить сигнатуру `revalidatePath` в `node_modules/next/dist/docs`.
- **UI.** Страница — Server Component внутри `<Suspense>` (без собственного `metadata.title`, как сейчас у `/admin`). Таблица и тулбар — по образцу `components/tasks/task-list/`. `ConfirmActionDialog` переносится из `components/workspaces/` в `components/forms/` (общий компонент; обновить импорты).

## Commit Plan
- **Commit 1** (после задач 1–4): `feat(admin): add admin users module with ban, role and delete actions`
- **Commit 2** (после задач 5–7): `feat(admin): users management page`

## Tasks

### Phase 1: Доступ и домен

- [x] Task 1: Свежая сессия для проверок администратора
  - `src/shared/auth/session.ts`: `getFreshSession()` — `getSession` плагина с `query: { disableCookieCache: true }`, общий маппинг в `AuthSession` вынести в функцию `toAuthSession()`; обернуть в `cache()`. Экспорт из `src/shared/auth/index.ts`.
  - `src/shared/access/guards.ts`: `requireAdmin()` и `requireAdminOrNotFound()` используют свежую сессию (для `requireAdminOrNotFound` — свой вариант редиректа на вход, как `requireUserOrRedirect`, но на свежей сессии).
  - Тесты: `src/shared/access/guards.test.ts` — `requireAdmin` берёт свежую сессию; заблокированный → `ForbiddenError`; `user` → `ForbiddenError`.
  - Логи: `debug` `[auth.getFreshSession]` (`hasSession`, `userId`), ошибка чтения — `error`, как в `getSession`.

- [x] Task 2: Модели и схемы модуля `admin`
  - `src/modules/admin/models/admin-user.ts`: константы, `banDurationToSeconds`, `resolveBanState`, `assertCanManageUser`, `assertCanBan`, `assertCanDelete`, `assertRoleChange` (см. «Ключевые решения»). Ошибки — `ValidationError` / `ForbiddenError` / `ConflictError` из `@/shared/errors` с русскими сообщениями.
  - `src/modules/admin/models/admin-user-query.ts`: `AdminUserListQuery`, `parseAdminUserListParams`, `ADMIN_USER_SORTS`, значения по умолчанию.
  - `src/modules/admin/models/index.ts`.
  - `src/modules/admin/slices/user/user.schema.ts`: Zod-схемы `banUserSchema` (`userId`, `reason?` ≤ 500 после trim, `duration` из `BAN_DURATIONS`), `userIdSchema`, `setUserRoleSchema` (`role` из `GLOBAL_ROLES`), `deleteUserSchema` (`userId`, `confirmEmail`).
  - Тесты: `admin-user.test.ts`, `admin-user-query.test.ts`, `user.schema.test.ts` — самодействие, бан администратора, удаление единственного владельца, истёкший бан, разбор некорректных параметров.
  - Логи: модели не логируют (чистый TS).

- [x] Task 3: Функции модуля `workspaces` для админки
  - `src/modules/workspaces/slices/member/member.repository.ts`: `countByUsers(userIds)` (`groupBy` по `userId`), `listSoleOwnedWorkspaces(userId)` (пространства, где пользователь `owner`, а `count(owner) = 1`).
  - `member.service.ts`: `countWorkspacesByUsers`, `listSoleOwnedWorkspaces` — без проверки сессии, JSDoc с пометкой «только для серверных модулей, уже проверивших права» (как `isWorkspaceMember`). Экспорт из `src/modules/workspaces/index.ts`.
  - Тесты: `member.service.test.ts` — пустой список id без запроса, единоличное владение vs совместное.
  - Логи: `debug` `[member.countWorkspacesByUsers]` (`usersCount`), `[member.listSoleOwnedWorkspaces]` (`userId`, `count`).

- [x] Task 4: Сервис, репозиторий и actions пользователей админки
  - `src/modules/admin/admin-api.ts` + `admin.errors.ts`: `callAdminApi(call)` — заголовки запроса, маппинг ошибок плагина (см. «Ключевые решения»).
  - `slices/user/user.repository.ts`: `list(query, now)` — `where` по `q` (`name`/`email` `contains`, `insensitive`), роли, статусу бана со сроком; `orderBy` с `id` как tie-breaker; `count` + `findMany` в одной `prisma.$transaction([...])`; `findById(id)` — `id, email, role, banned, banExpires`. Только нужные поля в `select`.
  - `slices/user/user.service.ts`: `listAdminUsers(query)`, `banUser`, `unbanUser`, `setUserRole`, `revokeUserSessions`, `deleteUser`. Порядок: `requireAdmin()` → `findById` (иначе `NotFoundError('Пользователь не найден')`) → правила модели → `callAdminApi`. `deleteUser`: сверка `confirmEmail` (без учёта регистра) → `listSoleOwnedWorkspaces` → `assertCanDelete` → `removeUser`. Проверка единоличного владения и удаление не атомарны — допустимо, отметить в комментарии.
  - `slices/user/user.dto.ts`, `slices/user/user.actions.ts` (`'use server'`, `FormState`, `toActionError`, ревалидация `/admin`).
  - `src/modules/admin/index.ts`, `src/modules/admin/client.ts`; правило границ в `eslint.config.mjs` при необходимости.
  - Тесты: `user.service.test.ts` (моки `requireAdmin`, репозитория, `callAdminApi`, `workspaces`): не-админ → `ForbiddenError`; самодействие; бан администратора; удаление с единоличным владением → `ConflictError` с названиями; неверный email подтверждения; срок бана передаётся в секундах; `admin.errors.test.ts`.
  - Логи: `info` `[admin.user.ban]` (`actorId`, `userId`, `duration`; причину не логировать), `[admin.user.unban]`, `[admin.user.setRole]` (`role`), `[admin.user.revokeSessions]`, `[admin.user.delete]`; `warn` на отказах правил и «не найдено»; `debug` на `listAdminUsers` (`page`, фильтры, `total`). Email — только `maskEmail()`.

### Phase 2: Интерфейс

- [x] Task 5: Перенос `ConfirmActionDialog` и каркас раздела
  - Перенести `src/components/workspaces/confirm-action-dialog.tsx` → `src/components/forms/confirm-action-dialog.tsx`, обновить импорты (`members-table`, `comment-item`, `task-placements`, страница задачи и др. — найти через grep).
  - `src/app/(app)/admin/layout.tsx`: заголовок «Администрирование», навигация (пока одна вкладка «Пользователи»; место под «Пространства»).
  - `src/app/(app)/admin/page.tsx`: `redirect('/admin/users')` после `requireAdminOrNotFound()` (внутри `<Suspense>`/динамической части — не раскрывать раздел не-администратору).
  - Логи: нет (тонкий слой; доступ логирует `shared/access`).

- [x] Task 6: Страница списка пользователей
  - `src/app/(app)/admin/users/page.tsx`: `requireAdminOrNotFound()` → `parseAdminUserListParams(searchParams)` → `listAdminUsers` → таблица; без `metadata.title`.
  - `src/components/admin/users/`: `admin-users-toolbar.tsx` (поиск с debounce, фильтры роли и статуса — URL), `admin-users-table.tsx` (колонки из «Рамок», бейджи роли и статуса с причиной в tooltip, пометка «Вы» для себя), `admin-users-pagination.tsx`, `admin-users-href.ts` (сборка URL, по образцу `task-list-href.ts`), пустое состояние «Пользователи не найдены».
  - Логи: нет (клиентские компоненты; `console.*` запрещён).

- [x] Task 7: Действия над пользователем в UI
  - `src/components/admin/users/user-actions-menu.tsx` (`DropdownMenu`): пункты по состоянию строки — для себя меню недоступно; для администратора скрыты «Заблокировать» и «Удалить» с подсказкой «Сначала снимите роль администратора».
  - `ban-user-dialog.tsx` (причина `Textarea`, срок `Select`), `delete-user-dialog.tsx` (ввод email, кнопка активна только при совпадении; ошибка единоличного владения показывается в диалоге), подтверждения для роли/разблокировки/сессий — через `ConfirmActionDialog`.
  - Добавить недостающие shadcn-компоненты CLI (`pnpm dlx shadcn@latest add …`), вручную `components/ui` не править.
  - Логи: нет.

### Phase 3: Документация и дорожная карта

- [x] Task 8: Документация и `ROADMAP.md`
  - `docs/architecture.md`: раздел «Администрирование»: модуль `admin`, чтение через репозиторий / изменения через плагин, свежая сессия в `requireAdmin` и окно до 5 минут вне админки, правила (самодействие, администратора — сначала снять роль, единоличный владелец); убрать фразу «это этап „Администрирование ресурса“» из раздела про доступ к пространствам (доступ к чужим пространствам — в следующем плане).
  - `AGENTS.md`: модуль `admin`, `src/components/admin/`, маршрут `/admin/users`, перенос `ConfirmActionDialog` в `components/forms`.
  - `.ai-factory/ROADMAP.md`: подпункты этапа «Администрирование ресурса»: `[x] Пользователи — список, блокировка, роли, удаление (план admin-users)`, `[ ] Пространства`.
  - Логи: не применимо.
