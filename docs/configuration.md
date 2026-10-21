[← Начало работы](getting-started.md) · [Back to README](../README.md) · [Архитектура →](architecture.md)

# Конфигурация

Переменные окружения читаются из `.env` (шаблон: `.env.example`). Next.js загружает `.env` сам, Prisma CLI — через `prisma.config.ts`, docker-compose — автоматически.

## Переменные приложения

Валидируются Zod-схемой в `src/shared/env/env.ts` при первом обращении, а не при импорте, поэтому `next build` работает без `.env`.

| Переменная | Обязательна | По умолчанию | Описание |
|------------|-------------|--------------|----------|
| `NODE_ENV` | нет | `development` | `development` / `test` / `production` |
| `LOG_LEVEL` | нет | `debug` (dev), `info` (production) | `trace` / `debug` / `info` / `warn` / `error` / `fatal` / `silent` |
| `DATABASE_URL` | да | — | `postgresql://user:pass@host:port/db?schema=public` |
| `S3_ENDPOINT` | да | — | URL S3 API, локально `http://localhost:9000` |
| `S3_REGION` | нет | `us-east-1` | Регион S3 (MinIO принимает любой) |
| `S3_ACCESS_KEY_ID` | да | — | Ключ доступа |
| `S3_SECRET_ACCESS_KEY` | да | — | Секретный ключ |
| `S3_BUCKET` | да | — | Бакет для вложений (мин. 3 символа) |
| `S3_FORCE_PATH_STYLE` | нет | `true` | Path-style адресация, нужна для MinIO |
| `S3_PUBLIC_ENDPOINT` | нет | `S3_ENDPOINT` | Адрес хранилища, который видит браузер. На него подписываются ссылки загрузки и скачивания вложений. Задайте, если сервер ходит в хранилище по внутреннему адресу (в Docker — `http://minio:9000`) |
| `DOCUMENTS_WORKSPACE_QUOTA_MB` | нет | `1024` | Квота файлового хранилища одного пространства (раздел «Документы»), МБ. Учитываются загруженные файлы и незавершённые загрузки; заметки и вложения задач в квоту не входят. Один файл — до 50 МБ. Это квота последнего уровня: см. ниже |
| `BETTER_AUTH_SECRET` | да | — | Секрет Better Auth для подписи cookie и токенов, минимум 32 символа. Сгенерировать: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | да | — | Публичный URL приложения, локально `http://localhost:3000` |
| `ADMIN_EMAILS` | нет | пусто | Email через запятую. Пользователь с таким email при регистрации получает глобальную роль `admin`. Регистр и пробелы не важны |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | нет | `true` | Обязательное подтверждение email: без него нельзя войти паролем и принять приглашение. `false` — регистрация сразу входит, письмо не отправляется (стенды без почты, e2e). С `true` нужен рабочий SMTP |
| `SMTP_HOST` | нет | `127.0.0.1` | SMTP-сервер для писем (приглашения, уведомления, подтверждение email, сброс пароля). Локально — Mailpit. Не используйте `localhost`: nodemailer резолвит имя сам, и на Windows/WSL это может зависать |
| `SMTP_PORT` | нет | `1025` | Порт SMTP |
| `SMTP_SECURE` | нет | `false` | TLS с самого начала соединения (обычно `true` для порта 465) |
| `SMTP_USER` / `SMTP_PASSWORD` | нет | — | Учётные данные SMTP. Используются, только если заданы обе; пустая строка — то же, что не задано. Пароль в логи не попадает |
| `MAIL_FROM` | нет | `Tasker <no-reply@tasker.local>` | Отправитель писем |

`ADMIN_EMAILS` действует только в момент регистрации: роль уже существующего пользователя не меняется. Эти адреса регистрируются всегда, даже если в настройках ресурса регистрация закрыта или ограничена доменами.

**Квота хранилища пространства** выбирается по приоритету: своя квота пространства (админка → «Пространства» → карточка) → «Квота по умолчанию» в настройках ресурса (`/admin/settings`) → `DOCUMENTS_WORKSPACE_QUOTA_MB`. Режим регистрации и разрешённые домены email задаются там же, в `/admin/settings`, а не переменными окружения. В production задайте свой `BETTER_AUTH_SECRET` — значение из `.env.example` годится только для локальной разработки.

`BETTER_AUTH_URL` также служит базой для ссылок в письмах аутентификации (подтверждение email, сброс пароля — через `/api/auth/*`), письмах-приглашениях (`<BETTER_AUTH_URL>/invite/<id>`) и в письмах-уведомлениях (ссылка на задачу и на `/profile/notifications`). Письма-уведомления отправляются после ответа пользователю (`after()`); сбой SMTP пишется в лог и уведомление в приложении не отменяет. У SMTP-транспорта короткие таймауты (DNS 5 с, соединение и приветствие 10 с, сокет 20 с). Если отправка не удалась, приглашение всё равно создаётся, и владелец видит ссылку. Письма аутентификации тоже уходят после ответа: сбой SMTP только логируется, пользователь может запросить письмо ещё раз.

