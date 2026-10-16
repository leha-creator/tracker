# План реализации: документы пространства (файловое хранилище, Markdown-заметки, просмотр, папки, теги, связь с задачами)

Branch: none (git.create_branches = false — работа в текущей ветке)
Created: 2026-10-16

## Settings

- Testing: yes — юнит-тесты Vitest для моделей, схем и сервисов (по образцу существующих `*.test.ts`, `environment: node`)
- Logging: verbose — DEBUG на чтениях и ветвлениях, INFO на изменениях, WARN на отказах доступа, конфликтах версий и ошибках валидации, ERROR на сбоях хранилища; через `createLogger(scope)`. Не логировать содержимое заметок, имена файлов целиком (только расширение и размер), ключи хранилища, presigned URL и поля политики
- Docs: yes — обязательный docs-checkpoint в конце (`docs/architecture.md`, `docs/configuration.md`, `AGENTS.md`, `.ai-factory/DESCRIPTION.md`, `.ai-factory/ARCHITECTURE.md`)

## Roadmap Linkage

Milestone: "Проектная документация"
Rationale: План реализует этот этап. Формулировку этапа в `ROADMAP.md` («редактор Tiptap») нужно поправить на Markdown через `/aif-roadmap` после реализации.

## Требования (из запроса)

1. **Своё хранилище файлов у каждого пространства.** Файлы и заметки пространства изолированы от других пространств (данные, ключи хранилища, доступ, квота).
2. **Простые текстовые документы** с простой разметкой (Markdown), которая корректно отображается.
3. **Просмотр файлов** прямо в приложении: изображения, а также другие типы, которые можно просто посмотреть (PDF, текст и код, CSV, JSON, аудио и видео). Остальное — карточка с метаданными и скачивание.
4. **Папки и подпапки** (дерево произвольной вложенности с ограничением глубины) и **теги**.
5. **Ссылки на документы из задач** (документ привязан к нескольким задачам, задача — к нескольким документам) и **отдельный раздел** «Документы», где документы смотрят без задач.

## Ключевые решения

- **Новый модуль `documents`** (`src/modules/documents/`, слои как у остальных: `models/`, `slices/`, `index.ts`, `client.ts`). Срезы: `folder`, `document` (заметки и файлы), `file` (загрузка и отдача файлов), `tag`, `task-link`, `views` (обзор папки, поиск, дерево).
  - Зависимости: `documents → tasks` (поиск задач для привязки, номер и название задачи). Доступ и права — через `shared/access`. `tasks` о документах **не знает**: раздел «Документы» в панели задачи собирает компонент слоя UI, который вызывает `@/modules/documents`. Циклов нет.
- **Один тип сущности `Document` с `kind`**: `note` (Markdown, текст в БД) и `file` (объект в S3). Общие папки, теги, поиск и привязки к задачам работают одинаково для обоих видов.
- **Заметка хранится в БД** (`Document.content text`, до 200 000 символов). Так проще поиск, правка и защита от одновременной правки. Оптимистичная блокировка — поле `version Int`: сохранение идёт с `where: { id, version }`, при несовпадении — `ConflictError` («Документ изменили, пока вы его редактировали») с предложением перезагрузить. Скачать заметку можно как `.md`.
- **Файлы — по пути вложений.** Ключ `ws/<workspaceId>/docs/<documentId>` в том же бакете (префикс пространства — то самое «своё хранилище»). Браузер загружает файл по presigned POST (политика фиксирует ключ, тип и размер), сервер подтверждает через `headObject` и проверку сигнатуры (`readObjectPrefix`) для картинок и PDF. Тип определяется по расширению из allowlist, MIME от браузера не используется. Неподтверждённые загрузки старше 24 ч удаляются лениво при следующем запросе слота (как в `attachment.service.ts`).
- **Квота пространства.** `DOCUMENTS_WORKSPACE_QUOTA_MB` (по умолчанию 1024) в `src/shared/env`. Сумма `size` файлов пространства в статусах `pending` и `ready` проверяется при выдаче слота в транзакции с `pg_advisory_xact_lock(hashtext(workspaceId))`, чтобы параллельные загрузки не превысили квоту. Использование показывается в разделе «Документы». Лимит одного файла — `DOCUMENT_FILE_MAX_SIZE = 50 МБ`.
- **Просмотр по типу** (каталог типов — модель `document-type.ts`, по образцу `task-attachment.ts`):
  - `image` (png, jpg, jpeg, gif, webp) — `<img>` по `GET /api/documents/[id]/file?inline=1`, режимы «Вписать» и «100%»;
  - `pdf` — `<iframe>` со ссылкой `inline` (встроенный просмотрщик браузера) и кнопка «Открыть в новой вкладке» на случай, если хранилище запрещает встраивание;
  - `text` (txt, log, md, csv, tsv, json, xml, yaml, yml, а также код: ts, tsx, js, jsx, py, go, java, sql, sh, css, html) — сервер читает до 1 МБ (`readObjectText`) и отдаёт в просмотрщик: `md` — тот же рендер Markdown, что у заметок; `csv/tsv` — таблица (первые 500 строк); `json` — форматированный вывод; остальное — `<pre>` с номерами строк. HTML и XML показываются **только как исходный текст**, никогда не рендерятся;
  - `audio` (mp3, ogg, wav, m4a) и `video` (mp4, webm) — нативные `<audio>`/`<video controls>`. Для медиа срок presigned GET — 1 ч (перемотка повторяет Range-запросы к той же ссылке), для остального — 60 с, как у вложений;
  - SVG, офисные форматы и архивы — без предпросмотра: карточка (имя, тип, размер, автор, даты) и «Скачать». SVG не открывается inline: может содержать скрипты.
