# План реализации: интеграция с GitHub

Branch: none (git.create_branches = false — работа в текущей ветке)
Created: 2026-10-16

## Settings

- Testing: yes — Vitest (`environment: node`) для моделей, сервисов (с моками репозиториев и Octokit), проверки подписи и разбора вебхуков, Route Handlers. Образец — существующие `*.test.ts` рядом с кодом.
- Logging: verbose — через `createLogger(scope)`. DEBUG на чтениях, разборе событий и ветвлениях. INFO на изменениях: подключение, привязка, смена статуса, уведомления. WARN на отказах доступа, неверной подписи, неизвестных событиях и повторных доставках. ERROR на сбоях GitHub API. **Никогда не логировать** токены, приватный ключ, секрет вебхука, `state`, тела вебхуков, названия PR и тексты коммитов (приватные репозитории). Логировать только id, номера, `deliveryId`, `event`, `action`, `repositoryId`.
- Docs: yes — обязательный docs-checkpoint в конце (Task 16).

## Roadmap Linkage

Milestone: "Интеграция с GitHub"
Rationale: План реализует этап целиком: GitHub App, вебхуки, автоматическую привязку задач к PR и статус PR в задаче. Сверх этапа: коммиты и ветки, автосмена статуса, уведомления и вход через GitHub.

## Предусловия

- Сначала завершить план `user-profiles-and-notifications`. Сейчас открыты Task 5–13. План GitHub опирается на страницу `/profile` (Task 7: привязка GitHub-аккаунта) и на рабочий модуль `notifications` (`notify`, каталог типов).
- Перед кодом прочитать документацию из `node_modules`:
  - Next.js 16: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (Route Handlers, `RouteContext`, сырое тело запроса), `.../04-functions/after.md`, `revalidatePath`.
  - Better Auth 1.7: `socialProviders.github`, `account.accountLinking` (опции неявной привязки), `linkSocial` / `unlinkAccount` / `listAccounts`, `getAccessToken` (обновление токена GitHub App), `additionalFields` у `organization`.
  - Octokit: `@octokit/app` (или `octokit`) — `App`, `getInstallationOctokit`, кеш токенов установки. Зафиксировать точную версию.

## Требования

1. **GitHub App.** Владелец пространства подключает установку GitHub App (на личный аккаунт или организацию) и выбирает репозитории пространства.
2. **Вебхуки** `POST /api/webhooks/github`: проверка `X-Hub-Signature-256`, идемпотентность по `X-GitHub-Delivery`.
3. **Автопривязка.** Ключ задачи `TSK-42` в названии ветки, заголовке или описании PR и в тексте коммита привязывает к задаче PR, ветку или коммит.
4. **Статус PR в задаче:** open / draft / merged / closed, ревью (approved / changes requested), CI (check suites). Индикатор PR на карточке доски и в строке списка.
5. **Ветки и коммиты** задачи (события `push`, `create`, `delete`).
6. **Автосмена статуса.** Настройка проекта: «PR открыт → статус X», «PR слит → статус Y».
7. **Уведомления** (модуль `notifications`): к задаче привязан PR, PR слит, ревью PR.
8. **Вход через GitHub** (Better Auth OAuth) и привязка GitHub-аккаунта в профиле.

## Ключевые решения

