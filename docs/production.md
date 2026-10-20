[← Docker-образ и CI](deployment.md) · [Back to README](../README.md) · [Интеграция с GitHub →](github.md)

# Продакшен

Tasker работает на `https://tracker.plwedding.ru`, сервер `95.163.229.132` (Ubuntu 26.04, 1 vCPU, 2 GB RAM + 2 GB swap). На том же сервере работает стенд maxim (`dev.plwedding.ru`). Каждый пуш в `main` после зелёных проверок публикует образы в GHCR и деплоит их на сервер.

```
push в main ──► CI: check, migrations, docker ──► publish (GHCR) ──► deploy (SSH → docker compose)

интернет ──► edge-caddy-1 :80/:443 ──► сеть edge ──► tasker-app:3000      (всё, кроме бакета)
                                                 ├─► tasker-minio:9000    (/tasker-attachments/*)
                                                 └─► maxim-mockapi:8080   (dev.plwedding.ru)
                         tasker-app ──► сеть tasker ──► postgres:5432, minio:9000
```

## Что где лежит

| Путь на сервере | Что это | Кто меняет |
|-----------------|---------|------------|
| `/opt/edge/` | Общий edge-прокси: `compose.yml`, `Caddyfile`, `sites/` — см. [`deploy/edge/README.md`](../deploy/edge/README.md) | Вручную (`deploy/edge/`), сайты — CI проектов |
| `/opt/edge/sites/tracker.caddy` | Сайт Tasker (из `deploy/tasker/tracker.caddy`, домен подставлен) | CI при каждом деплое |
| `/opt/tasker/compose.yml` | Прод-стек (из `deploy/tasker/compose.yml`) | CI при каждом деплое |
| `/opt/tasker/.env` | Секреты и настройки стека (`600`, владелец `deploy`) | Один раз `bootstrap-server.sh`, дальше вручную |
| `/opt/tasker/release.env` | `TASKER_TAG=sha-xxxxxxx` — текущий релиз | CI при каждом деплое |
| `/opt/tasker/backup.sh`, `/opt/tasker/backups/` | Скрипт и резервные копии | CI (скрипт), таймеры (копии) |
| `/opt/tasker/reminders.sh` | Запуск напоминаний о сроке | CI при каждом деплое |
| `/opt/tasker/cleanup.sh` | Очистка журнала действий и счётчиков лимитов | CI при каждом деплое |
| `/etc/systemd/system/tasker-backup*` | Таймеры резервных копий | `bootstrap-server.sh` |
| `/etc/systemd/system/tasker-reminders.*` | Таймер напоминаний о сроке | `bootstrap-server.sh` |
| `/etc/systemd/system/tasker-cleanup.*` | Таймер очистки журнала | `bootstrap-server.sh` |
| `/etc/systemd/system/docker-mss-clamp.service` | MSS clamping для контейнеров (см. «Почта») | `bootstrap-server.sh` |

Файлы, которые копирует CI, руками не правятся: следующий деплой их перезапишет.

## Прод-стек

`deploy/tasker/compose.yml`, проект `tasker`:

| Сервис | Образ | Лимит памяти | Назначение |
|--------|-------|--------------|------------|
| `postgres` | `postgres:17-alpine` | 256m | БД, том `tasker_postgres-data` |
| `minio` | `pgsty/minio` | 320m | Вложения, том `tasker_minio-data`; консоль выключена (`MINIO_BROWSER=off`) |
| `minio-init` | `pgsty/mc` | — | Разово создаёт приватный бакет |
| `migrate` | `ghcr.io/leha-creator/tracker-migrate:<tag>` | 384m | Разово применяет миграции; `app` стартует только после успеха |
| `app` | `ghcr.io/leha-creator/tracker:<tag>` | 512m | Next.js, `NODE_OPTIONS=--max-old-space-size=384` |

Портов на хост стек не публикует. `app` и `minio` подключены к внешней сети `edge` с алиасами `tasker-app` и `tasker-minio`. Логи docker ротируются: 3 файла по 10 MB на контейнер.