- **Безопасный Markdown**: `react-markdown` + `remark-gfm` (таблицы, чек-листы, зачёркивание, автоссылки). Сырой HTML не рендерится (`rehype-raw` не подключаем, `skipHtml`), `urlTransform` пропускает только `http(s):`, `mailto:` и относительные адреса. Картинки в заметке показываются, только если адрес относительный и ведёт на `/api/documents/` или `/api/attachments/` — внешние картинки выводятся ссылкой (нет трекинга и подмены). Внешние ссылки — `target="_blank" rel="noopener noreferrer nofollow"`. Заголовки получают `id` для якорей. Установить через `pnpm add react-markdown remark-gfm` и сверить версии с `package.json` перед установкой.
- **Редактор заметки** — `Textarea` + панель кнопок (жирный, курсив, заголовок, список, чек-лист, цитата, код, ссылка, таблица, ссылка на документ) и вкладки «Редактор / Просмотр»; на широких экранах — режим «Рядом». Форматирование — чистая функция `applyMarkdownFormat(text, selection, action)` в `documents/models` с тестами. Сохранение кнопкой и `Ctrl/Cmd+S`, предупреждение о несохранённых изменениях (`beforeunload`).
- **Папки**: `DocumentFolder` с `parentId` (корень пространства — `parentId = null`), максимальная глубина 8. Имена уникальны в пределах родителя без учёта регистра (`nameKey = lower(trim(name))`, уникальность `(workspaceId, parentId, nameKey)` с `NULLS NOT DISTINCT` — Postgres 17, задаётся в SQL миграции вручную, Prisma так не умеет). Перемещение папки в собственного потомка запрещено (модель проверяет цепочку предков цели, её сервис читает рекурсивным CTE). Удаление непустой папки — с подтверждением: каскадом удаляются подпапки и документы. Ключи файлов сервис собирает рекурсивным CTE до удаления строк, объекты удаляет после коммита (`deleteObjects`; сбой — ERROR, строки уже удалены).
- **Теги** — справочник пространства `DocumentTag` (имя до 32 символов, уникально без учёта регистра, цвет из своей палитры `DOCUMENT_TAG_COLORS` в `documents/models/document-tag.ts` по образцу палитры статусов: модели не импортируют чужие модули). У документа до 10 тегов. Фильтр по тегу работает по всем папкам.
- **Права**: новое право пространства `manageDocuments` (флаг `WorkspaceMember.canManageDocuments`, объявлен в плагине `organization` с `input: false`, как `canManageProjects`). Владелец имеет его всегда.
  - Все участники: просмотр папок, документов, файлов, тегов; привязка и отвязка документов к задачам (это правка задачи, её может любой участник).
  - С правом `manageDocuments`: создание, переименование, перемещение и удаление папок и документов, правка заметок, загрузка файлов, управление тегами и тегами документов.
  - Сервисы проверяют через `requireWorkspacePermission(session, workspaceId, 'manageDocuments')`, страницы скрывают кнопки по `access.permissions.manageDocuments`.
- **Связь с задачами** — `TaskDocumentLink(taskId, documentId, workspaceId)` с составными FK `(taskId, workspaceId)` и `(documentId, workspaceId)`: связь не может соединить разные пространства. Таблица принадлежит модулю `documents` (FK на `Task` с `onDelete: Cascade` — удаление задачи снимает связи без участия `documents`). В задаче — раздел «Документы» (список, «Привязать документ» — поиск в Popover, «Отвязать»). В документе — блок «Задачи» (список со ссылками в панель задачи, «Привязать к задаче» — поиск по номеру и названию через `listTasks` из `tasks`). Лимит — 50 связей на задачу.
- **Адреса**:
  - `/w/[workspaceSlug]/docs` — обзор: дерево папок слева (на мобильных — выпадающее), хлебные крошки, подпапки и документы текущей папки, поиск по названию (`q`), фильтры по тегу (`tag`) и виду (`kind: note|file|image|pdf|text|media`), сортировка. Состояние в URL (`folder`, `q`, `tag`, `kind`, `sort`, `page`) — по образцу `task-list-query.ts`. При `q` или `tag` поиск идёт по всему пространству, в строке видна папка документа.
  - `/w/[workspaceSlug]/docs/new?folder=<id>` — новая заметка.
  - `/w/[workspaceSlug]/docs/[documentId]` — просмотр документа (заметка или файл), свойства (папка, теги, автор, даты, размер), блок «Задачи».
  - `/w/[workspaceSlug]/docs/[documentId]/edit` — редактор заметки.
  - `GET /api/documents/[documentId]/file` — для файла: проверка доступа и 302 на presigned GET (`?inline=1` — только для типов с просмотром, `?download=1` — всегда `attachment`); для заметки — сам Markdown с `Content-Disposition: attachment; filename="<title>.md"`. Без сессии и без доступа — 404.
  - Ссылка на документ из заметки или описания: обычный адрес `/w/<slug>/docs/<id>`; кнопка «Ссылка на документ» в редакторе вставляет `[Название](/w/<slug>/docs/<id>)`.