- **Ключ пространства.** Поле `Workspace.taskKey`: 2–10 символов `^[A-Z][A-Z0-9]{1,9}$`, уникально глобально, хранится в верхнем регистре. Ключ показывается везде вместо `#42` (`TSK-42`), адреса `/tasks/42` не меняются. Колонка в БД nullable: пространство создаёт плагин Better Auth, и ключ проставляется сразу после создания (тот же приём, что у `canManageProjects`). Существующим пространствам ключ проставляет миграция. Если ключа нет, отображается `#42`, а GitHub-привязка для пространства не работает. После смены ключа в настройках старые ссылки в ветках перестают распознаваться, уже созданные связи остаются. Об этом предупреждает форма.
- **Модуль** `src/modules/integrations/github` (`models/`, `slices/`, `index.ts`, `client.ts`). Зависит от `tasks`, `projects`, `workspaces`, `notifications` через их `index.ts`. Ядро от GitHub не зависит. Доска, список и страница задачи собирают данные GitHub на уровне страницы и компонентов, как доска собирает колонки и карточки.
- **Модель данных.** Установка `GithubInstallation` подключается к пространствам через M:N `WorkspaceGithubInstallation`. Репозитории `GithubRepository` выбираются для пространства через M:N `WorkspaceGithubRepository`. Один репозиторий может обслуживать несколько пространств, и ключ различает, к какому из них относится ссылка. Остальные таблицы: PR `GithubPullRequest`, ревью `GithubPullRequestReview`, CI `GithubCheckSuite`, связи `TaskPullRequest`, `TaskGithubBranch`, `TaskGithubCommit`, доставки `GithubWebhookDelivery`, автоматизация `GithubProjectAutomation`. Связи задачи ссылаются на неё составным ключом `(taskId, workspaceId)` с каскадом.
- **Подключение установки защищено от подмены `installation_id`.** Владелец сначала привязывает GitHub-аккаунт (вход через GitHub). Setup URL проверяет подписанный `state` (workspaceId, userId, срок 10 мин, HMAC). Затем по пользовательскому токену (`auth.api.getAccessToken`) вызывается `GET /user/installations`: установка должна быть доступна этому пользователю. Тот же список показывается в настройках, чтобы подключить уже установленное приложение без переустановки.
- **Распознавание ссылок:** чистая функция `findTaskReferences(text)` → `{ key, number }[]`. Без учёта регистра, на границах слова (`tsk-42-fix-login`, `TSK-42:`, `[TSK-42]`), с дедупликацией. Пространства находятся по ключам среди тех, к которым подключён репозиторий события.
- **Автосвязи и ручные связи.** У `TaskPullRequest` есть `source: auto | manual` и `dismissedAt`. При правке PR автосвязи пересчитываются, и исчезнувшие ссылки снимаются. Отвязанную вручную (`dismissedAt`) автоматика не восстанавливает. Ручную привязку по URL PR автоматика не трогает.
- **Порядок событий.** PR обновляется, только если `pull_request.updated_at` новее сохранённого `githubUpdatedAt`. Итог ревью: есть `changes_requested` → `changes_requested`, иначе есть `approved` → `approved`, иначе `none`. Учитывается последнее ревью каждого ревьюера, `dismissed` его снимает. Итог CI по check suites для `headSha`: `failure` > `pending` > `success`, иначе `none`.
- **Обработка вебхука синхронная.** Подпись → запись доставки (повтор → 200 без обработки) → обработчик в транзакции → 200. Ошибка → 500 (доставку можно повторить из GitHub), строка доставки удаляется. Уведомления и `revalidatePath` идут после коммита через `after()`. Лимит тела — 10 МБ (`413`). Доставки старше 7 дней удаляются по ходу работы.
- **Автосмена статуса.** Действие системы, не пользователя. `tasks` экспортирует `changePlacementStatusBySystem` без сессии, вызывающий отвечает за доверие (подпись вебхука проверена). Правило модели: двигаем только вперёд, ранг категории `todo < in_progress < done` должен расти. Слитый PR не откатывает «Готово», повторное открытие не возвращает задачу назад.
- **GitHub-пользователь → пользователь Tasker** через `Account` (`providerId = 'github'`, `accountId` = id пользователя GitHub). Нужно для автора действия в уведомлениях и для получателя ревью (автор PR).
- **Вход через GitHub.** Неявная привязка к существующему email отключена: email в Tasker не подтверждается, иначе возможен захват аккаунта. Привязка — только явно из `/profile`. Регистрация через GitHub разрешена, как регистрация по email.
- **Интеграция необязательна.** Переменные `GITHUB_*` либо все заданы, либо все пусты (`superRefine`). Без них кнопки GitHub скрыты, вебхук отвечает 404, сборка и CI не ломаются, `/api/health` от GitHub не зависит.
- **Права GitHub App:** Metadata read, Contents read, Pull requests read, Checks read, Account → Email addresses read. События: Pull request, Pull request review, Push, Create, Delete, Check suite (installation-события приходят всегда). Setup URL — `/api/integrations/github/setup` (с «Redirect on update»), callback — `/api/auth/callback/github`, webhook — `/api/webhooks/github`.

## Commit Plan

- **Commit 1** (после задач 1–2): `feat(workspaces): task key prefix and TSK-42 task keys`
- **Commit 2** (после задач 3–5): `feat(github): app client, schema and pure models`
- **Commit 3** (после задач 6–8): `feat(github): sign in with GitHub, installation connect flow and webhook endpoint`
- **Commit 4** (после задач 9–11): `feat(github): link pull requests, branches and commits to tasks`
- **Commit 5** (после задач 12–13): `feat(github): pull requests in task details, board and list`
- **Commit 6** (после задач 14–15): `feat(github): status automation and pull request notifications`
- **Commit 7** (после задачи 16): `docs: GitHub integration`

## Tasks

### Фаза 1. Ключ задачи