### Вложения через тот же домен

Браузер загружает и скачивает файлы напрямую из MinIO по presigned-ссылкам. Ссылки подписываются на `S3_PUBLIC_ENDPOINT=https://tracker.plwedding.ru` в path-style: `https://tracker.plwedding.ru/tasker-attachments/<key>?X-Amz-...`. Caddy отправляет путь `/tasker-attachments` и всё под ним в MinIO, не меняя `Host` и путь, поэтому подпись сходится. Остальной API MinIO снаружи недоступен. Запросы идут с того же origin, поэтому CORS не нужен.

Имя бакета (`S3_BUCKET` в `.env`) должно совпадать с путём в `deploy/tasker/tracker.caddy`. Подпись и учётка ключа (`X-Amz-Signature`, `X-Amz-Credential`) вырезаются из access-лога Caddy.

## CD

Джобы `publish` и `deploy` в `.github/workflows/ci.yml`:

| Джоб | Когда | Что делает |
|------|-------|------------|
| `publish` | push в `main` после `check`, `migrations`, `docker` | Собирает `runner` и `migrate` из кеша `docker` и пушит в GHCR с тегами `sha-<7>` и `main` |
| `deploy` | после `publish` или Run workflow с `tag` | SSH под `deploy` → копирует `compose.yml`, `backup.sh`, `reminders.sh`, `cleanup.sh`, `release.env`, `tracker.caddy` → `backup.sh db` → `docker login` (временный `GITHUB_TOKEN`) → `pull` → `up -d --wait app` → `docker logout` → `caddy validate` + `reload` → smoke `https://tracker.plwedding.ru/api/health` → удаление старых образов `tracker` и `tracker-migrate` (остаётся текущий тег) и предупреждение, если `/` занят на 85% и больше |

Деплои идут по очереди (`concurrency: deploy-production`), новый пуш в `main` не прерывает идущий деплой. Если миграция упала, `app` не пересоздаётся и продолжает работать предыдущая версия: в логе джоба будет ошибка `migrate`, а копия БД до миграции лежит в `/opt/tasker/backups/db/`.

`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` передаётся в сборку как BuildKit-секрет. Ключ один на все релизы, поэтому вкладки, открытые до деплоя, не получают `Failed to find Server Action`.

### Настройки GitHub

| Имя | Где | Значение |
|-----|-----|----------|
| `DEPLOY_HOST` | variable, environment `production` | `95.163.229.132` |
| `DEPLOY_USER` | variable, environment `production` | `deploy` |
| `DEPLOY_DOMAIN` | variable, environment `production` | `tracker.plwedding.ru` |
| `DEPLOY_SSH_KEY` | secret, environment `production` | приватный ключ `~/.ssh/tasker_deploy` (комментарий `tasker-ci`) |
| `DEPLOY_KNOWN_HOSTS` | secret, environment `production` | `ssh-keyscan -t ed25519 95.163.229.132`, отпечаток `SHA256:piIGaB26Hj6jkU0XXDkyx5UGBQeZMZt8V3Oezrpiufk` |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | secret репозитория | `openssl rand -base64 32`; смена ключа сбрасывает открытые вкладки |

Environment `production` разрешён только для ветки `main`.

### Откат

```bash
gh workflow run CI --ref main -f tag=sha-xxxxxxx
```

Деплой берёт уже опубликованный образ без сборки и проверок. Миграции вниз не откатываются: если новая версия поменяла схему, восстановите БД из копии (см. ниже) или выпустите исправление.

## Частые действия

```bash
ssh deploy@95.163.229.132          # ключ ~/.ssh/tasker_deploy
cd /opt/tasker
C="docker compose --env-file .env --env-file release.env"

$C ps -a                           # состояние
$C logs -f --tail=100 app          # логи приложения (JSON pino)
$C up -d app                       # применить изменения .env (например, SMTP)
docker stats --no-stream           # память
```