- **Раздел в навигации** — «Документы» в `getWorkspaceSections` между «Задачи» и «Участники».
- **Вне объёма плана:** сохранение вложения задачи в документы, корзина и история версий заметок, полнотекстовый поиск по содержимому, rich-text описание задачи.
- **Связанный незавершённый план.** `.ai-factory/plans/user-profiles-and-notifications.md` реализован частично (Tasks 5–13 не закрыты) и тоже меняет `members-table.tsx` и `member.service.ts`. Начинать этот план лучше после него или учитывать его изменения в Task 2 (обобщённый переключатель прав).

## Commit Plan

- **Commit 1** (после задач 1–3): `feat(documents): schema, manageDocuments permission and domain models`
- **Commit 2** (после задач 4–7): `feat(documents): folders, notes, file storage and tags services`
- **Commit 3** (после задач 8–9): `feat(documents): task links and browse queries`
- **Commit 4** (после задач 10–13): `feat(documents): documents section, markdown viewer and editor, file viewers`
- **Commit 5** (после задачи 14): `feat(tasks): link documents from task panel`
- **Commit 6** (после задачи 15): `docs: workspace documents`

## Tasks

### Фаза 1. Данные, права и модели

- [x] **Task 1: Схема Prisma и миграция документов**
  - Файлы: `prisma/schema.prisma`, `prisma/migrations/<ts>_add_documents/migration.sql`.
  - Модели (новый раздел схемы `// ── Документы ──` с комментарием о ключах хранилища и составных FK, в стиле раздела вложений):
    - `enum DocumentKind { note file }`, `enum DocumentFileStatus { pending ready }`.
    - `DocumentFolder`: `id uuid(7)`, `workspaceId`, `parentId String? @db.Uuid`, `name`, `nameKey`, `createdById String?` (SetNull), `createdAt`, `updatedAt`. FK `workspace` Cascade; самоссылка `parent` по `(parentId, workspaceId) → (id, workspaceId)` с `onDelete: Cascade`; `@@unique([id, workspaceId])`, `@@index([workspaceId, parentId])`.
    - `Document`: `id uuid(7)`, `workspaceId`, `folderId String? @db.Uuid` (FK `(folderId, workspaceId)` на папку, Cascade), `kind`, `title`, `titleKey` (для поиска и сортировки), `content String?` (заметка), `version Int @default(1)`, поля файла `fileName String?`, `extension String?`, `contentType String?`, `size Int?`, `storageKey String? @unique`, `status DocumentFileStatus?` (для заметки `null`), `uploadedAt DateTime?`; `createdById`, `updatedById` (SetNull), `createdAt`, `updatedAt`. `@@unique([id, workspaceId])`, индексы `@@index([workspaceId, folderId, titleKey])`, `@@index([workspaceId, updatedAt])`, `@@index([workspaceId, kind, status])`, `@@index([createdById, status, createdAt])` (очистка зависших загрузок).
    - `DocumentTag`: `id uuid(7)`, `workspaceId`, `name`, `nameKey`, `color`, `createdAt`; `@@unique([workspaceId, nameKey])`, `@@unique([id, workspaceId])`.
    - `DocumentTagAssignment`: `documentId`, `tagId`, `workspaceId`; `@@id([documentId, tagId])`; FK `(documentId, workspaceId)` и `(tagId, workspaceId)` с Cascade; `@@index([tagId])`.
    - `TaskDocumentLink`: `taskId`, `documentId`, `workspaceId`, `createdById String?` (SetNull), `createdAt`; `@@id([taskId, documentId])`; FK `(taskId, workspaceId) → Task(id, workspaceId)` и `(documentId, workspaceId) → Document` с Cascade; `@@index([documentId])`.
    - `WorkspaceMember.canManageDocuments Boolean @default(false)` с комментарием, как у `canManageProjects`.
  - Обратные связи в `Workspace`, `Task` (`documentLinks`), `User` (создатели, авторы правок).
  - В SQL миграции вручную: уникальный индекс `DocumentFolder (workspaceId, parentId, nameKey) NULLS NOT DISTINCT` (вместо `@@unique` Prisma; рядом комментарий почему), `CHECK`-ограничения: для `kind = 'note'` поля файла `NULL`, для `kind = 'file'` заполнены `storageKey`, `contentType`, `size`, `status` и `content IS NULL`.
  - В `src/shared/auth/auth.ts` объявить поле участника `canManageDocuments` (`input: false`) рядом с `canManageProjects`.
  - Логирование: не требуется (схема). Проверка: `pnpm db:migrate` на чистой базе, `pnpm typecheck`.