- [x] **Task 1: Ключ пространства `Workspace.taskKey`**
  - Файлы: `prisma/schema.prisma`, `prisma/migrations/<ts>_add_workspace_task_key/migration.sql`, `src/shared/auth/auth.ts` (`additionalFields` у `organization`: `taskKey`, `input: false`), `src/modules/workspaces/models/task-key.ts` (+ тест), `slices/workspace/{workspace.schema.ts,workspace.service.ts,workspace.repository.ts,workspace.actions.ts,workspace.dto.ts}`, `src/modules/workspaces/{index.ts,client.ts}`, `src/components/workspaces/{create-workspace-form.tsx,task-key-form.tsx}`, `src/app/(app)/w/[workspaceSlug]/settings/page.tsx`.
  - Схема: `taskKey String? @unique` с комментарием в стиле раздела.
  - Миграция: колонка, затем PL/pgSQL-бэкфилл существующих пространств. Ключ берётся из slug: буквы и цифры в верхнем регистре, первые 2–4 символа (если начинается не с буквы — префикс `W`), при конфликте добавляется цифра. В SQL нужен комментарий о причине.
  - Модель: `normalizeTaskKey`, `taskKeyProblem(value)` (текст ошибки по-русски), `suggestTaskKey(name)` (инициалы или первые буквы транслитерации, 2–4 символа).
  - Создание: необязательное поле «Ключ задач» с подсказкой из названия. Сервис после `createOrganization` проставляет ключ через репозиторий. При конфликте `isUniqueViolation` к ключу добавляется цифра, до 5 попыток. Если ключ задан вручную и занят, возвращается ошибка поля. Сбой после создания пространства пишется как ERROR, пространство остаётся без ключа.
  - Настройки (только owner): форма смены ключа с предупреждением про старые ветки. `updateTaskKeyAction` возвращает `FormState`, при занятом ключе — ошибку поля.
  - Для других модулей: `findWorkspacesByTaskKeys(keys)` → `{ id, slug, name, taskKey }[]` (системное чтение без сессии, для вебхуков) и `taskKey` в DTO пространства / `WorkspaceContext`, если он нужен страницам.
  - Логирование: `workspaces.workspace` — DEBUG `[workspace.taskKey] suggest/retry` (`workspaceId`, `attempt`), INFO `[workspace] task key set/changed` (`workspaceId`, `from`, `to`), WARN — конфликт ключа.
  - Тесты: модель (валидация, нормализация, подсказка для кириллицы и латиницы), сервис (повтор при конфликте, ошибка поля при ручном ключе).

- [x] **Task 2: Ключ `TSK-42` в задачах и уведомлениях** (зависит от Task 1)
  - Файлы: `src/modules/tasks/models/task.ts` (`formatTaskKey(number, prefix: string | null)`; без префикса — `#42`), `slices/task/{task.select.ts,task.mapper.ts}`, `slices/views/{views.repository.ts,views.queries.ts}`: читать `workspace.taskKey` через связь в select, чтобы не было лишнего запроса. Тесты `task.test.ts`, `views.queries.test.ts`.
  - Найти места, где UI сам собирает `#${number}` (`grep -rn '#\${' src/components src/app`), и перевести их на `key` из DTO.
  - `notifications`: в `taskRef` payload — необязательное `taskKey: z.string().optional()`. `formatNotificationText` берёт его, если поле есть, иначе `#номер`. `tasks` при `notify` передаёт ключ.
  - Логирование: не требуется (форматирование и выборка).

### Фаза 2. Инфраструктура GitHub

- [x] **Task 3: Переменные окружения и клиент GitHub API** (параллельно с Фазой 1)
  - Файлы: `src/shared/env/env.ts` (+ тест): `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY` (PEM, `\n` в строке разворачивается в перевод строки), `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`. Все `optionalNonEmpty`, `superRefine` «все или ни одного», вычисляемый `GITHUB_ENABLED`. Также `.env.example`, `compose.app.yml`, `deploy/tasker/compose.yml`, `deploy/tasker/.env.example` (пустые значения по умолчанию, `${VAR:-}`).
  - Зависимость: `@octokit/app` (или `octokit`) точной версии, `pnpm add`.
  - `src/modules/integrations/github/github-api.ts` (`server-only`): `isGithubEnabled()`, `getGithubApp()` (ленивый singleton через `globalThis`, как `getAuth`), `getInstallationClient(installationId)`, `getUserClient(accessToken)`, `githubInstallUrl(state)`. `callGithub(fn, context)` переводит ошибки Octokit: 404 → `NotFoundError`, 401/403 → `ForbiddenError`, остальное → `InternalError`.
  - Каркас модуля: `index.ts`, `client.ts` с комментарием о зависимостях. Проверить, что правила ESLint (`no-restricted-imports` для `slices/**` и `models/**`) покрывают вложенный путь `integrations/github`, при необходимости поправить `eslint.config.mjs`.
  - Логирование: `createLogger('github.api')` — DEBUG `[github.api] request` (`route`, `installationId`), ERROR `[github.api] failed` (`route`, `status`, без тела ответа). INFO `[github] app initialized` (`appId`) один раз.
  - Тесты: схема env («все или ни одного», разворачивание PEM), маппинг ошибок `callGithub`.