**IP клиента для лимитов попыток** берётся из первого адреса `X-Forwarded-For` (см. [«Лимиты попыток»](architecture.md#лимиты-попыток)). Перед приложением должен стоять прокси, который перезаписывает этот заголовок (в продакшене — edge-Caddy). Если открыть приложение наружу напрямую, заголовок можно подделать и обойти лимиты по IP.

**Обновления в реальном времени** (SSE, `/api/realtime/*`) отдельных переменных не требуют: события идут через `LISTEN/NOTIFY` той же базы (`DATABASE_URL`, одно дополнительное подключение на процесс). Прокси перед приложением не должен сжимать и буферизовать этот путь — настройка Caddy в [«Реалтайм через Caddy»](production.md#реалтайм-через-caddy). Локально `pnpm dev` отдаёт поток напрямую.

Невалидное окружение даёт `EnvValidationError` со списком ключей. Значения в сообщение не попадают.

### GitHub App

Необязательная группа: либо заданы все шесть переменных, либо ни одной (пустая строка — то же, что не задано). Частичная настройка — `EnvValidationError` с недостающими ключами. Переменные не обязательны и для самой интеграции: GitHub App можно создать из админки (**Админка → Интеграции**), тогда ключи хранятся в БД зашифрованными. Если переменные заданы, они важнее записи из админки. Без того и другого интеграция, вход через GitHub и вебхук выключены. Как создать приложение — в [Интеграции с GitHub](github.md#создание-github-app).

| Переменная | Описание |
|------------|----------|
| `GITHUB_APP_ID` | App ID приложения (число) |
| `GITHUB_APP_SLUG` | Slug из адреса `github.com/apps/<slug>`: по нему строится ссылка установки |
| `GITHUB_APP_PRIVATE_KEY` | Приватный ключ `.pem` одной строкой: переводы строк заменены на `\n` (приложение разворачивает их обратно) |
| `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET` | OAuth приложения: вход через GitHub и токены пользователей |
| `GITHUB_WEBHOOK_SECRET` | Секрет вебхука, не короче 16 символов; должен совпадать с настройкой приложения |

`compose.app.yml` и `deploy/tasker/compose.yml` передают эти переменные в контейнер приложения (`${GITHUB_*:-}`, по умолчанию пусто).

### Напоминания о сроке

Напоминания рассылает `POST /api/cron/reminders`. Его вызывает планировщик: на сервере это systemd-таймер `tasker-reminders.timer` (см. [Продакшен](production.md#напоминания-о-сроке)), локально — `pnpm reminders:run`.

| Переменная | Обязательна | По умолчанию | Описание |
|------------|-------------|--------------|----------|
| `CRON_SECRET` | нет | — | Секрет планировщика, не короче 32 символов (`openssl rand -hex 32`). Передаётся как `Authorization: Bearer …`. Пусто или не задано — эндпоинты `/api/cron/*` отвечают `404`: напоминания не рассылаются, журнал действий не чистится |
| `REMINDERS_TIMEZONE` | нет | `Europe/Moscow` | Часовой пояс IANA: по нему считаются «сегодня» и «завтра» для сроков. Неизвестный пояс — `EnvValidationError` |

| `AUDIT_RETENTION_DAYS` | нет | `180` | Срок хранения журнала действий, дней (30–3650). Старые события удаляет `POST /api/cron/cleanup` (тот же `CRON_SECRET`): на сервере — таймер `tasker-cleanup.timer`, локально — `pnpm cleanup:run` |

`compose.app.yml` и `deploy/tasker/compose.yml` передают эти переменные в контейнер приложения.

Использование в коде (только на сервере):

```ts
import { env } from '@/shared/env';

env.S3_BUCKET; // типизировано
```

## Переменные docker-compose

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `tasker` / `tasker` / `tasker` | Учётка и БД Postgres |
| `POSTGRES_PORT` | `5433` | Порт на хосте. Не 5432, чтобы не конфликтовать с другими проектами |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | `tasker` / `tasker-secret` | Root-учётка MinIO. Локально это и есть `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` |
| `MINIO_API_PORT` / `MINIO_CONSOLE_PORT` | `9000` / `9001` | Порты MinIO |
| `MINIO_CORS_ALLOW_ORIGIN` | `http://localhost:3000,http://localhost:3001` | Origin-ы приложения, с которых MinIO принимает загрузку из браузера. Передаётся в `MINIO_API_CORS_ALLOW_ORIGIN`. Без этой переменной MinIO разрешает любой origin |
| `MAILPIT_SMTP_PORT` / `MAILPIT_UI_PORT` | `1025` / `8025` | Порты Mailpit. При смене SMTP-порта поменяйте и `SMTP_PORT` |

При смене `POSTGRES_PORT` поменяйте порт и в `DATABASE_URL`.

Переменные оверлея `compose.app.yml` (`APP_PORT`, `APP_URL`, `APP_MINIO_PORT`, `APP_LOG_LEVEL`, теги образов) описаны в разделе [Docker-образ и CI](deployment.md#переменные-composeappyml).

## Сервисы `compose.yml`

| Сервис | Образ | Назначение |
|--------|-------|------------|
| `postgres` | `postgres:18.6-alpine` | Основная БД (том `postgres18-data`) |
| `minio` | `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` | S3-совместимое хранилище |
| `minio-init` | `pgsty/mc` (закреплён по digest) | Создаёт приватный бакет и завершается |
| `mailpit` | `axllent/mailpit:v1.31.5` | SMTP-ловушка для писем, UI на порту 8025 |

## Хранилище для вложений и документов

Вложения задач, фото профилей и файлы раздела «Документы» лежат в одном бакете под разными префиксами (`ws/<workspaceId>/tasks/…`, `users/<userId>/avatar/…`, `ws/<workspaceId>/docs/…`). Браузер загружает файлы прямо в хранилище (presigned POST) и скачивает их оттуда же (presigned GET). Поэтому нужны два условия:

- **Адрес хранилища доступен браузеру.** Ссылки подписываются на `S3_PUBLIC_ENDPOINT`. Локально это `http://localhost:9000`, в контейнерном стеке — `http://localhost:9002`, в продакшене — домен приложения: бакет проксируется на том же адресе ([Продакшен](production.md#вложения-через-тот-же-домен)).
- **CORS разрешает origin приложения.** MinIO настраивается переменной `MINIO_API_CORS_ALLOW_ORIGIN` (в `compose.yml` — через `MINIO_CORS_ALLOW_ORIGIN`). Если запускаете dev-сервер на другом порту, добавьте его адрес в список. Для AWS S3 и других S3-совместимых сервисов задайте CORS-правило бакета:

```json
[
  {
    "AllowedOrigins": ["https://tasker.example.com"],
    "AllowedMethods": ["POST", "GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

Бакет остаётся приватным (`minio-init` выполняет `mc anonymous set none`): все ссылки подписанные и короткоживущие.

PDF в разделе «Документы» показывается во `<iframe>` по ссылке хранилища, поэтому хранилище и прокси перед ним не должны отдавать `X-Frame-Options: DENY` или `Content-Security-Policy: frame-ancestors 'none'` для бакета. MinIO и прод-конфиг Caddy (`deploy/tasker/tracker.caddy`) таких заголовков не ставят. Если встраивание всё же запрещено, на странице документа остаётся ссылка «Откройте его в новой вкладке».

> Официальные образы `minio/minio` больше не публикуются, поэтому используется сборка MinIO из исходников от Pigsty. Приложение работает с хранилищем только через S3 API, так что MinIO можно заменить любым S3-совместимым сервисом.

## Конфигурационные файлы

| Файл | Назначение |
|------|------------|
| `next.config.ts` | `output: 'standalone'` для Docker-образа, Cache Components, `serverExternalPackages` для pino, редирект `/w/:slug/projects/:projectId` → `/board` |
| `prisma.config.ts` | Путь к схеме, миграции, `DATABASE_URL` для Prisma CLI |
| `prisma/schema.prisma` | Схема БД (генератор `prisma-client` → `src/generated/prisma`). Модели Better Auth (`User`, `Session`, `Account`, `Verification`) пространств (`Workspace`, `WorkspaceMember`, `WorkspaceInvitation`), проектов (`Project`, `ProjectStatus`, enum `StatusCategory`), задач, сохранённых фильтров (`SavedTaskView`), профилей, уведомлений и документов (`DocumentFolder`, `Document`, `DocumentTag`, `DocumentTagAssignment`, `TaskDocumentLink`) |
| `src/shared/auth/auth.ts` | Настройки Better Auth: срок сессии (7 дней), длина пароля (8–128), плагины `admin` и `organization` (роли `owner`/`member`, приглашение действует 7 дней, до 50 пространств на пользователя, до 100 ожидающих приглашений на пространство, переименование моделей, поля участника `canManageProjects` и `canManageDocuments`) |
| `components.json` | Настройки shadcn/ui CLI |
| `eslint.config.mjs` / `.prettierrc` | Линтер и форматирование |
| `vitest.config.ts` | Тесты и тестовые переменные окружения |
| `pnpm-workspace.yaml` | Разрешённые build-скрипты зависимостей, `saveExact` |
| `Dockerfile` / `.dockerignore` | Образы `runner` (приложение) и `migrate` (миграции), см. [Docker-образ и CI](deployment.md) |
| `compose.app.yml` | Оверлей поверх `compose.yml`: сервисы `migrate` и `app` |
| `.github/workflows/ci.yml` | GitHub Actions: проверки, миграции, сборка образа и smoke-тест |

## See Also

- [Начало работы](getting-started.md): первый запуск
- [Логирование и ошибки](logging-and-errors.md): как работает `LOG_LEVEL`
- [Разработка](development.md): команды `infra:*` и `db:*`
- [Docker-образ и CI](deployment.md): запуск в контейнерах и GitHub Actions
- [Интеграция с GitHub](github.md): GitHub App и переменные `GITHUB_*`
