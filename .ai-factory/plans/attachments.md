# План реализации: Вложения

Branch: none (main; `git.create_branches: false`)
Created: 2026-10-16

## Settings
- Testing: yes (Vitest)
- Logging: standard (INFO на изменениях, WARN на отказах и «не найдено», ERROR на сбоях хранилища; чтения — `debug`)
- Docs: yes  # обязательный docs checkpoint в /aif-implement через /aif-docs

## Roadmap Linkage
Milestone: "Вложения"
Rationale: План покрывает этап целиком: загрузка файлов к задачам и комментариям в S3/MinIO по временным ссылкам с ограничениями по размеру и типу.

## Рамки этапа

**Входит:**
- Блок «Вложения» на странице задачи `/w/[workspaceSlug]/tasks/[taskNumber]`: список файлов, кнопка «Прикрепить файлы» (несколько сразу) и зона перетаскивания, прогресс загрузки по каждому файлу.
- Вложения к комментариям: файлы прикрепляются в форме нового комментария до отправки и показываются под текстом комментария. Комментарий может состоять только из файлов (без текста).
- Загрузка напрямую из браузера в S3/MinIO по presigned POST (политика ограничивает размер, тип и ключ), без прохода файла через сервер приложения.
- Скачивание по короткоживущей presigned GET-ссылке через `GET /api/attachments/[attachmentId]` (проверка доступа → 302).
- Миниатюры для PNG/JPEG/GIF/WebP, клик открывает оригинал в новой вкладке. SVG и прочие типы — только скачивание.
- Ограничения: до 25 МБ на файл, до 20 вложений на задачу (блок задачи), до 10 на комментарий; типы — по allowlist расширений (картинки, PDF, офисные документы, текст/CSV/JSON/Markdown, zip).
- Удаление: загрузивший или владелец пространства (как у задач и комментариев). Удаление задачи или комментария удаляет их вложения из БД и объекты из хранилища.
- Ленивая очистка «брошенных» загрузок (не подтверждённые и не привязанные к комментарию старше 24 ч).

**Не входит:**
- Добавление файлов к уже отправленному комментарию в режиме редактирования (удалять файлы комментария можно).
- Вставка из буфера обмена, вложения в описании задачи (inline), галерея/лайтбокс.
- Антивирусная проверка, генерация миниатюр на сервере, превью PDF и офисных документов.
- Счётчик вложений на карточке доски и в строке списка.
- Квоты на пространство, версии файлов, переименование вложения.
- Очистка объектов при удалении пространства (этап «Администрирование → Пространства»; ключи с префиксом пространства это упрощают).

## Ключевые решения

- **Модель БД `TaskAttachment`** (миграция `add_task_attachments`):
  ```prisma
  enum AttachmentTarget {
    task
    comment
  }

  enum AttachmentStatus {
    /// Слот выдан, файл ещё не подтверждён.
    pending
    /// Файл в хранилище проверен.
    ready
  }

  model TaskAttachment {
    id          String           @id @default(uuid(7)) @db.Uuid
    workspaceId String
    taskId      String           @db.Uuid
    /// Куда прикреплён файл: блок задачи или комментарий.
    target      AttachmentTarget
    /// Комментарий; null при target = comment — черновик формы, ещё не отправлен.
    commentId   String?          @db.Uuid
    /// Загрузивший; null — пользователь удалён (файл остаётся).
    uploaderId  String?
    /// Имя для показа и Content-Disposition (санитизировано). В ключе хранилища не используется.
    fileName    String
    /// MIME по расширению из allowlist, а не из браузера.
    contentType String
    size        Int
    storageKey  String           @unique
    status      AttachmentStatus @default(pending)
    createdAt   DateTime         @default(now())
    uploadedAt  DateTime?

    task     Task         @relation(fields: [taskId, workspaceId], references: [id, workspaceId], onDelete: Cascade)
    comment  TaskComment? @relation(fields: [commentId, taskId], references: [id, taskId], onDelete: Cascade)
    uploader User?        @relation("TaskAttachmentUploader", fields: [uploaderId], references: [id], onDelete: SetNull)

    @@index([taskId, target, status, createdAt])
    @@index([commentId])
    @@index([uploaderId, status, createdAt])
    @@index([workspaceId])
  }
  ```
  - `TaskComment` получает `@@unique([id, taskId])` и `attachments TaskAttachment[]`; `Task.attachments`, `User.taskAttachments @relation("TaskAttachmentUploader")`.
  - Составные FK: вложение не окажется в чужом пространстве (`taskId, workspaceId`) и в комментарии другой задачи (`commentId, taskId`). При `commentId = null` FK не проверяется (MATCH SIMPLE).
  - В миграцию вручную: `CHECK ("target" = 'comment' OR "commentId" IS NULL)`.
