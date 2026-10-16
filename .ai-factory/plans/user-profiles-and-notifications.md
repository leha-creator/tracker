# План реализации: профили пользователей, уведомления и @упоминания

Branch: none (git.create_branches = false — работа в текущей ветке)
Created: 2026-10-16

## Settings

- Testing: yes — юнит-тесты Vitest для моделей и сервисов (по образцу существующих `*.test.ts`)
- Logging: verbose — DEBUG на чтениях и ветвлениях, INFO на изменениях, WARN на отказах доступа и валидации, ERROR на сбоях почты и хранилища; через `createLogger(scope)`, без email, текстов комментариев и ключей хранилища в логах (email — только через `maskEmail()`)
- Docs: yes — обязательный docs-checkpoint в конце (`docs/architecture.md`, `docs/configuration.md`, `AGENTS.md`)

## Roadmap Linkage

Milestone: "none"
Rationale: В `ROADMAP.md` нет этапа про профили и уведомления. После реализации стоит добавить его через `/aif-roadmap`.

## Требования (из запроса)

1. **Свой профиль** `/profile`: фото, имя, должность, описание, настройки уведомлений и прочие полезные данные (email, дата регистрации, глобальная роль, пространства и роль в каждом).
2. **Публичный профиль** участника внутри пространства `/w/[workspaceSlug]/members/[userId]`. Открывается из вкладки «Участники».
3. **Предпросмотр при наведении** (hover card) с базовой информацией: аватар, имя, должность, роль в пространстве, email, ссылка на профиль. Где показывается: ответственный на карточке доски, в строке списка, в свойствах задачи; автор комментария и @упоминания в тексте комментария.
4. **@упоминания** в комментариях. После `@` появляется подсказка с участниками пространства, ввод букв её фильтрует. Уведомление уходит и тем, кого выбрали из подсказки, и тем, чьё имя просто совпало с набранным текстом после `@`.
5. **Система уведомлений**: в приложении (колокольчик в шапке, страница `/notifications`) и по email (SMTP). Пользователь в профиле включает каждый канал отдельно для каждого типа события.
   События первой версии:
   - `mention` — вас упомянули в комментарии;
   - `task_assigned` — вас назначили ответственным;
   - `task_comment` — новый комментарий к задаче, где вы ответственный или автор;
   - `workspace_invitation` — приглашение в пространство. Только в приложении: письмо уже отправляет `invitation.mail.ts`.

## Ключевые решения

- **Новые модули** (в `src/modules/`, слои те же, что у остальных: `models/`, `slices/`, `index.ts`, `client.ts`):
  - `notifications`. Ни от кого не зависит. Его вызывают `tasks` и `workspaces`. Пользователя по email (для приглашения) он ищет в таблице `User` своим репозиторием, так же как это делает `admin`.
  - `profiles`. Зависит от `workspaces` (проверка, что у пользователей есть общее пространство). Его вызывает `admin` (удаление аватара вместе с пользователем).
  - Циклов нет: `tasks → notifications`, `workspaces → notifications`, `profiles → workspaces`, `admin → profiles`.