- [x] **Task 2: Право `manageDocuments` в слое доступа и в участниках** (зависит от Task 1)
  - Файлы: `src/shared/access/workspace-role.ts` (+ тест), `src/shared/access/workspace-access.ts` (select `canManageDocuments` в `findMembership` и `findWorkspaceBySlug`, сообщение «Недостаточно прав для управления документами» в `PERMISSION_DENIED_MESSAGES`), `src/shared/access/workspace-access.test.ts`.
  - `WORKSPACE_PERMISSIONS = ['manageProjects', 'manageDocuments']`, `WorkspacePermissionFlags` и `resolveWorkspacePermissions` — с новым флагом; владельцу — оба права.
  - Модуль `workspaces`: `member.repository.ts` (чтение флага, `setPermission` пишет нужную колонку по имени права — маппинг `permission → column` в одном месте), `member.dto.ts`, `member.service.ts` (`getMember`, `listMembers`), `member.schema.ts` уже берёт `WORKSPACE_PERMISSIONS` — проверить тесты `member.schema.test.ts` и `member.service.test.ts`, добавить кейсы для `manageDocuments`.
  - `src/components/workspaces/members-table.tsx`: столбец «Документы» с тем же переключателем, что «Проекты» (вынести переключатель в общий компонент `MemberPermissionToggle` с пропсом `permission` и подписями).
  - Обновить моки прав в существующих тестах сервисов (`project.service.test.ts`, `status.service.test.ts`, тесты `tasks`), где `permissions` задаётся литералом.
  - Логирование: в `member.service.setMemberPermission` уже есть INFO — убедиться, что в лог попадает `permission`; WARN в `requireWorkspacePermission` уже логирует право.

- [x] **Task 3: Доменные модели модуля `documents`** (зависит от Task 1)
  - Файлы: `src/modules/documents/models/{document-type.ts,document-folder.ts,document.ts,document-tag.ts,markdown-format.ts,csv.ts,document-list-query.ts,index.ts}` и тесты `*.test.ts` рядом.
  - `document-type.ts`: allowlist расширений → `{ contentType, kind: 'image'|'pdf'|'text'|'audio'|'video'|'document'|'spreadsheet'|'presentation'|'archive', viewer: 'image'|'pdf'|'markdown'|'csv'|'json'|'code'|'audio'|'video'|null, signature?: 'png'|'jpeg'|'gif'|'webp'|'pdf' }`; `documentTypeOf(fileName)`, `isPreviewable`, `DOCUMENT_FILE_MAX_SIZE`, `DOCUMENT_TEXT_PREVIEW_MAX_BYTES = 1 МБ`, `DOCUMENT_UPLOAD_TTL_SECONDS`, `DOCUMENT_DOWNLOAD_TTL_SECONDS = 60`, `DOCUMENT_MEDIA_TTL_SECONDS = 3600`, `DOCUMENT_STALE_AFTER_MS`, `matchesSignature(bytes, signature)`, `documentStorageKey(workspaceId, documentId)` и `parseDocumentStorageKey`. Санитизация имени файла — по образцу `task-attachment.ts` (вынести общий код не требуется; дублирование допустимо между модулями, т.к. `tasks/models` извне не импортируется).
  - `document-folder.ts`: `normalizeFolderName` (trim, схлопывание пробелов, запрет `/ \ : * ? " < > |` и управляющих символов, 1–100 символов), `nameKey`, `FOLDER_MAX_DEPTH = 8`, `assertCanMove(folderId, targetAncestorIds, targetDepth, subtreeHeight)` — нельзя в себя, в потомка и глубже лимита.
  - `document.ts`: правила заголовка (1–200), `NOTE_CONTENT_MAX_LENGTH = 200_000`, `assertVersion(expected, actual)` → `ConflictError` (добавить класс в `src/shared/errors`, если его нет, с кодом `CONFLICT`), `DOCUMENT_TAGS_LIMIT = 10`, `TASK_DOCUMENT_LINKS_LIMIT = 50`, проверка квоты `assertQuota(usedBytes, incomingBytes, quotaBytes)`.
  - `document-tag.ts`: `normalizeTagName` (1–32), `nameKey`, палитра `DOCUMENT_TAG_COLORS`.
  - `markdown-format.ts`: `applyMarkdownFormat(text, { start, end }, action)` → `{ text, selection }` для действий `bold | italic | strike | heading | bulletList | orderedList | checklist | quote | code | codeBlock | link | table | documentLink(title, href)`; переключение (повторное нажатие снимает форматирование), работа с несколькими строками.
  - `csv.ts`: `parseDelimited(text, delimiter, maxRows)` по RFC 4180 (кавычки, экранирование `""`, переводы строк внутри кавычек, CRLF), возвращает `{ rows, truncated }`.
  - `document-list-query.ts`: запрос обзора (`folder`, `q`, `tag`, `kind`, `sort: name|updated|created`, `dir`, `page`), `parseDocumentListParams(searchParams)` и `toDocumentListSearchParams` — по образцу `tasks/models/task-list-query.ts`.
  - Тесты: allowlist и сигнатуры, санитизация имён, нормализация и уникальность ключей, перемещение папок (в себя, в потомка, превышение глубины), конфликт версий, квота, все действия `applyMarkdownFormat` (включая снятие), разбор CSV (кавычки, CRLF, усечение), разбор и сериализация параметров списка.
  - Логирование: модели чистые, не логируют.

### Фаза 2. Сервисы модуля `documents`

- [x] **Task 4: Хранилище: чтение текста и проверка ограничений** (зависит от Task 3)
  - Файлы: `src/shared/storage/objects.ts`, `src/shared/storage/index.ts`, `src/shared/env/index.ts` (+ тест схемы env, если есть), `.env.example`, `deploy/tasker/.env.example`.
  - Добавить `readObjectText(key, maxBytes): Promise<{ text: string; truncated: boolean }>` — `GetObject` с `Range: bytes=0-maxBytes`, декодирование UTF-8 (`TextDecoder` с `fatal: false`), `truncated`, если размер объекта больше лимита. Обобщить `createDownloadUrl` не требуется: он уже принимает `expiresIn`.
  - `DOCUMENTS_WORKSPACE_QUOTA_MB` (`z.coerce.number().int().positive().default(1024)`).
  - Логирование: DEBUG `[storage] read object text` (`key` не логировать — только длина и `truncated`), ERROR `[storage] read object text failed` (`err`).