`LOG_LEVEL` меняется в `/opt/tasker/.env`, затем `$C up -d app`.

### Место на диске

Корневой диск сервера — 19 ГБ, его делят все проекты. Когда место кончается, MinIO отвечает `507` (`XMinioStorageFull`) на любую загрузку файла, квота пространства тут ни при чём. Больше всего места занимают Docker-образы прошлых релизов: деплой Tasker удаляет свои, а образы других проектов (meet, maxim) копятся, пока их не удалит их собственный CI.

```bash
df -h /                                       # свободное место
docker system df                              # образы, тома, кеш
docker image prune -af --filter "until=1h"    # удалить образы без контейнеров (откат скачает тег из GHCR заново)
```

## Резервные копии

`/opt/tasker/backup.sh` запускают таймеры systemd под `deploy`:

| Таймер | Расписание (UTC) | Что | Хранится |
|--------|------------------|-----|----------|
| `tasker-backup-db.timer` | ежедневно 03:30 | `pg_dump -Fc` → `backups/db/tasker-<UTC>.dump` | 7 последних |
| `tasker-backup-files.timer` | воскресенье 04:00 | tar тома MinIO → `backups/files/files-<UTC>.tar.gz` | 2 последних |

Кроме того, деплой делает копию БД перед каждой миграцией. Вручную: `sh /opt/tasker/backup.sh db` или `files`. Журнал: `journalctl -u 'tasker-backup@*'`, проверка расписания: `systemctl list-timers 'tasker-*'`.

Копии лежат на том же диске. Они защищают от ошибок и неудачных миграций, но не от потери сервера. Их стоит периодически выгружать с сервера (`scp`).

Восстановление БД:

```bash
docker exec -i tasker-postgres-1 sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  < /opt/tasker/backups/db/tasker-<UTC>.dump
```

Восстановление файлов (при остановленном `minio`):

```bash
$C stop minio
docker run --rm -v tasker_minio-data:/data -v /opt/tasker/backups/files:/backup postgres:17-alpine \
  sh -c 'rm -rf /data/* /data/.[!.]* && tar xzf /backup/files-<UTC>.tar.gz -C /data'
$C up -d minio
```

## Напоминания о сроке

`tasker-reminders.timer` раз в день в 09:00 по Москве (пояс указан в `OnCalendar`, от пояса сервера не зависит; `Persistent=true` — пропущенный запуск выполнится после загрузки) запускает `/opt/tasker/reminders.sh` под `deploy`. Скрипт вызывает `POST /api/cron/reminders` изнутри контейнера `tasker-app-1`. `CRON_SECRET` берётся из окружения контейнера и в командную строку не попадает (её видно в `ps`).

| Напоминание | Кому | Когда |
|-------------|------|-------|
| «Завтра срок задачи» | Ответственному | Срок — завтра по `REMINDERS_TIMEZONE` |
| «Срок задачи прошёл» | Ответственному и наблюдателям | Срок раньше сегодняшнего; один раз на каждое значение срока |

Пропускаются задачи в архиве и в архивных пространствах, без ответственного и выполненные (во всех проектах статус «Готово»). Каналы (в приложении, письмом) пользователь настраивает в профиле. Повторный запуск в тот же день ничего не шлёт: отправленные напоминания отмечены в `TaskDueReminder`.

Вручную и проверка:

```bash
sh /opt/tasker/reminders.sh            # 200 {"result":{"dueSoon":…,"overdue":…,"skipped":…,"failedBatches":0}}
journalctl -u tasker-reminders         # журнал запусков
systemctl list-timers 'tasker-*'       # расписание
```

`404` — в `/opt/tasker/.env` нет `CRON_SECRET`. `failedBatches > 0` — часть задач не обработана из-за ошибки БД (подробности в логах приложения, `[reminders] batch failed`); следующий запуск их догонит.