- **Профиль** — отдельная таблица `UserProfile` (1:1 с `User`): `position`, `bio`, `avatarKey`. Схему Better Auth (`User`) не расширяем. Имя и `User.image` меняем через `auth.api.updateUser`, чтобы обновился cookie-кеш сессии. В `User.image` пишем адрес вида `/api/users/<id>/avatar?v=<timestamp>`. Тогда `TaskUserDto.image`, который уже есть, сразу работает везде.
- **Аватар** загружается тем же путём, что вложения. Сервер выдаёт presigned POST на ключ `users/<userId>/avatar/<uuid>`. Подтверждение: `headObject` и проверка сигнатуры через `readObjectPrefix`. Разрешены PNG, JPEG и WebP до 2 МБ. Старый объект удаляется после замены. Отдаёт аватар `GET /api/users/[userId]/avatar`: сессия плюс проверка (это сам пользователь, или есть общее пространство, или это admin), затем 302 на presigned GET. Сервер изображения не обрезает и не сжимает, обрезка — `object-cover` в CSS.
- **Публичный профиль доступен в рамках пространства**. Смотрящий и цель должны быть участниками пространства из URL, иначе `notFound()` (защита от IDOR). Кто чужой участник, не раскрываем.
- **Hover card** грузит данные лениво при открытии: `GET /api/workspaces/[workspaceId]/members/[userId]/card`. Ответ кешируется на клиенте в `Map` на время жизни страницы. Имя и аватар видны сразу из `TaskUserDto`, поэтому DTO доски и списка не раздуваются.
- **Упоминания хранятся простым текстом** `@Имя Фамилия`, без скрытой разметки. Одна чистая функция `extractMentions(body, members)` ищет после каждого `@` на границе слова самое длинное совпадение с именем участника (без учёта регистра) или с локальной частью email. За символом после совпадения не должна идти буква или цифра. Так выбор из подсказки и ручной ввод обрабатываются одинаково. Подсветку в ленте строим той же функцией: в `TaskCommentDto` добавляется поле `mentions: { start, end, userId }[]`.
- **Кандидаты для подсказки — участники пространства.** У проектов нет своего состава, а задачи видны всему пространству. Себя в подсказке показываем, но себе уведомление не отправляем.
- **Получатели комментария.** Упомянутые получают `mention`. Ответственный и автор задачи получают `task_comment`, если они ещё не среди упомянутых. Автор комментария исключается. При правке комментария уведомляются только новые упоминания (сравниваются старый и новый набор).
- **Доставка.** Строки `Notification` создаются после коммита основной операции. Сбой уведомлений не откатывает комментарий или задачу: он пишется в лог как ERROR. Письма отправляются через `after()` из `next/server` (см. `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`) с учётом настроек получателя.
- **Данные уведомления — снимок** на момент события, в `payload Json`: `workspaceSlug`, `workspaceName`, `taskNumber`, `taskTitle`, `commentExcerpt` (≤ 140 символов), `actorName`. Поэтому `notifications` не читает таблицы задач. При удалении участника триггер БД удаляет его уведомления этого пространства, кроме `workspace_invitation` (так же, как триггер снятия ответственного в `add_tasks`).
- **Обновление счётчика** без realtime: колокольчик рендерится на сервере в шапке. Клиент перезапрашивает число непрочитанных каждые 60 с, пока вкладка видима, и при возврате на вкладку (`visibilitychange`).

## Tasks

### Фаза 1. Данные

- [x] **Task 1: Схема Prisma и миграция для профилей и уведомлений**
  - Файлы: `prisma/schema.prisma`, `prisma/migrations/<ts>_add_profiles_and_notifications/migration.sql`.
  - Модели:
    - `UserProfile`: `userId` — PK и FK на `User`, `onDelete: Cascade`; `position String?`; `bio String?`; `avatarKey String? @unique`; `updatedAt`.
    - `enum NotificationType { mention task_assigned task_comment workspace_invitation }`. Новые значения добавлять только в конец.
    - `Notification`: `id uuid(7)`; `userId` — получатель, Cascade; `workspaceId` — Cascade через `Workspace`; `type`; `actorId String?` — SetNull; `taskId String? @db.Uuid`; `commentId String? @db.Uuid`; `invitationId String?`; `payload Json`; `readAt DateTime?`; `createdAt`. Индексы `@@index([userId, createdAt])`, `@@index([userId, readAt])`, `@@index([workspaceId])`. Задача и комментарий — без FK, это ссылки из снимка. При удалении задачи уведомление остаётся, ссылка приведёт на 404 задачи.
    - `NotificationPreference`: `userId`, `type`, `inApp Boolean`, `email Boolean`, `@@id([userId, type])`, Cascade. Если строки нет, действуют значения по умолчанию из модели.
  - Связи в `User`: `profile UserProfile?`, `notifications`, `actedNotifications`, `notificationPreferences`.
  - В SQL миграции вручную добавить триггер `AFTER DELETE ON "WorkspaceMember"`: удаляет `Notification` с `userId = OLD."userId" AND "workspaceId" = OLD."workspaceId" AND type <> 'workspace_invitation'`. Рядом комментарий о причине: участника удаляет плагин Better Auth, а `workspaces` не знает об уведомлениях.
  - Комментарии к моделям — в стиле существующих разделов схемы.
  - Логирование: не требуется (схема). Проверка: `pnpm db:migrate` на чистой базе, `pnpm typecheck`.

