# План реализации: связка tasker и meet

Branch: none (`git.create_branches: false`, работа в текущей ветке)
Created: 2026-10-21

## Settings
- Testing: yes — Vitest (`environment: node`) для чистых функций: подпись и проверка контекста задачи, проверка подписи вебхука (окно времени, неверная подпись, другая длина), схемы событий, Markdown конспекта, разбор срока поручения; сервисы вебхука — с моками репозиториев по образцу GitHub (дубликат, игнор, откат при ошибке, хост без доступа).
- Logging: verbose — `createLogger('integrations:meet')`: `info` — созвон начат (workspaceId, taskId, jti), событие принято (deliveryId, event, result), конспект сохранён (meetingId, documentId); `warn` — неверная подпись, истёкший контекст, хост без доступа или не связан с IdP, задача в архиве; `debug` — разбор события, сопоставление `sub` → пользователь. Подпись, контекст-токен целиком, текст конспекта и секреты в логи не попадают (`REDACT_PATHS`).
- Docs: yes — обязательный шаг документации в конце (`/aif-docs`).

## Roadmap Linkage
Milestone: "Связка tasker и meet"
Rationale: план делает сторону tasker и фиксирует контракт для meet; сторону meet планируют отдельно в `D:\work\meet` по `docs/meet.md`.

## Контекст и принятые решения

**meet сейчас** (`D:\work\meet`): встреча — `Meeting` (`id` uuid, `code` вида `abc-defg-hij`, `hostId`, `endedAt`), адрес `https://meet.plwedding.ru/<code>`, ссылка — приглашение (гости без учётки, лобби по умолчанию). Создать встречу может только вошедший пользователь (`createMeetingAction`, без параметров). Конспект — `Recap` (запись запускает организатор вручную; после расшифровки YandexGPT пишет `summary`: `{ overview, topics[], decisions[], actionItems[{owner, task, due?}], openQuestions[] }`, статус `ready`). Событий наружу у meet нет; точка для «конспект готов» — `recap-runner.ts` после `recap.complete()`. Вход — тот же IdP, `sub` в `Account.accountId` (`providerId = 'plwedding'`). В meet своя договорённость: тексты расшифровок в задачи не попадают.

**Решения (согласовано):**
- Этот план — сторона tasker и контракт `docs/meet.md`. Сторону meet планируем отдельно в `D:\work\meet`.
- **Созвон начинается в браузере**, сервисных вызовов tasker → meet нет:
  1. Кнопка «Созвон» в задаче → server action подписывает **контекст задачи** (HMAC-SHA256, срок 10 минут) и отдаёт адрес `<MEET_URL>/new?ctx=<токен>`.
  2. meet через SSO знает пользователя, проверяет подпись, срок и что `sub` вошедшего = `sub` в контексте, создаёт встречу (повторный клик с тем же `jti` — та же встреча) и открывает её.
  3. meet шлёт вебхук `meeting.created` с исходным `ctx`; tasker проверяет свою же подпись и связывает встречу с задачей. Доверяем только тому, что tasker сам подписал.
- **В документы задачи — только конспект**: Markdown-заметка (обзор, темы, решения, поручения, открытые вопросы, ссылка на встречу). Расшифровка остаётся в meet. Markdown собирает tasker из JSON (`summary`), а не принимает готовый текст.
- **Поручения → подзадачи кнопкой в tasker**: поручения конспекта хранятся при встрече; в разделе «Созвоны» — диалог «Создать подзадачи» с выбором пунктов. Создаёт пользователь своей сессией через существующие `createTask` + `setTaskParent`.
- **Вебхуки meet → tasker**: `POST /api/integrations/meet/webhook`, подпись `X-Meet-Signature: t=<unix>,v1=<hex HMAC-SHA256 от "<t>.<тело>">`, окно ±5 минут, `X-Meet-Delivery` (uuid) — идемпотентность, как у GitHub (`MeetWebhookDelivery`, откат записи при ошибке → 500 и повтор). События: `meeting.created`, `meeting.ended`, `recap.ready`. Ретраи — забота meet (контракт: экспоненциально до 24 ч, 2xx на `duplicate`/`ignored`).
- **Два секрета**, без брокера: `MEET_CONTEXT_SECRET` (tasker подписывает контекст, meet проверяет) и `MEET_WEBHOOK_SECRET` (meet подписывает, tasker проверяет). Плюс `MEET_URL`. Все три или ни одного; без них интеграция выключена, раздела и кнопки нет, вебхук отвечает 404.
- **Автор заметки** — пользователь tasker, начавший созвон (по `sub` хоста), если он ещё участник пространства и задача не в архиве; иначе конспект не сохраняется (`ignored`, `warn`). Нужна системная функция документов без `AuthSession` (по образцу системных функций, только для модуля meet): права на документы не проверяются — конспект прикреплён к задаче, которую видит любой участник.
- Встреча видна всем участникам пространства на странице задачи (ссылка — приглашение; пускает лобби meet).