- [x] **Task 5: Срез `folder` — папки** (зависит от Task 2, Task 3)
  - Файлы: `src/modules/documents/slices/folder/{folder.repository.ts,folder.service.ts,folder.actions.ts,folder.schema.ts,folder.dto.ts,folder.service.test.ts,folder.schema.test.ts}`.
  - Сервис:
    - `listFolderTree(session, workspaceId)` — все папки пространства плоским списком `{ id, parentId, name, documentsCount }` (одним запросом, дерево строит UI); `getFolderPath(session, workspaceId, folderId)` — цепочка предков для хлебных крошек (рекурсивный CTE через `prisma.$queryRaw` с фильтром по `workspaceId`);
    - `createFolder`, `renameFolder`, `moveFolder` (цепочка предков цели и высота поддерева через CTE, `assertCanMove`), `deleteFolder` (сбор ключей файлов поддерева CTE → удаление строк → `deleteObjects` после транзакции, возвращает число удалённых документов) — все через `requireWorkspacePermission(…, 'manageDocuments')`;
    - уникальное имя — по `isUniqueViolation` → `ValidationError` с ошибкой поля «Папка с таким именем уже есть».
  - Каждая папка, загруженная по `id`, проверяется на `workspaceId` (IDOR).
  - Actions возвращают `FormState`/`ActionResult`, делают `revalidatePath('/w/[workspaceSlug]/docs', 'layout')`.
  - Тесты: доступ (участник без права — FORBIDDEN, чужое пространство — NOT_FOUND), дубликат имени, перемещение в потомка, удаление с файлами (объекты удаляются после строк, сбой хранилища не пробрасывается).
  - Логирование: `createLogger('documents')`. DEBUG `[folder.tree]` (`workspaceId`, `count`); INFO `[folder] created|renamed|moved|deleted` (`workspaceId`, `folderId`, `parentId`, `documentsDeleted`, `objectsFailed`); WARN — дубликат имени, недопустимое перемещение.

- [x] **Task 6: Срез `document` — заметки и общие операции над документами** (зависит от Task 5)
  - Файлы: `src/modules/documents/slices/document/{document.repository.ts,document.service.ts,document.actions.ts,document.schema.ts,document.dto.ts,document.mapper.ts,document.select.ts}` + тесты сервиса и схем.
  - Сервис:
    - `getDocument(session, workspaceId, documentId)` → `DocumentDto` (вид, название, папка, теги, автор и редактор (`TaskUserDto`-подобный DTO: `id`, `name`, `image`), даты, `version`, для заметки — `content`, для файла — `fileName`, `extension`, `size`, `viewer`, `previewable`). Файл в статусе `pending` — `NotFoundError`;
    - `createNote(session, { workspaceId, folderId, title, content })`, `updateNote(session, { documentId, title, content, version })` (`assertVersion`, `updatedById`, `version + 1` атомарно `updateMany where {id, workspaceId, version}`; 0 строк → `ConflictError`);
    - `renameDocument`, `moveDocument(folderId | null)`, `deleteDocument` (строка, затем объект для файла);
    - все изменения — `requireWorkspacePermission(…, 'manageDocuments')`, чтение — `requireWorkspaceAccess`.
  - Actions: `createNoteAction` (redirect на страницу документа), `updateNoteAction` (возвращает новую `version`), `renameDocumentAction`, `moveDocumentAction`, `deleteDocumentAction`; `revalidatePath` раздела документов и страницы документа.
  - Тесты: конфликт версий, лимит размера заметки, перемещение в папку другого пространства (NOT_FOUND), права, удаление файла удаляет объект.
  - Логирование: DEBUG `[document.get]` (`workspaceId`, `documentId`, `kind`); INFO `[document] note created|note updated|renamed|moved|deleted` (`workspaceId`, `documentId`, `version`, длина контента — без самого текста); WARN `[document] version conflict` (`documentId`, `expected`, `actual`).