### Фаза 2. Модуль уведомлений

- [x] **Task 2: Модели модуля `notifications`** (зависит от Task 1)
  - Файлы: `src/modules/notifications/models/{notification-type.ts,notification-preferences.ts,notification-payload.ts,notification-recipients.ts,index.ts}` и тесты `*.test.ts` рядом.
  - `NOTIFICATION_TYPES` — каталог. Для каждого типа: подпись, описание для настроек, поддерживаемые каналы (`workspace_invitation` — только `inApp`), значения по умолчанию (`inApp: true`; `email: true` для `mention` и `task_assigned`, `false` для `task_comment`).
  - `resolveChannels(type, preference | null)` даёт `{ inApp, email }` с учётом каналов, которые тип поддерживает.
  - Zod-схема `notificationPayloadSchema`, discriminated union по `type`. `buildNotificationHref(notification)` строит `/w/<slug>/tasks/<n>` (для комментария — с якорем `#comment-<id>`) и `/invite/<invitationId>`. `formatNotificationText(notification)` даёт текст по-русски («Анна упомянула вас в #42 Название»).
  - `dedupeRecipients(events, actorId)`: на одного получателя — одно уведомление на событие, приоритет `mention` > `task_comment`. Автор действия исключается.
  - Тесты покрывают: значения по умолчанию и каналы, исключение автора, приоритет `mention`, ссылки, отказ схемы на неполный payload.
  - Логирование: модели чистые, не логируют.

- [x] **Task 3: Сервисы, actions и почта модуля `notifications`** (зависит от Task 2)
  - Файлы: `src/modules/notifications/slices/notification/{notification.repository.ts,notification.service.ts,notification.actions.ts,notification.dto.ts,notification.schema.ts,notification.mail.ts}`, `slices/preference/{preference.repository.ts,preference.service.ts,preference.actions.ts,preference.schema.ts,preference.dto.ts}`, `index.ts`, `client.ts`. Тесты сервисов и почты.
  - API для других модулей (без сессии; вызывающий уже проверил доступ): `notify(events: NotificationEvent[])`. Внутри: `dedupeRecipients`, загрузка настроек получателей одним запросом, `createMany` для тех, у кого включён `inApp`, затем через `after()` письма тем, у кого включён `email` (`sendMail`, HTML через `escapeHtml`, абсолютная ссылка — от базового URL, как в `invitation.mail.ts`). Ещё одна функция — `notifyByEmail(email, event)` для приглашений: если пользователя нет, ничего не делает. Ошибки ловятся внутри и пишутся как ERROR, наружу не пробрасываются.
  - Для текущего пользователя: `listMyNotifications(session, { cursor, unreadOnly, limit })` (курсор по `createdAt, id`), `countMyUnread(session)`, `markNotificationRead` / `markAllNotificationsRead`. Фильтр всегда по `userId = session.user.id`, чужой id даёт `NotFoundError`.
  - `getMyNotificationPreferences(session)` возвращает матрицу «тип × канал» со значениями по умолчанию. `updateNotificationPreferenceAction` — upsert одной ячейки. Неподдерживаемый канал — `ValidationError`.
  - Actions возвращают `FormState` / `ActionResult` и вызывают `revalidatePath('/', 'layout')` (счётчик в шапке).
  - Логирование: `createLogger('notifications')`. DEBUG — список и счётчик (`userId`, `count`); INFO `[notification] created` (`type`, `recipients`, `workspaceId`, `taskId`), `[notification] read`, `[preference] updated`; WARN — чужой id; ERROR `[notification.mail] send failed` (`notificationId`, `type`, без email).

- [x] **Task 4: Колокольчик в шапке и страница `/notifications`** (зависит от Task 3)
  - Route Handlers: `src/app/api/notifications/route.ts` (GET — последние 10 для выпадающего списка и `unreadCount`) и `src/app/api/notifications/unread-count/route.ts`. Ошибки — через `toErrorResponse`, заголовок `Cache-Control: no-store`.
  - Компоненты в `src/components/notifications/`:
    - `notification-bell.tsx` — серверный, читает `countMyUnread`, рендерится в `<Suspense>` в `src/app/(app)/layout.tsx` рядом с `UserMenu`;
    - `notification-bell-menu.tsx` — клиентский: Popover со списком, данные загружаются при открытии, «Прочитать все», ссылка «Все уведомления», опрос счётчика раз в 60 с при `document.visibilityState === 'visible'`, бейдж с `aria-label="Непрочитанных: N"`;
    - `notification-item.tsx` — текст, относительное время, отметка непрочитанного; по клику помечает прочитанным и переходит по ссылке.
  - Страница `src/app/(app)/notifications/page.tsx`: фильтр «Все / Непрочитанные» (состояние в URL), пагинация «Показать ещё» по курсору, пустое состояние.
  - Через shadcn CLI добавить `popover` (если его нет). `components/ui` вручную не править.
  - Логирование: в Route Handlers DEBUG `[api.notifications] list` (`userId`, `count`), WARN при отказе доступа. Клиентские компоненты не логируют.

### Фаза 3. Профиль

- [x] **Task 5: Модуль `profiles` — профиль и аватар** (зависит от Task 1)
  - Файлы: `src/modules/profiles/models/{profile.ts,avatar.ts,index.ts}` с тестами, `slices/profile/{profile.repository.ts,profile.service.ts,profile.actions.ts,profile.schema.ts,profile.dto.ts}` с тестами, `slices/avatar/{avatar.service.ts,avatar.actions.ts,avatar.schema.ts}` с тестами, `index.ts`, `client.ts`.
  - Модели:
    - лимиты (`PROFILE_NAME_MAX_LENGTH = 80`, `PROFILE_POSITION_MAX_LENGTH = 80`, `PROFILE_BIO_MAX_LENGTH = 1000`);
    - `AVATAR_MAX_SIZE = 2 MB`, `AVATAR_CONTENT_TYPES`;
    - `detectImageType(bytes)` по сигнатурам PNG, JPEG и WebP;
    - `avatarStorageKey(userId, id)`, `avatarUrl(userId, version)`.
  - Сервисы:
    - `getMyProfile(session)` — имя, email, аватар, должность, описание, `createdAt`, глобальная роль;
    - `updateProfile(session, { name, position, bio })` — имя через `auth.api.updateUser`, остальное через upsert `UserProfile`;
    - `requestAvatarUpload` / `completeAvatarUpload` — по образцу `attachment.service.ts` (`requestUpload` / `completeUpload`). После подтверждения пишем `avatarKey`, вызываем `updateUser({ image: avatarUrl })` и удаляем старый объект;
    - `removeAvatar(session)`;
    - `getAvatarDownload(session, userId)` — доступ, если это сам пользователь, есть общее пространство (`workspaces.sharesWorkspace`) или это admin; иначе `NotFoundError`;
    - без сессии, для других модулей: `getProfileCards(userIds)` (должность и аватар) и `deleteUserAvatar(userId)`.
  - В `workspaces` добавить и экспортировать из `index.ts`: `sharesWorkspace(userA, userB)` и `getMember(session, workspaceId, userId)` — роль, дата вступления, право на проекты; не участник — `NotFoundError`. Тесты в `member.service.test.ts`.
  - В `admin`: `deleteUser` вызывает `deleteUserAvatar` до удаления пользователя. Сбой хранилища не блокирует удаление, пишется ERROR.
  - Логирование: `createLogger('profiles')`. DEBUG — чтения; INFO `[profile] updated` (`userId`, какие поля менялись, без значений), `[avatar] uploaded` / `removed`; WARN — неверная сигнатура или размер, отказ в доступе к аватару; ERROR — сбой удаления старого объекта.

- [x] **Task 6: Отдача аватара и компонент `UserAvatar`** (зависит от Task 5)
  - Route Handler `src/app/api/users/[userId]/avatar/route.ts`: `getAvatarDownload`, затем 302 на presigned GET с `Cache-Control: private, max-age=300`. Ошибки — через `toErrorResponse`.
  - Компонент `src/components/users/user-avatar.tsx`: shadcn `avatar`, добавить через CLI. Показывает изображение, при ошибке загрузки — инициалы (`initials()`). Размеры `xs | sm | md | lg`.
  - Заменить `AssigneeAvatar` (`task-card.tsx`, `task-list-table.tsx`, `comment-item.tsx`) и инициалы в `user-menu-dropdown.tsx` на `UserAvatar`. В `UserMenu` передавать `image`. `assignee-avatar.tsx` удалить или превратить в тонкую обёртку, если `aria-label` «Ответственный» нужен на карточке.
  - Логирование: DEBUG `[api.avatar] redirect` (`userId`, `viewerId`), WARN — отказ.

- [x] **Task 7: Страница своего профиля `/profile`** (зависит от Task 3, Task 6)
  - Страница: `src/app/(app)/profile/page.tsx`. Разделы — вкладки-ссылки через `TabLink` (`?tab=` или вложенные маршруты `profile/notifications`, в зависимости от того, что проще с Cache Components):
    - **Профиль** — `profile-avatar-form.tsx`: выбор файла, превью, загрузка по presigned POST, «Удалить фото». `profile-form.tsx`: имя, должность, описание со счётчиком символов (`useActionState`, `FormField`, Zod-схема из `profiles/client`);
    - **Уведомления** — `notification-settings.tsx`: таблица «событие × В приложении / Email» на `Switch`. Неподдерживаемый канал выключен и недоступен, с подсказкой. Каждое переключение сохраняется сразу, с оптимистичным состоянием и toast при ошибке;
    - **Аккаунт** — email, дата регистрации, глобальная роль, список пространств с ролью (`listMyWorkspaces`) со ссылками на мой публичный профиль в каждом.
  - Компоненты — в `src/components/profile/`.
  - В `user-menu-dropdown.tsx` добавить пункты «Профиль» и «Уведомления».
  - Логирование: страницы и компоненты не логируют, это делают сервисы. Ошибки action показывать через `FormError` / toast.

- [x] **Task 8: Сводка задач участника в `tasks`** (зависит от Task 1)
  - Файлы: `src/modules/tasks/slices/views/member-summary.queries.ts` (или `views.queries.ts`), `views.repository.ts`, DTO в `views.dto.ts`, тесты.
  - `getMemberTaskSummary(session, workspaceId, userId)`: `requireWorkspaceAccess`; цель должна быть участником (`isWorkspaceMember`), иначе `NotFoundError`. Возвращает:
    - число открытых задач, где он ответственный: хотя бы одно размещение не в категории `done` или размещений нет. Правило «открыта» — функция в `tasks/models`, с тестом;
    - сколько из них просрочено;
    - сколько выполнено за 30 дней (по `updatedAt`);
    - сколько задач он создал, сколько комментариев оставил;
    - дату последней активности (максимум из последних комментария и созданной задачи);
    - до 10 ближайших открытых задач по сроку.
  - Экспорт через `tasks/index.ts`.
  - Логирование: DEBUG `[views.memberSummary]` (`workspaceId`, `userId`, `viewerId`, счётчики), WARN — цель не участник.

- [x] **Task 9: Публичный профиль `/w/[workspaceSlug]/members/[userId]` и карточка участника** (зависит от Task 5, Task 6, Task 8)
  - Страница `src/app/(app)/w/[workspaceSlug]/members/[userId]/page.tsx`: `requireWorkspaceAccessBySlug`, затем `getMember` (`NotFoundError` → `notFound()`), `getProfileCards`, `getMemberTaskSummary`. Показывает: большой аватар, имя, должность, описание, email, роль в пространстве, дату вступления, право «Управление проектами», дату последней активности, карточки-счётчики задач, список открытых задач со ссылками в панель задачи. Для своего профиля — кнопка «Редактировать профиль» (`/profile`).
  - Route Handler `src/app/api/workspaces/[workspaceId]/members/[userId]/card/route.ts` отдаёт JSON для hover card: имя, аватар, должность, email, роль, число открытых задач, ссылку на профиль. Доступ проверяется так же, как на странице.
  - `members-table.tsx`: аватар и имя участника становятся ссылкой на профиль.
  - `nav-items.ts`: вкладка «Участники» активна и на `/w/<slug>/members/*`. Обновить `nav-items.test.ts`.
  - Логирование: в Route Handler DEBUG `[api.memberCard]` (`workspaceId`, `userId`, `viewerId`), WARN — отказ.

- [x] **Task 10: Hover card `UserHoverCard` и подключение по местам** (зависит от Task 9)
  - Добавить через CLI shadcn `hover-card`. Компонент `src/components/users/user-hover-card.tsx`:
    - принимает `workspaceId`, `workspaceSlug`, `user: TaskUserDto` и `children` (триггер);
    - при открытии загружает карточку (`fetch` + модульный `Map`-кеш, отмена через `AbortController`), пока идёт загрузка — скелетон;
    - содержимое: аватар, имя, должность, роль, email, «Открытых задач: N», ссылка «Открыть профиль»;
    - задержки `openDelay 400`, `closeDelay 100`; открывается и по фокусу клавиатуры.
  - Где подключить:
    - ответственный на карточке доски (`task-card.tsx`). Карточка — перетаскиваемая ссылка: триггер — не фокусируемый `span`, `pointerdown` не всплывает, чтобы не мешать dnd-kit, клик по аватару не открывает задачу. Проверить, что перетаскивание не ломается;
    - строка списка (`task-list-table.tsx`);
    - свойство «Ответственный» в `task-details-form.tsx` / `task-fields.tsx` — аватар рядом с select;
    - автор комментария (`comment-item.tsx`).
  - Логирование: клиентский компонент не логирует. Неудачный запрос — текст «Не удалось загрузить» в карточке.

### Фаза 4. Упоминания и отправка уведомлений

- [x] **Task 11: Модель упоминаний в `tasks`** (зависит от Task 1)
  - Файлы: `src/modules/tasks/models/comment-mentions.ts` и тест, экспорт чистых функций через `tasks/client.ts`.
  - `findMentionQuery(text, caret)` возвращает `{ start, query } | null`: `@` в начале строки или после пробела или знака препинания, запрос — до 40 символов, допускается один пробел (имя и фамилия), перевод строки обрывает запрос.
  - `filterMentionCandidates(members, query, limit = 8)`: сначала совпадение префикса имени, затем префикса любого слова имени, затем вхождение в email; без учёта регистра и `ё/е`.
  - `extractMentions(body, members)` возвращает `{ start, end, userId }[]`: самое длинное совпадение, граница слова после совпадения, без дублей `userId` в списке получателей. `mentionedUserIds(...)` — уникальные id.
  - Тесты: кириллица и латиница, имена с пробелами, `email@домен` не считается упоминанием, совпадение двух участников с общим префиксом (выбирается длинное), упоминание в конце строки и перед знаком препинания.
  - Логирование: модель чистая, не логирует.

- [x] **Task 12: Подсказка участников при вводе `@` и подсветка упоминаний** (зависит от Task 10, Task 11)
  - `src/components/tasks/comments/mention-textarea.tsx` — клиентский combobox поверх `Textarea`:
    - список открывается при `findMentionQuery`. Он позиционируется под полем, а у закреплённой формы панели — над полем;
    - `role="combobox"`, `aria-expanded`, `aria-activedescendant`, `role="listbox"`;
    - стрелки — навигация, Enter или Tab — выбор, Esc закрывает только список, не форму;
    - при выборе `@query` заменяется на `@Имя Фамилия ` и курсор ставится после.
  - Ctrl+Enter и Esc из `CommentBodyField` сохраняются.
  - `CommentBodyField`, `CommentForm`, `CommentEditForm` получают `members: MentionCandidate[]` (`userId`, `name`, `email`, `image`). В `task-details-view.tsx` передать участников (`listMembers` там уже вызывается) через `CommentForm` и `TaskComments` → `CommentList` → `CommentItem`.
  - `comment.service.ts`: в `toCommentDto` добавить `mentions` (`extractMentions` по текущим участникам, `listMemberIdentities(workspaceId)` из `workspaces` — новая функция без сессии с тестом). `TaskCommentDto.mentions` — в `comment.dto.ts`.
  - `CommentItem` рендерит текст по сегментам. Упоминание — выделенный `@Имя` внутри `UserHoverCard`. Остальное остаётся простым текстом, `pre-wrap` сохраняется.
  - У `li` комментария — `id="comment-<id>"`, чтобы работал якорь из уведомления.
  - Логирование: DEBUG `[comment.list]` дополнить числом упоминаний. Клиентские компоненты не логируют.

- [x] **Task 13: Отправка уведомлений из `tasks` и `workspaces`** (зависит от Task 3, Task 11)
  - `comment.service.ts`:
    - `createComment` — после транзакции собрать события: `mention` для `mentionedUserIds(body, members)`, `task_comment` для ответственного и автора задачи. Нужна выборка задачи (номер, название, `assigneeId`, `createdById`, slug и имя пространства) — расширить `commentRepository.taskExists` до `findTaskForNotification`. Затем вызвать `notify(...)`;
    - `updateComment` — только `mention` для тех, кто появился в новом тексте и не упоминался в старом.
  - `task.service.ts`: в `createTask` и `updateTask` при новом `assigneeId`, если он не совпадает с автором действия, отправить `task_assigned`.
  - `invitation.service.ts`: в `inviteMember` после успешного `createInvitation` вызвать `notifyByEmail(email, { type: 'workspace_invitation', invitationId, workspaceId, ... })`.
  - Правило получателей комментария вынести в чистую функцию `tasks/models/comment-notifications.ts` (`buildCommentEvents`) и покрыть тестом: исключение автора, без дублей, приоритет упоминания, правка без новых упоминаний не даёт событий.
  - Обновить тесты сервисов (`comment.service.test.ts`, `task.service.test.ts`, `invitation.service.test.ts`): мок `@/modules/notifications`, проверка аргументов `notify`. Сбой `notify` не ломает основную операцию.
  - Обновить заголовочные комментарии зависимостей в `tasks/index.ts` и `workspaces/index.ts`.
  - Логирование: DEBUG `[comment.create] notifications` (`mentions`, `watchers`), DEBUG `[task.update] assignee notification`. Ошибки логирует сам `notify`.

## Commit Plan

- **Commit 1** (после задач 1–3): `feat(notifications): add notification storage, preferences and delivery`
- **Commit 2** (после задачи 4): `feat(notifications): notification bell and notifications page`
- **Commit 3** (после задач 5–7): `feat(profiles): user profile with avatar, position, bio and notification settings`
- **Commit 4** (после задач 8–10): `feat(profiles): public member profile and hover cards`
- **Commit 5** (после задач 11–13): `feat(tasks): @mentions in comments with notifications`

## Риски и проверки

- dnd-kit и hover card на карточке доски: проверить перетаскивание указателем, касанием и с клавиатуры.
- Cache Components: шапка с колокольчиком и страницы профиля динамические — сессия читается внутри `<Suspense>`, как в `UserMenu`.
- `after()` в standalone-сборке: проверить, что письма уходят в Docker-образе (`pnpm app:up`, Mailpit).
- Ручная проверка в браузере после реализации: упоминание через подсказку и ручной ввод, письмо в Mailpit, счётчик в шапке, отключение email в настройках, профиль другого пространства недоступен (404).
