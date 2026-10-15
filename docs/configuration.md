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
| `BETTER_AUTH_SECRET` | да | — | Секрет Better Auth для подписи cookie и токенов, минимум 32 символа. Сгенерировать: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | да | — | Публичный URL приложения, локально `http://localhost:3000` |
| `ADMIN_EMAILS` | нет | пусто | Email через запятую. Пользователь с таким email при регистрации получает глобальную роль `admin`. Регистр и пробелы не важны |
| `SMTP_HOST` | нет | `127.0.0.1` | SMTP-сервер для писем (приглашения). Локально — Mailpit. Не используйте `localhost`: nodemailer резолвит имя сам, и на Windows/WSL это может зависать |
| `SMTP_PORT` | нет | `1025` | Порт SMTP |
| `SMTP_SECURE` | нет | `false` | TLS с самого начала соединения (обычно `true` для порта 465) |
| `SMTP_USER` / `SMTP_PASSWORD` | нет | — | Учётные данные SMTP. Используются, только если заданы обе. Пароль в логи не попадает |
| `MAIL_FROM` | нет | `Tasker <no-reply@tasker.local>` | Отправитель писем |

`ADMIN_EMAILS` действует только в момент регистрации: роль уже существующего пользователя не меняется. В production задайте свой `BETTER_AUTH_SECRET` — значение из `.env.example` годится только для локальной разработки.

`BETTER_AUTH_URL` также служит базой для ссылок в письмах-приглашениях (`<BETTER_AUTH_URL>/invite/<id>`). У SMTP-транспорта короткие таймауты (DNS 5 с, соединение и приветствие 10 с, сокет 20 с). Если отправка не удалась, приглашение всё равно создаётся, и владелец видит ссылку.

Невалидное окружение даёт `EnvValidationError` со списком ключей. Значения в сообщение не попадают.

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
| `MAILPIT_SMTP_PORT` / `MAILPIT_UI_PORT` | `1025` / `8025` | Порты Mailpit. При смене SMTP-порта поменяйте и `SMTP_PORT` |

При смене `POSTGRES_PORT` поменяйте порт и в `DATABASE_URL`.

## Сервисы `compose.yml`

| Сервис | Образ | Назначение |
|--------|-------|------------|
| `postgres` | `postgres:17-alpine` | Основная БД |
| `minio` | `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` | S3-совместимое хранилище |
| `minio-init` | `pgsty/mc` (закреплён по digest) | Создаёт приватный бакет и завершается |
| `mailpit` | `axllent/mailpit:v1.31.5` | SMTP-ловушка для писем, UI на порту 8025 |

> Официальные образы `minio/minio` больше не публикуются, поэтому используется сборка MinIO из исходников от Pigsty. Приложение работает с хранилищем только через S3 API, так что MinIO можно заменить любым S3-совместимым сервисом.

## Конфигурационные файлы

| Файл | Назначение |
|------|------------|
| `next.config.ts` | Cache Components, `serverExternalPackages` для pino, редирект `/w/:slug/projects/:projectId` → `/board` |
| `prisma.config.ts` | Путь к схеме, миграции, `DATABASE_URL` для Prisma CLI |
| `prisma/schema.prisma` | Схема БД (генератор `prisma-client` → `src/generated/prisma`). Модели Better Auth (`User`, `Session`, `Account`, `Verification`) пространств (`Workspace`, `WorkspaceMember`, `WorkspaceInvitation`), проектов (`Project`, `ProjectStatus`, enum `StatusCategory`) |
| `src/shared/auth/auth.ts` | Настройки Better Auth: срок сессии (7 дней), длина пароля (8–128), плагины `admin` и `organization` (роли `owner`/`member`, приглашение действует 7 дней, до 50 пространств на пользователя, до 100 ожидающих приглашений на пространство, переименование моделей, поле участника `canManageProjects`) |
| `components.json` | Настройки shadcn/ui CLI |
| `eslint.config.mjs` / `.prettierrc` | Линтер и форматирование |
| `vitest.config.ts` | Тесты и тестовые переменные окружения |
| `pnpm-workspace.yaml` | Разрешённые build-скрипты зависимостей, `saveExact` |

## See Also

- [Начало работы](getting-started.md): первый запуск
- [Логирование и ошибки](logging-and-errors.md): как работает `LOG_LEVEL`
- [Разработка](development.md): команды `infra:*` и `db:*`