- **Ключ хранилища** — `ws/<workspaceId>/tasks/<taskId>/<attachmentId>`, без имени файла: нет проблем с кодировкой и обходом путей, префикс пространства пригодится для массовой очистки.
- **Загрузка в три шага:**
  1. `requestAttachmentUploadAction({ workspaceId, taskId, target, fileName, size })` → проверка доступа, задачи, лимитов и типа → строка `pending` → `createPresignedPost` (`@aws-sdk/s3-presigned-post`, срок 5 мин, условия: `key` eq, `Content-Type` eq, `content-length-range [size, size]`) → `{ attachmentId, url, fields }`.
  2. Браузер отправляет `multipart/form-data` прямо в хранилище (`XMLHttpRequest` ради прогресса).
  3. `completeAttachmentUploadAction({ workspaceId, taskId, attachmentId })` → `HeadObject` (размер совпадает) → для картинок `GetObject` с `Range: bytes=0-15` и проверка сигнатуры → `status = ready`, `uploadedAt`. Расхождение — объект и строка удаляются, ответ `VALIDATION_ERROR`.
- **Тип файла** определяется по расширению из allowlist в модели; `file.type` браузера игнорируется (на Windows CSV приходит как `application/vnd.ms-excel`, у части файлов тип пустой). Allowlist: `png jpg jpeg gif webp svg pdf txt md csv json zip doc docx xls xlsx ppt pptx odt ods odp`.
- **Скачивание.** Route Handler `src/app/api/attachments/[attachmentId]/route.ts` (proxy `/api` не трогает — сессию проверяет сам): `getSession()`, нет сессии или нет доступа → 404; `?inline=1` разрешён только для превьюируемых картинок. Ответ — 302 на presigned GET (`@aws-sdk/s3-request-presigner`, 60 с) с `ResponseContentDisposition` (`attachment`/`inline`, `filename*=UTF-8''…` по RFC 6266/5987) и `ResponseContentType` из БД; заголовок `Cache-Control: private, no-store`. Перед реализацией прочитать `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`.
- **Публичный адрес хранилища.** Новая переменная `S3_PUBLIC_ENDPOINT` (необязательная, по умолчанию `S3_ENDPOINT`): presigned-ссылки подписываются отдельным клиентом на адрес, видимый браузеру. В `compose.app.yml` сервер ходит в `http://minio:9000`, а браузер — в `http://localhost:${APP_MINIO_PORT:-9002}`.
- **CORS хранилища.** Браузер делает POST на другой origin. MinIO: `MINIO_API_CORS_ALLOW_ORIGIN` в `compose.yml` (`http://localhost:3000,http://localhost:3001`); при реализации проверить, что сборка `pgsty/minio` переменную поддерживает и отвечает на preflight. Для AWS S3 — CORS-правило бакета, описать в `docs/configuration.md`.
- **XSS через файлы.** Файлы отдаются с origin хранилища, не приложения; `Content-Type` берётся из БД, а не из загрузки; SVG только как `attachment`; сигнатура картинок проверяется при подтверждении.
- **Вложения комментария.** Форма нового комментария загружает файлы с `target = comment` — получаются готовые черновики (`commentId = null`). `createCommentAction` принимает `attachmentId` (несколько значений, `formData.getAll`) и в одной транзакции создаёт комментарий и привязывает черновики: `updateMany` по `id in`, `taskId`, `workspaceId`, `uploaderId = автор`, `target = comment`, `status = ready`, `commentId = null`; если привязано меньше, чем передано, — `ValidationError`, транзакция откатывается. Текст необязателен, если есть хотя бы один файл.
- **Права** — в модели `models/task-attachment.ts`: `canDeleteAttachment` (загрузивший или `owner`); черновик комментария видит и удаляет только загрузивший. Последний файл комментария без текста удалить нельзя (`ValidationError('Удалите комментарий целиком')`).
- **Очистка объектов.** `deleteTask` и `deleteComment` до удаления собирают `storageKey` вложений, после успешного удаления строк вызывают `deleteStoredObjects(keys)` (`DeleteObjects` пачками по 1000; ошибка — `log.error`, операция пользователя не падает). Удаление вложения: сначала строка, потом объект — при сбое хранилища остаётся «сирота», но не битая ссылка.
- **Ленивая очистка.** `requestUpload` перед выдачей слота удаляет просроченные (`createdAt` < now − 24 ч) `pending` и непривязанные черновики того же загрузившего (строки + объекты), не больше 50 за раз.
- **Чтение.** `listTaskAttachments(session, workspaceId, taskId)` → `TaskAttachmentDto[]` (только `target = task`, `ready`, по `createdAt`). Вложения комментариев приходят в `listTaskComments` (`TaskCommentDto.attachments`) одним запросом через `select`. `TaskAttachmentDto { id, fileName, size, contentType, kind: 'image' | 'file', uploader: TaskUserDto | null, createdAt, href, previewHref: string | null, canDelete }`.
- **Ревалидация** — как у комментариев: `revalidatePath('/w/[workspaceSlug]/tasks/[taskNumber]', 'page')` после подтверждения (target = task) и удаления; черновики комментария страницу не ревалидируют.