- [x] **Task 4: Схема Prisma и миграция таблиц GitHub** (зависит от Task 1)
  - Файлы: `prisma/schema.prisma` (раздел `// ── GitHub ──` с комментариями), `prisma/migrations/<ts>_add_github_integration/migration.sql`.
  - Модели (id GitHub — `BigInt`):
    - `GithubInstallation`: `id BigInt @id`, `accountId BigInt`, `accountLogin`, `accountType` (`User | Organization`), `suspendedAt?`, `createdAt`, `updatedAt`.
    - `WorkspaceGithubInstallation`: `workspaceId`, `installationId`, `connectedById String?` (SetNull), `createdAt`, `@@id([workspaceId, installationId])`, Cascade с обеих сторон.
    - `GithubRepository`: `id BigInt @id`, `installationId` (Cascade), `fullName`, `private`, `defaultBranch?`, `@@index([installationId])`.
    - `WorkspaceGithubRepository`: `workspaceId`, `repositoryId`, `createdAt`, `@@id`, `@@index([repositoryId])`, Cascade.
    - `GithubPullRequest`: `id BigInt @id`, `repositoryId` (Cascade), `number`, `title`, `url`, `state` (enum `GithubPrState { open draft merged closed }`), `headRef`, `headSha`, `authorId BigInt?`, `authorLogin?`, `reviewState` (enum `GithubReviewState { none approved changes_requested }`), `checksState` (enum `GithubChecksState { none pending success failure }`), `mergedAt?`, `closedAt?`, `githubUpdatedAt`, `@@unique([repositoryId, number])`, `@@index([repositoryId, headSha])`.
    - `GithubPullRequestReview`: `pullRequestId`, `reviewerId BigInt`, `state` (`approved | changes_requested | commented | dismissed`), `submittedAt`, `@@id([pullRequestId, reviewerId])`.
    - `GithubCheckSuite`: `id BigInt @id`, `repositoryId`, `headSha`, `status`, `conclusion?`, `@@index([repositoryId, headSha])`.
    - `TaskPullRequest`: `taskId`, `workspaceId`, `pullRequestId`, `source` (enum `GithubLinkSource { auto manual }`), `dismissedAt?`, `createdAt`, `@@id([taskId, pullRequestId])`, `@@index([workspaceId, pullRequestId])`. FK на `Task(id, workspaceId)` Cascade.
    - `TaskGithubBranch`: `taskId`, `workspaceId`, `repositoryId`, `name`, `deletedAt?`, `createdAt`, `@@id([taskId, repositoryId, name])`.
    - `TaskGithubCommit`: `taskId`, `workspaceId`, `repositoryId`, `sha`, `message` (первая строка, ≤ 200 символов), `url`, `authorLogin?`, `committedAt`, `@@id([taskId, repositoryId, sha])`, `@@index([taskId, committedAt])`.
    - `GithubWebhookDelivery`: `id String @id` (`X-GitHub-Delivery`), `event`, `receivedAt`, `@@index([receivedAt])`.
    - `GithubProjectAutomation`: `projectId @id @db.Uuid`, `workspaceId`, `prOpenedStatusId?`, `prMergedStatusId?`. FK на `Project(id, workspaceId)` Cascade, на `ProjectStatus(id, projectId)` — `SetNull` только для колонки статуса. Проверить, поддерживает ли Prisma SetNull по части составного ключа; если нет — FK на `ProjectStatus.id` с `SetNull` и проверка проекта в модели.
  - Обратные связи в `Workspace`, `Task`, `Project`, `ProjectStatus`, `User`.
  - Логирование: не требуется (схема). Проверка: `pnpm db:migrate` на чистой базе, `pnpm typecheck`.

- [x] **Task 5: Чистые модели модуля GitHub** (зависит от Task 3)
  - Файлы: `src/modules/integrations/github/models/{task-reference.ts,pull-request-state.ts,review-state.ts,checks-state.ts,status-automation.ts,branch-name.ts,index.ts}` и тесты рядом.
  - `findTaskReferences(...texts)` → уникальные `{ key, number }`. Регулярка на границах слова без учёта регистра, номер > 0 и ≤ `Number.MAX_SAFE_INTEGER`, ключ по правилу из Task 1: формат ключа импортируется из `@/modules/workspaces/client`, не дублируется.
  - `toPullRequestState({ state, draft, merged })`.
  - `aggregateReviewState(reviews)` и `aggregateChecksState(suites)` — правила из «Ключевых решений».
  - `shouldAutomate({ currentCategory, targetCategory, currentStatusId, targetStatusId })` — только вперёд по рангу категории.
  - `suggestBranchName(taskKey, number, title)` → `tsk-42-short-title`: транслитерация, ≤ 50 символов.
  - `diffAutoLinks(current, referenced)` → `{ add, remove }`: учитывает `dismissed` и `manual`.
  - Логирование: модели чистые, не логируют.
  - Тесты: все функции, включая граничные (`TSK-0`, `xTSK-1`, `TSK-12abc`, кириллица в названии, повторное открытие слитого PR).

### Фаза 3. Аутентификация и подключение

