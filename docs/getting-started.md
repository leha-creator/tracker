[Back to README](../README.md) · [Конфигурация →](configuration.md)

# Начало работы

## Требования

| Инструмент | Версия | Примечание |
|------------|--------|------------|
| Node.js | 22+ (рекомендуется 24, см. `.nvmrc`) | |
| pnpm | 12 | Ставится через corepack, версия зафиксирована в `package.json` → `packageManager` |
| Docker + Compose | Docker Desktop / Engine с Compose v2+ | Для Postgres и MinIO |

```bash
corepack enable   # один раз; включает pnpm нужной версии
```

## Установка

```bash
pnpm install          # postinstall сгенерирует Prisma Client в src/generated/prisma
cp .env.example .env  # значения подходят для локального docker-compose
```

`pnpm install` также ставит pre-commit хук (husky).

## Запуск инфраструктуры

```bash
pnpm infra:up
```

Команда:

1. Поднимает `postgres` и `minio` и ждёт, пока их healthcheck станет зелёным.
2. Запускает одноразовый контейнер `minio-init`, который создаёт приватный бакет `S3_BUCKET`.

| Сервис | Адрес | Логин / пароль (dev) |
|--------|-------|----------------------|
| PostgreSQL | `localhost:5433`, БД `tasker` | `tasker` / `tasker` |
| MinIO S3 API | `http://localhost:9000` | `tasker` / `tasker-secret` |
| MinIO Console | `http://localhost:9001` | `tasker` / `tasker-secret` |

Остановка: `pnpm infra:down`. Данные сохраняются в Docker volumes `postgres-data` и `minio-data`.

## Миграции БД

```bash
pnpm db:deploy   # применяет миграции из prisma/migrations
```

Нужно один раз после первого `infra:up` и после каждого `git pull`, в котором появились новые миграции.

## Запуск приложения

```bash
pnpm dev
```

Откройте http://localhost:3000. Без входа приложение перенаправит на `/login`.

## Первый вход и администратор

1. Убедитесь, что в `.env` в `ADMIN_EMAILS` указан ваш email (в `.env.example` — `admin@example.com`).
2. Откройте http://localhost:3000/register и зарегистрируйтесь с этим email. Пароль — от 8 до 128 символов.
3. После регистрации вход выполняется автоматически. В шапке появятся бейдж «Администратор» и ссылка «Админка» (`/admin`).

Пользователи с другими email получают роль `user`, а для них `/admin` отвечает 404.

`ADMIN_EMAILS` срабатывает только при регистрации. Чтобы сделать администратором уже существующего пользователя, поменяйте его роль в БД:

```bash
pnpm db:studio   # таблица User → поле role = admin
```

## Проверка

```bash
curl -i http://localhost:3000/api/health
```

| Ответ | Значение |
|-------|----------|
| `200 {"status":"ok", ...}` | БД и хранилище доступны |
| `503 {"status":"degraded", ...}` | Хотя бы одна зависимость недоступна, подробности в `checks` и в логах |

В терминале с `pnpm dev` (при `LOG_LEVEL=debug`) появятся записи `[checkDatabase]`, `[checkStorage]` и `[checkHealth] healthy`.

Проверка кода целиком:

```bash
pnpm check
```

## Частые проблемы

| Симптом | Причина и решение |
|---------|-------------------|
| `Bind for 0.0.0.0:5433 failed: port is already allocated` | Порт занят. Поменяйте `POSTGRES_PORT` и порт в `DATABASE_URL` в `.env` |
| `EnvValidationError: Невалидные переменные окружения: ...` | Нет `.env` или в нём ошибка. Сверьтесь с `.env.example` |
| `/api/health` → 503, `storage.ok: false` | MinIO не запущен или бакет не создан. Выполните `pnpm infra:up` |
| `pnpm: command not found` | Выполните `corepack enable` |
| `Cannot find module '@/generated/prisma/client'` | Выполните `pnpm db:generate` |
| При регистрации «Внутренняя ошибка сервера», в логах — что таблица `public.User` не существует | Не применены миграции. Выполните `pnpm db:deploy` |
| `EnvValidationError: ... BETTER_AUTH_SECRET` | Секрет не задан или короче 32 символов. См. [Конфигурация](configuration.md) |
| Зарегистрировались, но роли администратора нет | Email не был в `ADMIN_EMAILS` на момент регистрации. Поменяйте роль через `pnpm db:studio` |

## See Also

- [Конфигурация](configuration.md): все переменные окружения и порты
- [Разработка](development.md): команды, тесты, работа с Prisma
- [Архитектура](architecture.md): где писать код