**Контекст-токен (tasker → meet):** `base64url(JSON).base64url(HMAC-SHA256(MEET_CONTEXT_SECRET, "ctx." + base64url(JSON)))`, JSON: `{ v: 1, iss: 'tasker', aud: 'meet', jti, sub, workspaceId, workspaceName, taskId, taskKey, taskTitle, taskUrl, iat, exp }`.

**Вне плана:** сторона meet; создание встречи из MCP; индикатор созвона на карточке доски; запись по расписанию; скриншоты справки (переснять отдельно `pnpm help:screenshots`).

## Tasks

### Фаза 1. Контракт, конфигурация, схема

- [x] **1. Контракт интеграции `docs/meet.md`.** Документ для обеих сторон: поток «Созвон» (схема шагов), формат контекст-токена и проверки на стороне meet (подпись, `aud`, срок, `sub` вошедшего, повтор по `jti`), адрес `/new?ctx=`, вебхуки (адрес, заголовки, подпись с меткой времени, окно, идемпотентность, ответы 2xx/4xx/5xx, политика повторов), схемы событий:
  - `meeting.created` `{ meetingId, code, url, hostSub, createdAt, ctx }`;
  - `meeting.ended` `{ meetingId, endedAt }`;
  - `recap.ready` `{ meetingId, recapId, completedAt, summary: { overview, topics[], decisions[], actionItems[{owner, task, due?}], openQuestions[] } }` — без расшифровки.
  Переменные обеих сторон, ротация секретов. Файл: `docs/meet.md`. Логирование: нет (документ).

- [x] **2. Переменные окружения.** Группа `MEET_URL` (http(s), origin), `MEET_CONTEXT_SECRET`, `MEET_WEBHOOK_SECRET` (min 32) в `src/shared/env/env.ts` по образцу `GITHUB_*`: все или ни одного (`superRefine`), производный флаг `MEET_ENABLED`. Шаблоны: `.env.example`, `deploy/tasker/.env.example`; проверить, что `deploy/tasker/compose.yml` передаёт переменные в `app`. Секреты — в `REDACT_PATHS` логгера. Тест схемы env (частичная группа — ошибка). Логирование: при старте `info` «meet integration enabled/disabled» один раз (без значений).

- [x] **3. Схема БД и миграция.** В `prisma/schema.prisma`:
  - `TaskMeeting` — `id` (uuid v7), `workspaceId`, `taskId` (составной FK `(taskId, workspaceId)` → `Task`, Cascade), `meetMeetingId` (unique), `code`, `url`, `hostUserId?` (→ `User`, SetNull), `contextJti` (unique), `startedAt`, `endedAt?`, `createdAt`; индекс `[workspaceId, taskId]`.
  - `TaskMeetingRecap` — `id`, `meetingId` (→ `TaskMeeting`, Cascade), `meetRecapId` (unique), `documentId?` (составной FK на `Document`, SetNull), `actionItems Json` (`[{ owner, task, due, subtaskId|null }]`), `completedAt`, `createdAt`.
  - `MeetWebhookDelivery` — `id` (delivery id), `event`, `receivedAt`, индекс `[receivedAt]`.
  - `NotificationType` += `meeting_summary_ready` (в конец).
  Миграция `pnpm db:migrate --name add_task_meetings`. Связи в `Task`, `User`, `Document`. Логирование: нет.