- [x] **Task 7: Срезы `file` и `tag` — загрузка, отдача файлов и теги** (зависит от Task 4, Task 6)
  - Файлы: `src/modules/documents/slices/file/{file.service.ts,file.actions.ts,file.schema.ts,file.storage.ts}` + тесты; `src/modules/documents/slices/tag/{tag.repository.ts,tag.service.ts,tag.actions.ts,tag.schema.ts,tag.dto.ts}` + тесты.
  - `file`:
    - `requestDocumentUpload(session, { workspaceId, folderId, fileName, size })` — право, тип из allowlist, лимит размера, ленивое удаление зависших загрузок пользователя, в транзакции с `pg_advisory_xact_lock` проверка квоты (`sum(size)` по `pending`+`ready`), создание строки `pending` и presigned POST. Ответ: `{ documentId, upload }`;
    - `completeDocumentUpload(session, documentId)` — `headObject` (размер совпадает), сигнатура для типов с `signature`, перевод в `ready`; несоответствие — удалить объект и строку, `ValidationError`;
    - `cancelDocumentUpload(session, documentId)`;
    - `getDocumentFileDownload(session, documentId, { mode: 'inline' | 'download' })` — `inline` только для `previewable`, TTL — медиа 1 ч, остальное 60 с; `Content-Disposition` через общий хелпер (санитизированное имя, `filename*` UTF-8);
    - `getDocumentText(session, documentId)` — для `viewer` из `markdown|csv|json|code`: `readObjectText` до 1 МБ → `{ text, truncated }`;
    - `getNoteMarkdownExport(session, documentId)` — `{ fileName: '<title>.md', content }`;
    - `getWorkspaceStorageUsage(session, workspaceId)` — `{ usedBytes, quotaBytes, filesCount }`.
  - `tag`: `listTags(session, workspaceId)` (с числом документов), `createTag`, `updateTag` (имя, цвет), `deleteTag`, `setDocumentTags(session, { documentId, tagIds })` (лимит 10, все теги из того же пространства, иначе `NotFoundError`). Изменения — с правом `manageDocuments`.
  - Тесты: квота (в т.ч. ровно на границе), неверная сигнатура, чужой ключ, `inline` для непросматриваемого типа даёт `attachment`, TTL медиа, усечение текста, дубликат тега, чужой тег в `setDocumentTags`.
  - Логирование: INFO `[document.file] upload requested|completed|canceled` (`workspaceId`, `documentId`, `extension`, `size`), `[tag] created|updated|deleted|assigned` (`workspaceId`, `tagId`, `documentId`, `count`); WARN `[document.file] quota exceeded` (`workspaceId`, `usedBytes`, `size`, `quotaBytes`), `[document.file] signature mismatch`, `[document.file] size mismatch`; ERROR — сбой удаления объекта; DEBUG — выдача ссылки (`documentId`, `mode`, `ttl`), чтение текста (`documentId`, `truncated`).

### Фаза 3. Связь с задачами и запросы обзора

- [x] **Task 8: Срез `task-link` — привязка документов к задачам** (зависит от Task 6)
  - Файлы: `src/modules/documents/slices/task-link/{task-link.repository.ts,task-link.service.ts,task-link.actions.ts,task-link.schema.ts,task-link.dto.ts}` + тесты.
  - В `tasks` (если нет подходящего): экспортировать из `tasks/index.ts` read-функцию `getTaskSummaries(session, workspaceId, taskIds)` → `{ id, number, title, isDone }[]` (с `requireWorkspaceAccess`, фильтр по `workspaceId`) и использовать существующий `listTasks` с `q` для поиска. Тест в `tasks`.
  - Сервис `documents`:
    - `listTaskDocuments(session, workspaceId, taskId)` → документы задачи (`id`, `title`, `kind`, `viewer`, путь папки строкой, теги);
    - `listDocumentTasks(session, workspaceId, documentId)` → задачи документа через `getTaskSummaries`;
    - `linkDocumentToTask(session, { workspaceId, taskId, documentId })` — оба объекта в пространстве (`requireWorkspaceAccess`), лимит 50, повторная привязка идемпотентна; `unlinkDocumentFromTask`;
    - `searchDocumentsForLink(session, workspaceId, q)` — до 20 документов по названию (исключая уже привязанные к задаче, если передан `taskId`);
    - `searchTasksForLink(session, workspaceId, q, documentId)` — до 20 задач через `listTasks` (`q` поддерживает `#42`).
  - Actions для клиентских пикеров: `searchDocumentsForLinkAction`, `searchTasksForLinkAction`, `linkDocumentToTaskAction`, `unlinkDocumentFromTaskAction` (`ActionResult`), `revalidatePath` страницы задачи, панели и страницы документа.
  - Тесты: задача или документ из чужого пространства (NOT_FOUND), лимит, идемпотентность, отвязка несуществующей связи (без ошибки, `ok`).
  - Логирование: INFO `[taskLink] linked|unlinked` (`workspaceId`, `taskId`, `documentId`, `userId`); WARN — превышение лимита, чужие объекты; DEBUG — поиск (`workspaceId`, длина `q`, `count`).

- [x] **Task 9: Срез `views` и публичный API модуля** (зависит от Task 5, Task 6, Task 7, Task 8)
  - Файлы: `src/modules/documents/slices/views/{views.queries.ts,views.repository.ts,views.dto.ts,documents-list.prisma.ts}` + тесты; `src/modules/documents/index.ts`, `src/modules/documents/client.ts`.
  - `listDocuments(session, workspaceId, query: DocumentListQuery)` → `{ folders, documents, total, page, pageSize }`: без `q`/`tag` — подпапки и документы папки `folder`; с `q`/`tag`/`kind` — по всему пространству (с `folderPath` у каждого документа). `q` — `titleKey contains` (`mode: insensitive`), `kind` маппится на `Document.kind` + расширения через каталог типов. Пагинация по 50. Только `status = ready` или заметки.
  - `getDocumentsOverview(session, workspaceId)` — использование хранилища, последние изменённые документы (до 5) для пустого состояния корня.
  - `index.ts` — server-only API: read-функции и actions всех срезов, типы DTO. `client.ts` — actions, Zod-схемы, `applyMarkdownFormat`, `parseDelimited`, `documentTypeOf`, константы лимитов, `toDocumentListSearchParams`, типы. Ни один клиентский компонент не импортирует `@/modules/documents` (сервер).
  - Проверить, что ESLint-границы (`eslint.config.mjs`) покрывают новый модуль без правок; если правило перечисляет модули явно — добавить `documents` (`documents → tasks` разрешено, `tasks → documents` запрещено).
  - Логирование: DEBUG `[views.listDocuments]` (`workspaceId`, `folderId`, фильтры без `q`, `total`, `durationMs`).