- [x] **Task 6: Вход через GitHub и привязка аккаунта** (зависит от Task 3; страница `/profile` — из плана профилей)
  - Файлы: `src/shared/auth/auth.ts` (`socialProviders.github` только при `GITHUB_ENABLED`, scope `user:email`; `account.accountLinking` без неявной привязки по email — опции по документации Better Auth 1.7), `src/components/auth/{github-sign-in-button.tsx,sign-in-form.tsx,sign-up-form.tsx}`, `src/modules/integrations/github/slices/identity/{identity.repository.ts,identity.service.ts,identity.actions.ts,identity.dto.ts}`, `src/components/github/github-account-section.tsx`, подключение секции на `/profile`.
  - Кнопка «Войти через GitHub» на `/login` и `/register` (клиент Better Auth `signIn.social`), видна только при включённой интеграции. Флаг передаёт серверная страница.
  - Профиль: «GitHub: не привязан → Привязать» (`linkSocial`), «@login · Отвязать» (`unlinkAccount`). Отвязать последний способ входа нельзя: ошибку плагина показываем текстом.
  - `identity.service`: `getGithubIdentity(userId)` → `{ githubId, login } | null`, `findUsersByGithubIds(ids)` → `Map<githubId, userId>` (чтение `Account` своим репозиторием, как `admin` читает `User`), `getGithubUserToken(userId)` через `auth.api.getAccessToken` (обновляет истёкший токен App).
  - Логирование: `github.identity` — DEBUG поиска (`count`), INFO `[github.identity] linked/unlinked` (`userId`), WARN — токен не получен (`userId`, `reason`), без токенов.
  - Тесты: сервис (маппинг id, отсутствие аккаунта, ошибка токена).

- [x] **Task 7: Подключение установки и выбор репозиториев** (зависит от Task 4, Task 5, Task 6)
  - Файлы: `src/modules/integrations/github/slices/installation/{installation.repository.ts,installation.service.ts,installation.actions.ts,installation.schema.ts,installation.dto.ts,install-state.ts}`, `src/app/api/integrations/github/setup/route.ts`, `src/app/(app)/w/[workspaceSlug]/settings/github/page.tsx`, `src/components/github/{github-settings.tsx,installation-card.tsx,repository-toggle.tsx}`, ссылка «GitHub» в навигации настроек пространства (только owner, только при включённой интеграции). Тесты сервиса, `install-state` и route.
  - `install-state.ts`: `signInstallState({ workspaceId, userId })` / `verifyInstallState(raw, userId)`. HMAC-SHA256 на ключе, производном от `BETTER_AUTH_SECRET` (HKDF, контекст `github-install`), срок 10 мин, сравнение `timingSafeEqual`.
  - `startInstallationAction(workspaceId)`: owner → редирект на `https://github.com/apps/<slug>/installations/new?state=…`. Без привязанного GitHub-аккаунта — ошибка «Сначала привяжите GitHub в профиле».
  - `GET /api/integrations/github/setup?installation_id&setup_action&state`: сессия → `verifyInstallState` → `requireWorkspaceAccess(owner)` → `GET /user/installations` пользовательским токеном (установка должна быть в списке) → upsert установки и репозиториев (`GET /installation/repositories` токеном установки, с пагинацией) → связь с пространством → 303 на `/w/<slug>/settings/github?connected=1`. Любая ошибка → 303 с `?error=<code>`, без деталей.
  - Страница настроек: установки пространства (аккаунт, тип, «Отключить»), установки, доступные пользователю, но не подключённые («Подключить» — та же проверка `/user/installations`), кнопка «Установить на другой аккаунт». Для каждой установки — список репозиториев с переключателями «Использовать в пространстве». Если у GitHub App нет доступа к нужному репозиторию — ссылка «Настроить доступ на GitHub».
  - Actions (owner): `connectInstallationAction`, `disconnectInstallationAction` (удаляет связи пространства с установкой и её репозиториями, а в транзакции — `TaskPullRequest`, ветки и коммиты этих репозиториев в этом пространстве), `setRepositoryEnabledAction`. Проверка, что репозиторий принадлежит подключённой установке (защита от IDOR).
  - Логирование: `github.installation` — DEBUG шагов setup (`workspaceId`, `installationId`, `setupAction`), INFO `[github.installation] connected/disconnected`, `[github.repository] enabled/disabled` (`workspaceId`, `repositoryId`), WARN — неверный/просроченный state, установка недоступна пользователю, не owner.
  - Тесты: подпись state (подмена, срок, чужой userId), сервис подключения (недоступная установка → отказ), route (редиректы на ошибки).