### Фаза 2. Ядро интеграции

- [x] **4. Модуль `src/modules/integrations/meet` — модели и границы.** Структура как у `integrations/github` (`index.ts` — сервер, `client.ts` — клиент). Чистые функции в `models/`:
  - `context-token.ts` — `signTaskContext(payload, secret, now)` / `verifyTaskContext(token, secret, { now, maxAgeSeconds })` (`timingSafeEqual`, проверка `v`, `iss`, `aud`; для вебхука — допускается истёкший `exp`, но `iat` не старше 24 ч);
  - `webhook-signature.ts` — разбор `t=…,v1=…`, проверка окна ±300 с и HMAC от `"<t>.<тело>"`;
  - `webhook-events.ts` — zod-схемы трёх событий (лимиты длины строк и массивов);
  - `summary-note.ts` — `renderMeetingSummaryNote(summary, { taskKey, meetingUrl, completedAt })` → `{ title, content }` (экранирование Markdown в пользовательских строках, пустые разделы не выводятся; заголовок «Встреча <дата> — <TSK-42>»);
  - `action-items.ts` — разбор `due` (ISO-дата или null).
  Тесты на все пять. Правила ESLint-границ (`eslint.config.mjs`): meet зависит от tasks, documents, workspaces, notifications, shared. Логирование: в моделях нет; ошибки разбора возвращаются результатом.

- [x] **5. Старт созвона.** Срез `slices/start`: `startTaskMeeting(session, { workspaceId, taskId })` → `{ url }`:
  - `MEET_ENABLED`, иначе `NotFoundError`;
  - `requireWorkspaceAccess`, задача существует и не в архиве (`assertTaskActive`);
  - `findIdpSubject(session.user.id)`, без связи — `ValidationError` «Войдите через plwedding ID»; агентам (`isAgent`, токены) — `ForbiddenError`;
  - лимит `enforceRateLimit('meetStart', { userId })` — 10 в минуту (правило в `RATE_LIMITS`);
  - контекст с `taskUrl` на `/w/<slug>/tasks/<n>`.
  Action `startTaskMeetingAction` в `client.ts`. Тест сервиса (архив, агент, нет sub, успех). Логирование: `info` «meet start» (workspaceId, taskId, jti), `warn` при отказе с причиной.

- [x] **6. Вебхук meet.** Маршрут `src/app/api/integrations/meet/webhook/route.ts` по образцу GitHub: 404 без `MEET_ENABLED`, лимит тела 256 КБ (Content-Length и фактический), сырое тело, проверка подписи (401), `X-Meet-Delivery` uuid и `X-Meet-Event` из списка (400), `JSON.parse` + zod (400). Сервис `slices/webhook`: `recordDelivery` (P2002 → `duplicate`), обработчик в `prisma.$transaction`, при ошибке `forgetDelivery` и 500, `afterCommit` для уведомлений и реалтайма, очистка доставок старше 7 дней (~1% запросов). Обработчики:
  - `meeting.created` — проверить `ctx` своей подписью, `hostSub` = `ctx.sub`, хост → пользователь (`findUsersByIdpSubjects`) с доступом к пространству, задача активна; upsert `TaskMeeting` по `meetMeetingId` (повтор того же `jti` — та же строка); audit `meeting.started` (content, автор — хост); `emitTaskEvent(null, task.updated)`;
  - `meeting.ended` — `endedAt`, если встреча известна, иначе `ignored`;
  - `recap.ready` — встреча известна; upsert `TaskMeetingRecap` по `meetRecapId`; заметка (задача 7); поручения в `actionItems`; audit `meeting.summary_added`; уведомление (задача 7); реалтайм.
  Тесты сервиса с моками (дубликат, неизвестное событие, чужая подпись `ctx`, несовпадение `sub`, хост без доступа, архив, повтор `recap.ready`). Логирование: `info` на каждую доставку с `result`, `warn` на отказы, `error` на исключение обработчика.