### Фаза 4. Раздел «Документы»

- [x] **Task 10: Навигация, маршрут файла и каркас раздела** (зависит от Task 9)
  - `src/components/layout/nav-items.ts` (+ `nav-items.test.ts`): раздел «Документы» (`/w/<slug>/docs`, активен на `docs` и вложенных).
  - Route Handler `src/app/api/documents/[documentId]/file/route.ts` по образцу `api/attachments/[attachmentId]/route.ts`: файл — 302 на presigned GET (`?inline=1`, `?download=1`), заметка — `200 text/markdown; charset=utf-8` с `Content-Disposition: attachment`. `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`. Без сессии и при `NotFoundError` — 404.
  - Добавить через shadcn CLI: `dialog`, `command`, `tabs`, `breadcrumb`, `checkbox`, `tooltip`, `scroll-area` (только недостающие; `components/ui` вручную не править).
  - `src/app/(app)/w/[workspaceSlug]/docs/layout.tsx`: `requireWorkspaceAccessBySlug`, двухколоночная раскладка (дерево папок `DocumentFolderTree` слева, `lg:` и выше; на мобильных — кнопка «Папки» с `Sheet`/`Dialog`), `PageContainer size="wide"`. `loading.tsx` со скелетоном списка.
  - Компоненты в `src/components/documents/`: `folder-tree.tsx` (клиентский: раскрытие веток, активная папка по URL, сохранение раскрытых веток в `localStorage` в try/catch, клавиатурная навигация `role="tree"`), `document-breadcrumbs.tsx`, `storage-usage.tsx` (полоса `Progress` «Использовано 120 МБ из 1 ГБ»).
  - Логирование: Route Handler — DEBUG `[api.documents.file]` (`documentId`, `mode`), WARN — отказ; остальное — без логов (UI).

- [x] **Task 11: Обзор папки: список, поиск, фильтры и действия** (зависит от Task 10)
  - Страница `src/app/(app)/w/[workspaceSlug]/docs/page.tsx`: `parseDocumentListParams(searchParams)`, `listDocuments`, `listTags`, путь папки; несуществующая папка — `notFound()`.
  - Компоненты в `src/components/documents/`:
    - `document-list.tsx` — строки подпапок и документов: иконка по виду (`document-icon.tsx`), название, теги-бейджи, папка (в режиме поиска), автор, изменён, размер; пустые состояния («Папка пуста», «Ничего не найдено»);
    - `document-list-toolbar.tsx` — поиск (debounce 300 мс, `router.replace`), фильтры по тегу и виду, сортировка; состояние в URL через `toDocumentListSearchParams`;
    - `new-document-menu.tsx` (при праве) — «Новая заметка», «Загрузить файлы», «Новая папка»;
    - `folder-dialogs.tsx` — создание, переименование, перемещение (выбор папки в дереве) и удаление папки (`ConfirmActionDialog` с числом документов);
    - `document-row-menu.tsx` — открыть, скачать, переименовать, переместить, теги, удалить;
    - `document-upload.tsx` — загрузка в текущую папку: зона перетаскивания и очередь по образцу `components/tasks/attachments/use-attachment-upload.ts` (переиспользовать общий код, если его можно вынести без зависимости от `tasks`; иначе — свой хук `use-document-upload.ts`), ошибки квоты и типа — в строке очереди;
    - `tag-manager-dialog.tsx` (при праве) — список тегов, создание, переименование, цвет, удаление.
  - Пагинация — `components/ui/pagination` как в списке задач.
  - Логирование: UI не логирует; ошибки actions — через toast и `FormError`.

- [x] **Task 12: Безопасный рендер Markdown и редактор заметки** (зависит от Task 10)
  - Зависимости: `pnpm add react-markdown remark-gfm` (проверить совместимость с React 19 в `package.json`).
  - `src/components/documents/markdown/markdown-view.tsx` — серверно-совместимый компонент: `react-markdown` + `remark-gfm`, `skipHtml`, `urlTransform` (только `http(s)`, `mailto`, относительные), компоненты для `a` (внешние — `_blank` + `rel`), `img` (только `/api/documents/` и `/api/attachments/`, иначе ссылка), `table` (обёртка с горизонтальной прокруткой), `input[type=checkbox]` (только чтение), `code`/`pre`, заголовки с `id`. Стили — классы Tailwind на элементах (без `@tailwindcss/typography`, если его нет в проекте; иначе использовать `prose`) с поддержкой тёмной темы.
  - Тест `markdown-view.test.ts` (рендер через `react-dom/server` `renderToStaticMarkup`): `<script>` и `onerror` не попадают в разметку, `javascript:` ссылка вычищается, внешняя картинка становится ссылкой, таблица и чек-лист рендерятся.
  - Страницы `docs/new/page.tsx` и `docs/[documentId]/edit/page.tsx` (заметка, право `manageDocuments`, иначе `notFound()`; файл — редирект на просмотр).
  - `src/components/documents/note-editor.tsx` (клиентский): название, панель форматирования (`applyMarkdownFormat`, подсказки с сочетаниями клавиш, `Ctrl/Cmd+B/I/K`), вкладки «Редактор / Просмотр / Рядом» (`tabs`), счётчик символов и лимит, `Ctrl/Cmd+S`, статус «Сохранено / Есть несохранённые изменения», `beforeunload`, обработка `CONFLICT` (диалог «Документ изменён другим пользователем: перезагрузить / скопировать мой текст»), выбор папки при создании. Кнопка «Ссылка на документ» — `Command`-поиск через `searchDocumentsForLinkAction`.
  - Логирование: UI не логирует.