- [x] **Task 8: Webhook-эндпоинт и события установки** (зависит от Task 4, Task 7)
  - Файлы: `src/app/api/webhooks/github/route.ts`, `src/modules/integrations/github/slices/webhook/{webhook.signature.ts,webhook.service.ts,webhook.repository.ts,webhook.schema.ts,handlers/installation.ts}`. Тесты подписи, диспетчера и обработчиков.
  - Route: интеграция выключена → 404. Тело читается как текст, `content-length` или фактический размер > 10 МБ → 413. Подпись проверяется до разбора JSON (`webhook.signature.ts`: HMAC-SHA256, `timingSafeEqual`, заголовок `sha256=`), неверная → 401. Затем `handleGithubWebhook({ event, deliveryId, payload })` и ответ `toErrorResponse` в стиле `api/attachments`.
  - Сервис: вставка `GithubWebhookDelivery` (`isUniqueViolation` → повтор, 200 `duplicate`) → Zod-разбор только нужных полей по событию (`webhook.schema.ts`) → обработчик в `prisma.$transaction` → `after()` для уведомлений и ревалидации. Ошибка обработчика → строка доставки удаляется, 500. Неизвестное событие или action → 200 `ignored`. Иногда (1 из 100 доставок) удаляются доставки старше 7 дней.
  - Реестр обработчиков `Record<event, handler>` расширяется в Task 10–11.
  - `installation`: `created` (upsert установки и репозиториев из payload; к пространству не привязывается — это делает setup), `deleted` (удалить установку, каскад), `suspend` / `unsuspend` (`suspendedAt`). `installation_repositories`: `added` / `removed` (удаление репозитория каскадом снимает связи пространств).
  - Логирование: `github.webhook` — DEBUG `[github.webhook] received` (`event`, `action`, `deliveryId`, `installationId`, `repositoryId`), INFO `[github.webhook] handled` (`event`, `action`, `durationMs`) и изменения установок, WARN `[github.webhook] invalid signature` / `duplicate` / `ignored`, ERROR `[github.webhook] handler failed` (`event`, `deliveryId`).
  - Тесты: подпись (верная, неверная, другой длины, без префикса), повтор доставки, неизвестное событие, обработчики installation на фикстурах (минимальные JSON в `__fixtures__/`).

### Фаза 4. Привязка к задачам

- [x] **Task 9: Системное API модуля `tasks` для интеграций** (зависит от Task 2)
  - Файлы: `src/modules/tasks/slices/placement/{placement.service.ts,placement.repository.ts}`, `slices/task/{task.service.ts,task.repository.ts}`, `src/modules/tasks/index.ts`. Тесты сервисов.
  - `resolveTaskRefs(workspaceId, numbers)` → `{ taskId, number, title, assigneeId, createdById }[]`: только существующие задачи пространства, одним запросом.
  - `listTaskPlacementsForAutomation(workspaceId, taskIds)` → `{ taskId, projectId, statusId, category }[]`.
  - `changePlacementStatusBySystem({ workspaceId, taskId, projectId, statusId, reason })`: логика `changeStatus` без сессии (статус из проекта, конец колонки). Общий код `changeStatus` и системного варианта вынести во внутреннюю функцию. В JSDoc: «только для доверенных вызывающих — подписанный вебхук».
  - Логирование: `tasks.placement` — INFO `[placement] status changed by system` (`workspaceId`, `taskId`, `projectId`, `from`, `to`, `reason`), DEBUG — resolve (`workspaceId`, `requested`, `found`).
  - Тесты: чужой статус → ValidationError, задача не в проекте → NotFound, без изменений → без записи.

- [x] **Task 10: Pull requests: привязка, ревью, CI** (зависит от Task 5, Task 8, Task 9)
  - Файлы: `src/modules/integrations/github/slices/pull-request/{pull-request.repository.ts,pull-request.service.ts,pull-request.dto.ts}`, `slices/webhook/handlers/{pull-request.ts,pull-request-review.ts,check-suite.ts}`, `slices/link/{link.service.ts,link.repository.ts}`. Тесты на фикстурах.
  - `pull_request` (`opened`, `edited`, `reopened`, `closed`, `synchronize`, `ready_for_review`, `converted_to_draft`): upsert PR с защитой от устаревших событий (`githubUpdatedAt`). При `synchronize` — новый `headSha` и `checksState` по сохранённым suites этого sha. Затем `linkService.syncPullRequestLinks(pr, texts)`:
    1. `findTaskReferences(headRef, title, body)`;
    2. пространства, где включён репозиторий (`WorkspaceGithubRepository`) и чей ключ есть среди ссылок (`findWorkspacesByTaskKeys`);
    3. `resolveTaskRefs`;
    4. `diffAutoLinks` → создать / снять автосвязи.
  - Результат обработчика — список «новых связей» и «переходов состояния» (open/ready, merged). Он нужен автоматизации (Task 14) и уведомлениям (Task 15).
  - `pull_request_review` (`submitted`, `dismissed`, `edited`): upsert `GithubPullRequestReview`, пересчёт `reviewState`.
  - `check_suite` (`requested`, `rerequested`, `completed`): upsert suite, пересчёт `checksState` у PR репозитория с этим `headSha`.
  - Чтения для UI: `listTaskPullRequests(session, workspaceId, taskId)` (`requireWorkspaceAccess`, связи без `dismissedAt`) и `getPullRequestBadges(session, workspaceId, taskIds)` → `Record<taskId, { state, count }>` с самым «важным» состоянием (open > draft > merged > closed).
  - Логирование: `github.pr` — DEBUG `[github.pr] refs` (`repositoryId`, `number`, `refs`: только ключ-номер), `[github.pr] stale event skipped`, INFO `[github.pr] upserted` (`repositoryId`, `number`, `state`), `[github.link] linked/unlinked` (`workspaceId`, `taskId`, `pullRequestId`, `source`).
  - Тесты: привязка по ветке, заголовку и описанию; снятие исчезнувшей ссылки; dismissed не восстанавливается; два пространства с разными ключами на одном репозитории; репозиторий не включён → без связей; устаревшее событие; итоги ревью и CI.