## Commit Plan
- **Commit 1** (после задач 1–3): `feat(attachments): storage presigning, attachment schema and domain model`
- **Commit 2** (после задач 4–6): `feat(attachments): upload, download and delete attachments`
- **Commit 3** (после задач 7–8): `feat(task-page): attachments on task and comments`

## Tasks

### Phase 1: Инфраструктура и данные

- [x] Task 1: Presigned-ссылки в `shared/storage`, окружение и compose
  - **По факту:** `MINIO_API_CORS_ALLOW_ORIGIN` в `pgsty/minio` работает (проверено preflight-запросом: чужой origin не получает `Access-Control-Allow-Origin`). Без переменной MinIO разрешает любой origin. В `compose.app.yml` у `minio` публикуется только API на `APP_MINIO_PORT` (9002), консоль — нет.
  - Зависимости той же версии, что `@aws-sdk/client-s3`: `pnpm add @aws-sdk/s3-presigned-post@3.1151.0 @aws-sdk/s3-request-presigner@3.1151.0` (если версии нет — ближайшая совпадающая для всех трёх пакетов).
  - `src/shared/env/env.ts`: `S3_PUBLIC_ENDPOINT: z.url().optional()`, в `transform` — `S3_PUBLIC_ENDPOINT ?? S3_ENDPOINT`. Тест в `env.test.ts`: значение по умолчанию и явное.
  - `src/shared/storage/s3-client.ts`: `getS3PresignClient()` — второй singleton с `endpoint: S3_PUBLIC_ENDPOINT` (если адреса совпадают — тот же клиент).
  - `src/shared/storage/objects.ts` (новый, `server-only`): `createUploadPost({ key, contentType, size, expiresIn })`, `createDownloadUrl({ key, fileName, contentType, disposition, expiresIn })`, `headObject(key)` → `{ size } | null` (404 → null), `readObjectPrefix(key, bytes)` → `Uint8Array`, `deleteObjects(keys)` (пачки по 1000, без исключений — возвращает число ошибок). Заголовок `Content-Disposition` строит переданная функция/строка из модели, `shared` доменных правил не знает.
  - `src/shared/storage/index.ts` — реэкспорт.
  - `compose.yml`: `MINIO_API_CORS_ALLOW_ORIGIN: ${MINIO_CORS_ALLOW_ORIGIN:-http://localhost:3000,http://localhost:3001}` у `minio`. `compose.app.yml`: публикация `${APP_MINIO_PORT:-9002}:9000` для `minio` и `S3_PUBLIC_ENDPOINT: http://localhost:${APP_MINIO_PORT:-9002}` у `app`. `.env.example`: `S3_PUBLIC_ENDPOINT` (закомментирован, с пояснением), `APP_MINIO_PORT`.
  - Логирование (`createLogger('storage')`): `debug` на выдачу ссылок (`key`, `expiresIn`, без подписи и URL), `info` при создании presign-клиента (`endpoint`), `error` на сбоях `HeadObject`/`DeleteObjects` (`key`/число ключей, `err`). Ключи доступа и подписанные URL не логировать.
  - Files: `package.json`, `pnpm-lock.yaml`, `src/shared/env/{env,env.test}.ts`, `src/shared/storage/{s3-client,objects,index}.ts`, `compose.yml`, `compose.app.yml`, `.env.example`.