**Сервер, настроенный до появления напоминаний.** `bootstrap-server.sh` генерирует `CRON_SECRET` только для нового `.env`, а CI не ставит таймеры. Один раз под root:

```bash
echo "CRON_SECRET=$(openssl rand -hex 32)" >> /opt/tasker/.env
sudo -u deploy sh -c 'cd /opt/tasker && docker compose --env-file .env --env-file release.env up -d --wait app'
# с копией каталога deploy/ на сервере — или просто повторный запуск bootstrap-server.sh:
install -m 644 /tmp/tasker-deploy/tasker/systemd/tasker-reminders.* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tasker-reminders.timer
```

## Очистка журнала

`tasker-cleanup.timer` раз в день в 04:30 по Москве запускает `/opt/tasker/cleanup.sh` под `deploy`. Скрипт вызывает `POST /api/cron/cleanup` изнутри контейнера: удаляются события журнала действий старше `AUDIT_RETENTION_DAYS` (по умолчанию 180 дней) и истёкшие счётчики лимитов. Секрет — тот же `CRON_SECRET`.

```bash
sh /opt/tasker/cleanup.sh              # 200 {"result":{"auditDeleted":…,"auditCutoff":"…","rateLimitDeleted":…}}
journalctl -u tasker-cleanup           # журнал запусков
```

**Сервер, настроенный до появления очистки.** CI копирует `cleanup.sh`, но таймеры не ставит. Один раз под root (или повторный запуск `bootstrap-server.sh`):

```bash
install -m 644 /tmp/tasker-deploy/tasker/systemd/tasker-cleanup.* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tasker-cleanup.timer
```

## Почта

Письма нужны для подтверждения email при регистрации, сброса пароля, приглашений и уведомлений. **Без настроенного SMTP новые пользователи не смогут подтвердить email и войти**, а сброс пароля не работает. Временно (только если почты на сервере нет) можно задать `AUTH_REQUIRE_EMAIL_VERIFICATION=false` в `/opt/tasker/.env`. Приглашение без SMTP всё равно создаётся: письмо не уходит (в логах `[invitation] email failed`), а владелец получает ссылку и передаёт её вручную.

Миграция `auth_security` помечает подтверждёнными всех пользователей, зарегистрированных до включения подтверждения email, — их вход не меняется. Проверка после деплоя: зарегистрироваться с тестовым адресом, получить письмо «Подтвердите email — Tasker», перейти по ссылке; запросить «Забыли пароль?» и получить письмо «Сброс пароля — Tasker». Сбои отправки — в логах `[mail.background] send failed`.

Почта домена — у reg.ru (ящик `no-reply@plwedding.ru`). DNS уже настроен через reg.ru: MX `mxs1.reg.ru` / `mxs2.reg.ru`, SPF (`include:_spf.hosting.reg.ru`), DKIM (селектор `dkim`), DMARC `p=none`. A-запись `plwedding.ru` не трогать.

Настройки в `/opt/tasker/.env` (логин — полный адрес ящика, пароль — от ящика):

```
SMTP_HOST=mail.hosting.reg.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@plwedding.ru
SMTP_PASSWORD='<пароль ящика>'
MAIL_FROM="Tasker <no-reply@plwedding.ru>"
```

Пароль — в одинарных кавычках, чтобы `$`, `#` и пробелы не ломали файл. Затем `$C up -d app`, отправить тестовое приглашение и проверить в заголовках письма `spf=pass`, `dkim=pass`, `dmarc=pass`.

### Таймауты SMTP из контейнера (MTU)

У внешнего интерфейса сервера MTU 1450 (облако OpenStack), у сетей Docker — 1500. Без MSS clamping удалённый сервер шлёт контейнеру слишком большие TCP-сегменты, и TLS-рукопожатие зависает. Симптом: первое подключение к SMTP после паузы падает с `Connection timeout` (в UI — «Письмо отправить не удалось»), следующие проходят. С самого сервера (`openssl s_client`) всё работает, потому что его MSS уже правильный.