- [x] **7. Конспект в документы, журнал, уведомление.**
  - В `documents`: системная `createSystemTaskNote(tx, { workspaceId, taskId, createdById, title, content })` — создаёт заметку (без папки) и связь с задачей в той же транзакции, audit `document.created` с автором-хостом; экспорт с пометкой «только для integrations/meet». Тест.
  - Каталог журнала `src/shared/audit/audit-catalog.ts`: `meeting.started`, `meeting.summary_added` (категория `content`, снимки задачи, документа, `code`); подписи в `audit-kind-labels.ts` и `describe-audit-event.ts`; тест каталога.
  - Уведомление `meeting_summary_ready`: тип, подпись, payload-схема и оба `switch`, приоритет получателей (`notification-type.ts`, `notification-payload.ts`, `notification-recipients.ts`); получатели — хост, исполнитель и наблюдатели задачи; ссылка на заметку. Письмо — по настройкам «тип × канал».
  Логирование: `info` «meet summary saved» (meetingId, documentId), `debug` — получатели (только id).

### Фаза 3. Интерфейс

- [x] **8. Раздел «Созвоны» в задаче.** Чтение `listTaskMeetings(session, { workspaceId, taskId })` → встречи (новые сверху): код, ссылка, хост, начало, конец/«идёт», конспекты (ссылка на заметку, число поручений, сколько уже стали подзадачами). Компонент `src/components/meet/task-meeting-section.tsx` (серверный, `null` без `MEET_ENABLED`), вставка после GitHub в `task-details-view.tsx` в `<Suspense fallback={null}>`. Кнопка «Начать созвон» (клиентская, вызывает action и открывает адрес в новой вкладке; ошибка — тостом), «Присоединиться» у идущей встречи, `EmptyState` «Созвонов по задаче ещё не было». Пункт «Начать созвон» в меню «⋯» `task-toolbar.tsx`. В архиве — только чтение. Тона и токены по `.ai-factory/rules/design.md`. Логирование: клиентских логов нет; ошибки action — через `toActionError`.

- [x] **9. Поручения → подзадачи.** Диалог `src/components/meet/action-items-dialog.tsx`: список поручений конспекта с флажками (уже созданные — ссылкой на подзадачу, недоступны), поле исполнителя по каждому (по умолчанию — участник, чьё имя совпало с `owner` без учёта регистра, иначе пусто), срок из `due`. Action `createSubtasksFromActionItemsAction({ workspaceId, recapId, items: [{ index, assigneeId? }] })`: доступ к задаче, задача активна; для каждого пункта — `createTask` (название — `task`, описание — «Из конспекта встречи <дата>, ответственный: <owner>») и `setTaskParent`; запись `subtaskId` в `actionItems` (повторно тот же пункт не создаётся — проверка под `SELECT … FOR UPDATE`); до 20 пунктов за раз. Тест сервиса (повтор, чужое пространство, архив). Логирование: `info` «meet action items → subtasks» (recapId, count), `warn` при отказе.

### Фаза 4. Документация

- [x] **10. Документация и контекст.**
  - `docs/architecture.md` — раздел «Связка с meet» (поток, модели, вебхук, безопасность), HTTP-эндпоинты;
  - `docs/configuration.md` — `MEET_*`; `docs/production.md` — секреты в `/opt/tasker/.env` и `/opt/meet/.env`, порядок включения (сначала tasker, затем meet), проверка;
  - справка: статья `content/help/meetings.md` + каталог `help-catalog.ts` (без скриншотов, пометка о пересъёмке);
  - `AGENTS.md` (модуль, маршрут, компоненты), `.ai-factory/ARCHITECTURE.md` (зависимости модуля), `.ai-factory/DESCRIPTION.md` (интеграция с meet);
  - роадмап — отметить этап после выполнения стороны meet (через `/aif-roadmap`).
  Логирование: нет.

## Commit Plan
- **Коммит 1** (после задач 1–3): `feat(meet): integration contract, config and schema`
- **Коммит 2** (после задач 4–7): `feat(meet): start a call from a task and receive meet webhooks`
- **Коммит 3** (после задач 8–9): `feat(meet): calls section and subtasks from action items`
- **Коммит 4** (после задачи 10): `docs(meet): integration with meet`