- [x] Task 2: Модель `TaskAttachment` в схеме и миграция (depends on 1)
  - **По факту:** `prisma migrate dev` в неинтерактивной среде не запускается — SQL получен через `prisma migrate diff --from-config-datasource --to-schema`, дописан `CHECK`, применён `prisma migrate deploy`. Повторный diff пуст.
  - `prisma/schema.prisma`: enum-ы и модель (см. «Ключевые решения»), раздел-комментарий `// ── Вложения ──` с пояснением про составные FK и черновики; `TaskComment @@unique([id, taskId])` и `attachments`; `Task.attachments`; `User.taskAttachments`.
  - `pnpm db:migrate --create-only --name add_task_attachments`, дописать `CHECK`-ограничение, затем применить. Проверить SQL: составные FK (`CASCADE`), FK на `User` (`SET NULL`), уникальный индекс `storageKey`, индексы.
  - Логирование: нет (схема).
  - Files: `prisma/schema.prisma`, `prisma/migrations/<ts>_add_task_attachments/migration.sql`.

- [x] Task 3: Доменная модель вложения (depends on 2)
  - **По факту:** вместо `kind: 'image' | 'file'` — категория для иконки (`image`, `pdf`, `document`, `spreadsheet`, `presentation`, `text`, `archive`) и отдельный флаг `previewable`. Добавлены `findAttachmentType` (без исключения, для клиента), `attachmentTypeOf` (по MIME из БД), `requiresSignatureCheck`, `canViewAttachment`, `isCommentDraft`. `formatFileSize` живёт в модели.
  - `src/modules/tasks/models/task-attachment.ts` (чистый TS):
    - константы `ATTACHMENT_MAX_SIZE = 25 * 1024 * 1024`, `TASK_ATTACHMENTS_LIMIT = 20`, `COMMENT_ATTACHMENTS_LIMIT = 10`, `ATTACHMENT_UPLOAD_TTL_SECONDS = 300`, `ATTACHMENT_DOWNLOAD_TTL_SECONDS = 60`, `ATTACHMENT_STALE_AFTER_MS = 24 ч`;
    - `ATTACHMENT_TYPES` (расширение → MIME, `kind`), `ATTACHMENT_ACCEPT` (строка для `<input accept>`);
    - `sanitizeFileName(name)` — убрать путь (`/`, `\`), управляющие символы и `"`, NFC, trim, не длиннее 200 символов с сохранением расширения; пустое → `ValidationError`;
    - `resolveAttachmentType(fileName)` → `{ contentType, kind, previewable }` или `ValidationError('Такой тип файла нельзя прикрепить')`;
    - `assertAttachmentSize(size)` (1…max), `assertAttachmentLimit(count, target)`;
    - `matchesImageSignature(contentType, bytes)` — PNG, JPEG, GIF, WebP;
    - `contentDisposition(fileName, 'inline' | 'attachment')` — ASCII-fallback + `filename*=UTF-8''…`;
    - `attachmentStorageKey(workspaceId, taskId, attachmentId)`;
    - `canDeleteAttachment` / `assertCanDeleteAttachment` (загрузивший или `owner`; черновик — только загрузивший) → `ForbiddenError('Удалить файл может загрузивший его или владелец пространства')`; `assertCanRemoveFromComment({ bodyLength, attachmentsLeft })`.
  - `models/index.ts` — реэкспорт; `client.ts` — константы лимитов, `ATTACHMENT_ACCEPT`, `resolveAttachmentType` (предпроверка на клиенте), `formatFileSize(bytes)` (`Intl.NumberFormat('ru')`, Б/КБ/МБ).
  - Тесты `task-attachment.test.ts`: санитизация (путь, управляющие символы, длинное имя сохраняет расширение, кириллица), регистр расширения, неизвестный тип, `svg` не превьюируется, границы размера, лимиты по target, сигнатуры (верные и подменённые байты), `contentDisposition` с кириллицей, пробелами и кавычками, права (загрузивший / владелец / участник / удалённый пользователь / черновик чужого).
  - Логирование: модели не логируют.
  - Files: `src/modules/tasks/models/{task-attachment,task-attachment.test,index}.ts`, `src/modules/tasks/client.ts`.

<!-- Commit checkpoint: tasks 1-3 -->

### Phase 2: Сервер

- [x] Task 4: Срез `attachment`: схема, репозиторий, сервис, actions, DTO (depends on 3)
  - **По факту:** ключ хранилища строится из случайного `randomUUID()`, а не из id вложения — id выдаёт БД при вставке, отдельный update не нужен. Добавлены `attachment.select.ts` (`ATTACHMENT_SELECT`, `COMMENT_ATTACHMENTS_SELECT`) и `attachment.mapper.ts`; `findById` — для ссылки скачивания (доступ проверяется по `workspaceId` найденной строки); `commentContent` — для правила «последний файл комментария без текста».
  - `src/modules/tasks/slices/attachment/attachment.schema.ts` (Zod): `requestUploadSchema { workspaceId, taskId, target, fileName, size }`, `completeUploadSchema { workspaceId, taskId, attachmentId }`, `deleteAttachmentSchema` (то же). Переиспользовать `workspaceIdField`, `entityIdField`.
  - `attachment.repository.ts` (`server-only`): `ATTACHMENT_SELECT`; `taskExists`, `countForTarget(workspaceId, taskId, target, uploaderId?)` (для комментария — черновики загрузившего), `createPending`, `find(key)`, `markReady(key, uploadedAt)` → `count`, `delete(key)` → `count`, `listForTask(workspaceId, taskId)`, `findStale(uploaderId, before, take)`, `deleteByIds(ids)`, `bindToComment(tx, { ids, workspaceId, taskId, uploaderId, commentId })` → `count`, `keysForTask(workspaceId, taskId)`, `keysForComment(workspaceId, taskId, commentId)`. Все `where` — с `workspaceId` и `taskId`.
  - `attachment.storage.ts` (`server-only`): `deleteStoredObjects(keys, context)` поверх `deleteObjects` с логированием — общий для сервисов задачи, комментария и вложения.
  - `attachment.dto.ts`: `TaskAttachmentDto`, `AttachmentUploadDto { attachmentId, url, fields }`; маппер `toAttachmentDto(row, access)` (ссылки `href = /api/attachments/<id>`, `previewHref = …?inline=1` для превьюируемых).
  - `attachment.service.ts` (`server-only`): `listTaskAttachments`, `requestUpload` (доступ → задача → ленивая очистка → тип и размер → лимит → строка → presigned POST), `completeUpload` (только загрузивший и только `pending`; `HeadObject`, сигнатура; при расхождении — удалить объект и строку), `deleteAttachment` (права, правило последнего файла комментария, удаление строки → объекта), `getAttachmentDownload(session, attachmentId, { inline })` → `{ url }` для route handler (по `id` → `workspaceId` → `requireWorkspaceAccess`; черновик чужого → `NotFoundError`).
  - `attachment.actions.ts` (`'use server'`): `requestAttachmentUploadAction`, `completeAttachmentUploadAction` — `ActionResult` (вызываются из кода, как `movePlacementAction`); `deleteAttachmentAction` — `FormState` (для `ConfirmActionDialog`). Ревалидация страницы задачи — только для `target = task` и при удалении.
  - `src/modules/tasks/index.ts`: `listTaskAttachments`, `getAttachmentDownload`, тип `TaskAttachmentDto`. `client.ts`: три action и типы DTO.
  - Тесты:
    - `attachment.schema.test.ts`: невалидные UUID, отрицательный/нулевой размер, неизвестный `target`.
    - `attachment.service.test.ts` (моки репозитория и `@/shared/storage`, по образцу `comment.service.test.ts`): неучастник → `NOT_FOUND`; задача чужого пространства → `NOT_FOUND`; запрещённый тип и превышение размера → `VALIDATION_ERROR` без строки в БД; лимит 20/10; подтверждение чужого слота → `NOT_FOUND`; размер в хранилище не совпал / нет объекта / подменённая сигнатура → объект и строка удалены, `VALIDATION_ERROR`; повторное подтверждение `ready` — no-op; удаление: загрузивший, владелец, участник → `FORBIDDEN`; последний файл комментария без текста → `VALIDATION_ERROR`; ленивая очистка вызывает удаление объектов; скачивание: `inline` для не-картинки → `attachment`, черновик чужого → `NOT_FOUND`.
  - Логирование (`createLogger('tasks.attachment')`):
    - `log.debug({ userId, workspaceId, taskId, count }, '[attachment.list]')`, `debug` на выдачу ссылки скачивания (`attachmentId`, `inline`);
    - `log.info({ workspaceId, taskId, attachmentId, userId, target, size, contentType }, '[attachment] upload requested|uploaded|deleted')`; для удаления — `byOwner`; `info` на ленивую очистку (`userId`, `count`);
    - `log.warn(..., '[attachment] rejected')` с причиной (`type`, `size`, `limit`, `size-mismatch`, `signature`, `missing-object`), `warn` на `forbidden` и `not found`;
    - `log.error` на сбоях хранилища (через `attachment.storage.ts`).
    - Имя файла логировать можно только как расширение; подписанные URL и поля политики — никогда.
  - Files: `src/modules/tasks/slices/attachment/{attachment.schema,attachment.schema.test,attachment.repository,attachment.storage,attachment.dto,attachment.service,attachment.service.test,attachment.actions}.ts`, `src/modules/tasks/{index,client}.ts`.

- [x] Task 5: Вложения в комментариях и очистка объектов при удалении задачи и комментария (depends on 4)
  - `comment.schema.ts`: `body` допускает пустую строку после нормализации; `attachmentIds: z.array(entityIdField).max(COMMENT_ATTACHMENTS_LIMIT).default([])` (в action собирать через `formData.getAll('attachmentId')`).
  - `comment.service.ts`:
    - `createComment` — пустой текст без файлов → `ValidationError` с ошибкой поля `body` «Напишите комментарий или приложите файл»; создание комментария и `bindToComment` в одной `prisma.$transaction`; привязано меньше переданного → `ValidationError('Файлы не найдены — загрузите их заново')`.
    - `updateComment` — пустой текст допустим, только если у комментария есть файлы.
    - `deleteComment` — собрать ключи (`keysForComment`) до удаления, после — `deleteStoredObjects`.
    - `listTaskComments` — `attachments` в `COMMENT_SELECT` (только `ready`), `TaskCommentDto.attachments: TaskAttachmentDto[]`.
  - `task.service.ts` `deleteTask` — ключи всех вложений задачи (`keysForTask`) до удаления, `deleteStoredObjects` после.
  - `comment.actions.ts` `createCommentAction` — передать `attachmentIds`; при ошибке возвращать их в `values` (`attachmentIds` через запятую), чтобы форма не потеряла черновики.
  - Тесты: дополнить `comment.schema.test.ts` (пустой текст + файлы проходит схему, больше 10 id — ошибка), `comment.service.test.ts` (пустой текст без файлов, привязка в транзакции, недопривязка → откат, удаление комментария удаляет объекты, пустой текст при правке — с файлами/без), `task.service.test.ts` (удаление задачи удаляет объекты; сбой хранилища не ломает удаление).
  - Логирование: `info` `[comment] created` дополнить `attachments: n`; `[comment] deleted` и `[task] deleted` — `attachments: n`; сбой очистки — `error` в `attachment.storage.ts`.
  - Files: `src/modules/tasks/slices/comment/{comment.schema,comment.schema.test,comment.repository,comment.service,comment.service.test,comment.actions,comment.dto}.ts`, `src/modules/tasks/slices/task/{task.service,task.service.test}.ts`.

- [x] Task 6: Route Handler скачивания `GET /api/attachments/[attachmentId]` (depends on 4)
  - **По факту:** образца тестов route handlers в проекте нет — покрытие через тесты `getAttachmentDownload`. Пустой текст без файлов при создании отсекает схема (`superRefine`, ошибка поля `body`), сервис проверяет это повторно.
  - Перед началом прочитать `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` и `01-app/02-guides/authentication.md` (раздел о Route Handlers).
  - `src/app/api/attachments/[attachmentId]/route.ts`: `getSession()`; нет сессии → 404 (не раскрываем существование); `getAttachmentDownload(session, attachmentId, { inline: searchParams.get('inline') === '1' })` → `NextResponse.redirect(url, 302)` с `Cache-Control: private, no-store` и `Referrer-Policy: no-referrer`; `NotFoundError` → 404, прочие ошибки — `toErrorResponse`.
  - Тест (если в проекте есть образец тестов route handlers — по нему; иначе покрытие через сервис в Task 4 достаточно).
  - Логирование: обработчик не логирует сам, кроме неожиданных ошибок (через `toErrorResponse`); доступ логирует сервис.
  - Files: `src/app/api/attachments/[attachmentId]/route.ts`.

<!-- Commit checkpoint: tasks 4-6 -->

### Phase 3: UI

- [x] Task 7: Компоненты загрузки и списка вложений, блок «Вложения» на странице задачи (depends on 5, 6)
  - **По факту:** дополнительно `attachment-icon.tsx` и `upload-row.tsx`; зона перетаскивания и хук `useFileDrop` — в `attachment-dropzone.tsx` (переиспользуется формой комментария). `task-attachments-section.tsx` подаёт серверный список в `AttachmentDropzone` как `children`. Готовая строка загрузки убирается после ответа `completeAttachmentUploadAction` — к этому моменту ревалидированный список уже пришёл. Проверено в Playwright: загрузка 5 файлов (PNG, PDF с кириллицей, TXT — приняты; поддельный PNG отклонён по сигнатуре и удалён из MinIO; `.exe` отклонён на клиенте), миниатюра, 302 на presigned GET с `Content-Disposition`, 404 без сессии. Отдельным скриптом проверено, что MinIO отклоняет POST с другим размером, типом и ключом.
  - Перед началом перечитать `node_modules/next/dist/docs/01-app/02-guides/forms.md` и `server-actions.md`.
  - `src/components/tasks/attachments/use-attachment-upload.ts` (`'use client'`): очередь файлов; для каждого — предпроверка `resolveAttachmentType` и размера на клиенте → `requestAttachmentUploadAction` → `XMLHttpRequest` POST на `url` с `fields` и файлом последним полем (прогресс `upload.onprogress`, отмена `abort()`) → `completeAttachmentUploadAction`. Состояния: `uploading(progress) | done | error(message)`. Ограничение параллелизма — 3 файла. Ответ хранилища с ошибкой (`EntityTooLarge`, 403) → понятное сообщение.
  - `attachment-dropzone.tsx`: кнопка «Прикрепить файлы» (`<input type="file" multiple accept={ATTACHMENT_ACCEPT}>`, скрытый, с `aria-label`) + перетаскивание на блок (подсветка, `onDragOver`/`onDrop`); подпись «до 25 МБ».
  - `attachment-list.tsx` / `attachment-item.tsx`: миниатюра (`<img src={previewHref} loading="lazy">` 64×64, `object-cover`; `eslint-disable-next-line @next/next/no-img-element` с пояснением — внешний короткоживущий URL) или иконка по `kind`/расширению (lucide), имя (обрезка с `title`), размер `formatFileSize`, загрузивший и дата (форматирует сервер), ссылка `href` (`download` для файлов, `target="_blank" rel="noopener noreferrer"` для картинок), удаление через `ConfirmActionDialog` (только `canDelete`). Строки загружающихся файлов — с `Progress` (shadcn; если компонента нет — `pnpm dlx shadcn@latest add progress`) и кнопкой отмены.
  - `task-attachments-section.tsx` (серверный): `listTaskAttachments` → заголовок «Вложения (N)», список, `AttachmentDropzone` с `target="task"`; при достижении лимита — подсказка вместо кнопки. После успешного подтверждения клиент вызывает `router.refresh()` не нужен — action ревалидирует страницу; проверить, что список обновляется без перезагрузки.
  - `src/app/(app)/w/[workspaceSlug]/tasks/[taskNumber]/page.tsx`: секция `<section aria-labelledby="task-attachments-heading">` между сеткой полей и комментариями, свой `<Suspense>` со скелетоном. Описание диалога удаления задачи: «Задача исчезнет со всех досок вместе с комментариями и файлами. Действие нельзя отменить.»
  - Логирование: клиентские компоненты не логируют; ошибки показываются в строке файла, ошибка удаления — в диалоге.
  - Files: `src/components/tasks/attachments/{use-attachment-upload.ts,attachment-dropzone.tsx,attachment-list.tsx,attachment-item.tsx,task-attachments-section.tsx}`, `src/components/ui/progress.tsx` (если добавляется), `src/app/(app)/w/[workspaceSlug]/tasks/[taskNumber]/page.tsx`.

- [x] Task 8: Файлы в комментариях и ручная проверка (depends on 7)
  - **По факту:** черновики формы — те же `UploadRow`; крестик у готового черновика вызывает `deleteAttachmentAction`. Найдено и исправлено при проверке: `addFiles` читал `FileList` в отложенном updater'е `setItems`, а сброс `input.value` его уже очищал — файлы копируются в массив до обновления состояния (и updater без побочных эффектов). У `CommentBodyField` убран `required` (текст необязателен при файлах). Ручная проверка в Playwright (dev, порт 3000): комментарий только из файла (Ctrl+Enter), пустая отправка → ошибка поля, текст + файл, удаление черновика до отправки, запрет удалить последний файл комментария без текста, участник не видит черновик владельца (404) и не может удалять чужие файлы, владелец удаляет файл участника, удаление комментария и задачи убирает объекты из MinIO (в итоге 0 объектов и 0 строк). То же для загрузки и скачивания в `pnpm app:up` (3001, MinIO 9002). Лимиты 25 МБ и 20/10 файлов вручную не проверялись — покрыты тестами модели и сервиса, политику размера MinIO проверил отдельный скрипт. Тестовые данные из dev-БД удалены. `pnpm check` (634 теста) и `pnpm build` зелёные.
  - `comment-form.tsx`: кнопка-скрепка рядом с «Отправить» и перетаскивание на поле текста (тот же `useAttachmentUpload` с `target="comment"`); под полем — чипы черновиков с прогрессом и крестиком (крестик удаляет черновик через `deleteAttachmentAction`); скрытые `<input name="attachmentId">` для готовых; «Отправить» недоступна, пока идёт загрузка; после успеха черновики очищаются, при ошибке — остаются (восстановление из `values.attachmentIds`). `Ctrl/⌘+Enter` работает и без текста, если есть файлы.
  - `comment-item.tsx`: под текстом — `AttachmentList` в компактном виде (миниатюры в ряд, файлы чипами); в режиме правки — удаление отдельных файлов (только `canDelete`). Комментарий только из файлов показывается без пустого абзаца.
  - Проверить вручную (`pnpm infra:up`, `pnpm dev`): загрузка нескольких файлов к задаче с прогрессом; отказ для `.exe` и файла > 25 МБ (на клиенте и, подменив запрос, на сервере/хранилище); PNG, переименованный из `.txt`, отклонён при подтверждении; миниатюры и открытие оригинала; скачивание PDF и файла с кириллицей в имени; ссылка через 60 с больше не работает, а `/api/attachments/<id>` выдаёт новую; неучастник и выход из сессии → 404; удаление файла автором, владельцем, отказ участнику; комментарий только из файлов; удаление комментария и задачи убирает объекты из MinIO (консоль http://localhost:9001); лимит 20 файлов. Затем то же для загрузки в `pnpm app:up` (порт 3001, MinIO 9002).
  - `pnpm check` и `pnpm build` зелёные.
  - Логирование: компоненты не логируют.
  - Files: `src/components/tasks/comments/{comment-form,comment-item,comment-list}.tsx`, `src/components/tasks/attachments/attachment-list.tsx`.

<!-- Commit checkpoint: tasks 7-8 -->

## Риски

- **CORS MinIO.** Если `pgsty/minio` не поддерживает `MINIO_API_CORS_ALLOW_ORIGIN` или preflight на POST не проходит — проверить `mc admin config set … api cors_allow_origin=…` в `minio-init`; запасной вариант — загрузка через Route Handler приложения (стриминг в S3), но тогда лимит размера и нагрузка ложатся на сервер.
- **Сироты в хранилище.** Сбой `DeleteObjects` после удаления строк оставляет объекты без записей; ленивая очистка их не найдёт. Приемлемо на этом этапе, ошибки видны в логах; позже — периодическая сверка по префиксу `ws/`.
- **Подмена содержимого не-картинок.** Для PDF/офисных файлов сигнатура не проверяется; риск ограничен тем, что файлы отдаются с отдельного origin и как `attachment`.
- **Часы и срок ссылок.** Presigned-ссылки чувствительны к расхождению времени между приложением и хранилищем; в Docker-окружении это одно время хоста.
- **Лимит на задачу и гонки.** Две параллельные загрузки могут превысить лимит на 1–2 файла (проверка `count` без блокировки). Для мягкого лимита приемлемо.