- [x] **Task 11: Ветки и коммиты** (зависит от Task 10)
  - Файлы: `slices/webhook/handlers/{push.ts,create.ts,delete.ts}`, `slices/link/link.service.ts` (+ `syncBranch`, `linkCommits`), `slices/link/link.repository.ts`, `slices/link/link.dto.ts`. Тесты на фикстурах.
  - `push`: ветка `refs/heads/*`. Ссылки в имени ветки → `TaskGithubBranch` (upsert, `deletedAt = null`) и все коммиты push. Ссылки в тексте коммита → только этот коммит. Payload содержит до 20 коммитов, за остальными в API не ходим (ограничение пишем в документацию). Upsert `TaskGithubCommit` идемпотентен по `(taskId, repositoryId, sha)`. Push с `deleted: true` помечает ветку удалённой. Теги игнорируются.
  - `create` / `delete` (`ref_type: branch`): создание и пометка удаления ветки.
  - Чтение `listTaskBranchesAndCommits(session, workspaceId, taskId, { commitsLimit: 10 })` → ветки и последние коммиты + общее число.
  - Логирование: `github.link` — DEBUG `[github.push] commits` (`repositoryId`, `count`, `referenced`), INFO `[github.link] branch linked/deleted`, `[github.link] commits linked` (`workspaceId`, `taskId`, `count`).
  - Тесты: ссылка в ветке связывает все коммиты, ссылка только в одном коммите, повторный push без дублей, удаление ветки, тег игнорируется.

### Фаза 5. Интерфейс