Лечится правилом `iptables -t mangle ... -j TCPMSS --clamp-mss-to-pmtu` для трафика контейнеров. Его ставит `bootstrap-server.sh` как юнит `docker-mss-clamp.service` (`deploy/host/`). Проверка: `iptables -t mangle -S FORWARD | grep TCPMSS`.

## Новый сервер

1. Docker с плагином compose, пользователь `deploy` в группе `docker`, ufw с открытыми 22/80/443, вход по SSH только по ключам. На текущем сервере это сделал `bootstrap.sh` из репозитория maxim.
2. Подготовка под Tasker (повторный запуск безопасен, существующий `.env` не меняется):

   ```bash
   scp -r deploy root@<host>:/tmp/tasker-deploy
   ssh root@<host> "TASKER_DEPLOY_PUBKEY='$(cat ~/.ssh/tasker_deploy.pub)' ADMIN_EMAILS='<email>' \
     sh /tmp/tasker-deploy/bootstrap-server.sh"
   ```

   Скрипт создаёт `/opt/edge` и `/opt/tasker`, сеть `edge`, добавляет ключ деплоя, генерирует секреты в `/opt/tasker/.env` (включая `CRON_SECRET`) и ставит таймеры бэкапов и напоминаний. Edge-прокси он не запускает.
3. `cd /opt/edge && docker compose up -d` (под `deploy`).
4. Обновить `DEPLOY_HOST` и `DEPLOY_KNOWN_HOSTS` в GitHub и запустить workflow.

Перенос данных: `backup.sh db` и `files` на старом сервере, файлы — на новый, восстановление командами выше.

## GitHub App

Проще всего создать приложение из админки: войти администратором на https://tracker.plwedding.ru, открыть **Админка → Интеграции** и нажать **Создать GitHub App на GitHub** — адреса, права и вебхук GitHub заполнит из манифеста, ключи сохранятся в БД, перезапуск не нужен (подробно — [Интеграция с GitHub](github.md#из-админки-рекомендуется)). Ключи шифруются ключом из `BETTER_AUTH_SECRET`: при его смене приложение нужно создать заново.

Другой способ — шесть переменных `GITHUB_*` в `/opt/tasker/.env`; они важнее записи из админки. Пустые значения означают «не задано».

Адреса приложения для `tracker.plwedding.ru` (при ручном создании):

| Поле GitHub App | Значение |
|-----------------|----------|
| Homepage URL | `https://tracker.plwedding.ru` |
| Callback URL | `https://tracker.plwedding.ru/api/auth/callback/github` |
| Setup URL (Redirect on update) | `https://tracker.plwedding.ru/api/integrations/github/setup` |
| Webhook URL | `https://tracker.plwedding.ru/api/webhooks/github` |

```
GITHUB_APP_ID=123456
GITHUB_APP_SLUG=tasker-plwedding
GITHUB_APP_PRIVATE_KEY='-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n'
GITHUB_APP_CLIENT_ID=Iv23li...
GITHUB_APP_CLIENT_SECRET='<client secret>'
GITHUB_WEBHOOK_SECRET='<openssl rand -hex 32>'
```

Ключ — одной строкой с `\n`, в одинарных кавычках. Затем `$C up -d app`. Проверка: в настройках GitHub App → **Advanced → Recent Deliveries** повторить доставку `ping` или любого события — ответ `200` (`ignored` для `ping`), в логах `[github.webhook] received`. Ответ `401` значит, что секрет не совпадает; `404` — переменные не дошли до контейнера (`$C exec app printenv GITHUB_APP_ID`).

Edge-прокси пропускает `/api/webhooks/github` как обычный запрос приложения, отдельной настройки Caddy не нужно.

## MCP-сервер для агентов

Claude Code подключается к `https://tracker.plwedding.ru/api/mcp` с личным токеном из **Профиль → Токены доступа** (см. [Claude Code и MCP](agents.md)). Отдельной настройки сервера не нужно:

- сервер работает без сессий и отвечает JSON, без SSE, поэтому длинные соединения и таймауты Caddy его не касаются;
- заголовок `Authorization` проходит до приложения, а в access-логе Caddy вырезается (`request>headers>Authorization delete` в `tracker.caddy`);
- переменные окружения не нужны, ссылки на задачи строятся от `BETTER_AUTH_URL`.

Проверка без токена — ожидается `401` с `WWW-Authenticate: Bearer`:

```bash
curl -si -X POST https://tracker.plwedding.ru/api/mcp -H 'content-type: application/json' -d '{}' | head -5
```

## Реалтайм через Caddy

Доска и списки обновляются по потоку событий `GET /api/realtime/w/<slug>` (SSE, см. [архитектуру](architecture.md#обновления-в-реальном-времени)). Поток нельзя сжимать и буферизовать: `encode` в Caddy копит ответ, и события приходят пачками или не приходят совсем. Поэтому в `tracker.caddy` для него отдельный `handle` **перед** общим:

```caddy
@realtime path /api/realtime/*
handle @realtime {
	reverse_proxy tasker-app:3000 {
		flush_interval -1
	}
}
```

Без `encode`, `flush_interval -1` отдаёт каждый кадр сразу. Пинг каждые 25 секунд держит соединение живым, таймауты Caddy по умолчанию его не рвут. Файл сайта приходит с деплоем, на сервере ничего менять не нужно.

Проверка (с cookie сессии из браузера) — ожидаются `200`, `content-type: text/event-stream` и строка `retry: 5000`:

```bash
curl -sN https://tracker.plwedding.ru/api/realtime/w/<slug> -H 'cookie: __Secure-better-auth.session_token=…' | head -3
```

Без сессии — `401`. Если приложение запущено в нескольких экземплярах, отдельный брокер не нужен: события идут через `LISTEN/NOTIFY` общего Postgres, каждый экземпляр держит одно подключение.

## Безопасность

- Снаружи открыты только 22, 80 и 443. Postgres и MinIO наружу не публикуются, из MinIO через прокси доступен только путь бакета. Анонимный доступ к бакету закрыт.
- Ответы содержат `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`; заголовок `Server` убран. Куки сессии в production — `__Secure-`.
- Пользователь `deploy` в группе `docker` фактически равен root. Ключ `tasker_deploy` используется только для Tasker и отзывается независимо от ключа maxim (удалить строку `tasker-ci` из `/home/deploy/.ssh/authorized_keys`).
- По умолчанию регистрация открыта для всех, у кого есть ссылка, но войти можно только после подтверждения email. Закрыть её, оставить только по приглашению или ограничить доменами email можно в админке (`/admin/settings`). Роль admin получают только адреса из `ADMIN_EMAILS` в момент регистрации; они регистрируются при любом режиме.
- Действия пользователей и администраторов пишутся в журнал (`/admin/activity`), срок хранения — `AUDIT_RETENTION_DAYS`. Вход «от имени пользователя» длится час, помечается в журнале и не даёт менять пароль, 2FA, сессии и токены.
- Попытки входа, регистрации, сброса пароля и ввода кода 2FA ограничены лимитами в БД (таблицы `RateLimit` и `ActionRateLimit`), IP клиента — из `X-Forwarded-For`, который выставляет edge-Caddy. Администратору стоит включить 2FA в профиле («Безопасность»).
- Токены доступа агентов (`/api/mcp`) действуют в одном пространстве с правами владельца и не дают админских прав. В БД хранится только их SHA-256. Отзыв действует сразу.

## See Also

- [Docker-образ и CI](deployment.md): образы, `compose.app.yml`, джобы проверок
- [Конфигурация](configuration.md): переменные приложения
- [Интеграция с GitHub](github.md): создание GitHub App и что делает интеграция
- [Claude Code и MCP](agents.md): токены доступа и подключение агентов
- [`deploy/edge/README.md`](../deploy/edge/README.md): edge-прокси и подключение проектов