- [x] **Task 13: Страница документа и просмотрщики файлов** (зависит от Task 11, Task 12)
  - Страница `src/app/(app)/w/[workspaceSlug]/docs/[documentId]/page.tsx`: `getDocument`, для текстовых просмотрщиков — `getDocumentText`, `listDocumentTasks`; `NotFoundError` → `notFound()`. Шапка: хлебные крошки папки, название, теги, действия (Редактировать — для заметки, Скачать, Переименовать, Переместить, Теги, Удалить — по праву), свойства (вид, размер, автор, изменил, даты).
  - Просмотрщики в `src/components/documents/viewers/`:
    - `image-viewer.tsx` — «Вписать / 100%», клик открывает оригинал в новой вкладке;
    - `pdf-viewer.tsx` — `<iframe title=…>` высотой экрана и «Открыть в новой вкладке»;
    - `text-viewer.tsx` — `<pre>` с номерами строк и переносом по кнопке; `json-viewer.tsx` (форматирование `JSON.stringify(…, null, 2)`, при ошибке разбора — как текст); `csv-viewer.tsx` (`parseDelimited`, `Table`, sticky-заголовок, «Показаны первые 500 строк»); Markdown-файлы — `MarkdownView`;
    - `media-viewer.tsx` — `<audio>`/`<video controls preload="metadata">`;
    - `file-fallback.tsx` — карточка без предпросмотра и «Скачать»;
    - баннер «Показан первый 1 МБ файла» при `truncated`.
  - Блок «Задачи» `document-tasks.tsx`: список связанных задач (номер, название, отметка «готово»), ссылки открывают панель задачи (`task-panel-href.ts`), «Привязать к задаче» — `Command` с `searchTasksForLinkAction`, «Отвязать».
  - Тест чистой функции выбора просмотрщика, если логика выбора вынесена (`pickViewer(dto)`), в `src/components/documents/viewers/pick-viewer.test.ts`.
  - Логирование: UI не логирует.

### Фаза 5. Документы в задаче

- [x] **Task 14: Раздел «Документы» в панели и на странице задачи** (зависит от Task 9, Task 13)
  - `src/components/tasks/task-panel/task-details-view.tsx`: новый раздел «Документы» между «Вложения» и «Комментарии», в `<Suspense>` со скелетоном; данные — `listTaskDocuments` (вызывается в серверном компоненте слоя UI, модуль `tasks` не меняется).
  - Компоненты в `src/components/documents/task-documents/`: `task-documents-section.tsx` (серверный), `task-document-item.tsx` (иконка, название, путь папки, теги; клик — страница документа; для картинок — миниатюра через `?inline=1`), `link-document-picker.tsx` (клиентский: `Popover` + `Command`, поиск через `searchDocumentsForLinkAction`, исключая уже привязанные; при праве `manageDocuments` — пункт «Создать заметку и привязать», ведёт на `/docs/new?folder=&linkTask=<taskId>`).
  - `docs/new`: параметр `linkTask` — после создания заметка привязывается к задаче (проверка доступа в сервисе `createNote` через `linkDocumentToTask`), редирект обратно в задачу.
  - То же на отдельной странице `/w/[workspaceSlug]/tasks/[taskNumber]` (она использует общий `TaskDetailsView`, проверить).
  - Логирование: UI не логирует; INFO о привязке пишет сервис `task-link`.

### Фаза 6. Документация

- [x] **Task 15: Документация и AI-контекст** (зависит от Task 1–14)
  - `docs/architecture.md`: раздел «Документы» — модель (папки, документы `note`/`file`, теги, связи), ключи хранилища и квота, просмотрщики и безопасность Markdown, право `manageDocuments`, адреса и `GET /api/documents/[id]/file`, зависимость `documents → tasks`.
  - `docs/configuration.md`: `DOCUMENTS_WORKSPACE_QUOTA_MB`, лимиты файлов, CORS хранилища (тот же `MINIO_API_CORS_ALLOW_ORIGIN`) и замечание про встраивание PDF (`X-Frame-Options` хранилища).
  - `AGENTS.md`: модуль `documents`, `src/components/documents/`, маршруты `/w/[workspaceSlug]/docs`, `api/documents`, модели схемы.
  - `.ai-factory/DESCRIPTION.md` и `.ai-factory/ARCHITECTURE.md`: заменить «Tiptap / JSONB» на Markdown в `Document.content`, обновить структуру модуля `documents` и адрес `docs/[[...docPath]]` на фактические маршруты, правило зависимостей `documents → tasks`.
  - Логирование: не требуется.