- [x] **Task 12: Раздел «GitHub» на странице и в панели задачи** (зависит от Task 10, Task 11)
  - Файлы: `src/components/github/{task-github-section.tsx,pull-request-item.tsx,pr-state-badge.tsx,checks-indicator.tsx,branch-name-copy.tsx,link-pull-request-form.tsx}`, `src/components/tasks/task-panel/task-details-view.tsx` (секция в `Suspense` между вложениями и комментариями, только при включённой интеграции), `src/modules/integrations/github/slices/link/link.actions.ts`, `link.schema.ts`, `client.ts`.
  - Раздел: PR (репозиторий#номер, заголовок-ссылка на GitHub, бейдж состояния, ревью, CI, автор, «Отвязать»), ветки (зачёркнутые — удалённые), последние коммиты (sha 7 символов, первая строка, автор, время) и «ещё N». Пустое состояние — подсказка «Добавьте `TSK-42` в название ветки или PR» и копируемое имя ветки `suggestBranchName`.
  - `dismissPullRequestAction` и `linkPullRequestByUrlAction(url)` (любой участник, `requireWorkspaceAccess`). Ручная привязка: разбор URL `github.com/<owner>/<repo>/pull/<n>` (Zod), репозиторий должен быть включён в пространстве, PR загружается токеном установки и сохраняется как в Task 10, связь `manual` (для `dismissed` — `dismissedAt = null`). Ответ — `ActionResult`, затем `revalidatePath` задачи.
  - Внешние ссылки: `target="_blank" rel="noopener noreferrer"`, тексты из GitHub рендерятся только как текст.
  - Логирование: `github.link` — INFO `[github.link] dismissed/linked manually` (`workspaceId`, `taskId`, `pullRequestId`, `userId`), WARN — репозиторий не подключён или PR не найден.
  - Тесты: схема URL (+ отказ на чужие хосты), сервис ручной привязки (репозиторий не включён → ValidationError, чужое пространство → NotFound).

- [x] **Task 13: Индикатор PR на доске и в списке** (зависит от Task 10)
  - Файлы: `src/components/tasks/{task-card.tsx,kanban-board.tsx,sortable-task-card.tsx}` (необязательный проп `pullRequests?: Record<string, PullRequestBadgeDto>`), `src/components/tasks/task-list/*` (иконка в строке), `src/app/(app)/w/[workspaceSlug]/projects/[projectId]/board/page.tsx`, `.../list/page.tsx`, `src/app/(app)/w/[workspaceSlug]/tasks/page.tsx`, `src/components/github/pr-state-icon.tsx`.
  - Страницы запрашивают `getPullRequestBadges` параллельно с карточками (`Promise.all`) и передают карту. `tasks` о GitHub не знает: тип бейджа импортируется из `@/modules/integrations/github/client`. Если интеграция выключена, запроса нет.
  - Иконка состояния (open — зелёная, draft — серая, merged — фиолетовая, closed — красная) с `aria-label` «PR: слит» и числом, если PR больше одного. Цвета берутся из токенов темы и проверяются в тёмной теме.
  - Логирование: DEBUG в `getPullRequestBadges` (`workspaceId`, `tasks`, `withPr`).
  - Тесты: выбор «важного» состояния в DTO (в тестах сервиса Task 10). Вёрстку проверить скриншотами Playwright (1440 и 375 px).

### Фаза 6. Автоматизация и уведомления

- [x] **Task 14: Автосмена статуса по событиям PR** (зависит от Task 9, Task 10)
  - Файлы: `src/modules/integrations/github/slices/automation/{automation.repository.ts,automation.service.ts,automation.actions.ts,automation.schema.ts,automation.dto.ts}`, `src/components/github/project-automation-form.tsx`, `src/app/(app)/w/[workspaceSlug]/projects/[projectId]/settings/page.tsx` (новая карточка «GitHub», только при включённой интеграции). Тесты.
  - Настройка: два селекта «Когда PR открыт или готов к ревью» и «Когда PR слит» со статусами проекта или «Не менять». Право — `requireWorkspacePermission(manageProjects)`. Статус должен принадлежать проекту (`listStatuses`). `updateProjectAutomationAction` возвращает `FormState`.
  - Применение (в обработчике `pull_request`, для каждой новой связи и перехода): `opened` / `reopened` / `ready_for_review` (не draft) → `prOpenedStatusId`, `closed` + `merged` → `prMergedStatusId`. Для каждого размещения задачи в проекте с настройкой — `shouldAutomate`, затем `changePlacementStatusBySystem` с `reason: 'github_pr_opened' | 'github_pr_merged'`. После коммита — `revalidatePath` доски и задачи через `after()`.
  - Логирование: `github.automation` — DEBUG `[github.automation] evaluated` (`taskId`, `projectId`, `from`, `target`, `apply`), INFO `[github.automation] applied`, `[github.automation] updated` (`projectId`, `userId`), WARN — статус чужого проекта.
  - Тесты: только вперёд, не draft, задача в двух проектах с разными настройками, статус удалён (SetNull) → пропуск.

- [x] **Task 15: Уведомления о PR** (зависит от Task 6, Task 10; модуль `notifications` из плана профилей)
  - Файлы: `prisma/schema.prisma` + миграция (в конец `NotificationType`: `pr_linked`, `pr_merged`, `pr_review`), `src/modules/notifications/models/{notification-type.ts,notification-payload.ts,notification-recipients.ts}` и тесты, `src/modules/integrations/github/slices/notify/github-notify.ts`.
  - Каталог: подписи и описания («К вашей задаче привязан PR», «PR вашей задачи слит», «Ревью вашего PR»), каналы `inApp` + `email`, по умолчанию `inApp: true`, `email: false` (`pr_review` — `email: true`). Приоритеты в `dedupeRecipients` — после существующих. Payload: `taskRef` + `repositoryFullName`, `pullRequestNumber`, `pullRequestUrl`, для ревью — `reviewState`. Ссылка ведёт на задачу. Текст: «PR owner/repo#12 слит · TSK-42 Название».
  - Получатели: `pr_linked` и `pr_merged` — ответственный задачи. `pr_review` (`approved` / `changes_requested`) — автор PR, если его GitHub-аккаунт привязан к участнику пространства. Автор действия — пользователь Tasker, найденный по `sender.id` (`findUsersByGithubIds`), иначе `null` и `actorName` = GitHub-логин. Себе уведомление не отправляется (`dedupeRecipients`).
  - Отправка через `notify()` в `after()` после коммита вебхука. Ошибки уже ловит `notify`.
  - Логирование: `github.notify` — DEBUG `[github.notify] recipients` (`type`, `workspaceId`, `taskId`, `count`), INFO отправки пишет сам `notifications`.
  - Тесты: модели уведомлений (новые типы, тексты, ссылки), выбор получателей (ответственного нет, автор PR не участник, автор = ответственный).

### Фаза 7. Документация

- [x] **Task 16: Документация** (зависит от всех)
  - `docs/github.md` — новая страница:
    - создание GitHub App (права, события, Setup URL с «Redirect on update», callback, webhook URL, секрет), приватный ключ в `.env` (одной строкой с `\n`);
    - локальная разработка: `gh webhook forward` или smee.io;
    - формат ключа и примеры веток;
    - что привязывается и как отвязать, ограничение в 20 коммитов на push;
    - автоматизация и уведомления;
    - что происходит при удалении установки.
  - `docs/configuration.md` — переменные `GITHUB_*`.
  - `docs/architecture.md`:
    - модуль `integrations/github`, его зависимости, вебхук, защита подключения установки;
    - системная смена статуса;
    - ключ задачи;
    - «Вход через GitHub» — вместо «появится».
  - `docs/production.md` — URL вебхука для `tracker.plwedding.ru`, переменные на сервере.
  - `AGENTS.md`:
    - `src/modules/integrations/github`, `src/components/github`;
    - маршруты `api/webhooks/github` и `api/integrations/github/setup`, `settings/github`;
    - точка входа в таблице.
  - `README.md`: пункт в возможностях.
  - Отметить этап в `.ai-factory/ROADMAP.md` — через `/aif-roadmap` (владелец артефакта), не вручную.
  - Логирование: не требуется.
