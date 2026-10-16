# План реализации: деплой на сервер и CD

Branch: none (`git.create_branches: false`, работа в `main`)
Created: 2026-10-16

## Settings
- Testing: smoke  # Vitest не нужен: доменный код не меняется. Проверки — `docker compose config` прод-стека и actionlint в CI, smoke `/api/health` после деплоя, ручная проверка вложений и приглашений
- Logging: verbose
- Docs: yes  # обязательный docs checkpoint в /aif-implement через /aif-docs

## Roadmap Linkage
Milestone: "Готовность к продакшену"
Rationale: План добавляет подэтап «Деплой на сервер (CD)» к уже готовому Docker-образу и CI; e2e-тесты и аудит безопасности остаются открытыми.

## Рамки

**Входит:**
- Общий edge-прокси (Caddy) на сервере, отделённый от maxim; перевод maxim на него.
- Прод-стек tasker: Postgres, MinIO, миграции, приложение — на том же сервере, без публикации портов.
- Публикация образов в GHCR и автоматический деплой на `tracker.plwedding.ru` при пуше в `main`, откат по тегу.
- Резервное копирование БД и файлов, почта на домене для приглашений, документация.

**Не входит:**
- Проектная документация и интеграция с GitHub (этапы roadmap пропускаются по решению пользователя).
- Изменения доменного кода, e2e-тесты, полный аудит безопасности.

## Состояние сервера (проверено 2026-10-16)

- `95.163.229.132`, Ubuntu 26.04.1, **1 vCPU, 1.9 GB RAM + 2 GB swap**, свободно ~14 GB диска.
- Docker 29.9.1, Compose v5.6.0. ufw: открыты только 22, 80, 443 (tcp/udp).
- SSH только по ключам: `root` — `~/.ssh/id_ed25519`; `deploy` (uid 1000, группа `docker`) — ключ maxim.
- Запущено: `maxim-caddy-1` (`caddy:2.11.7`, 80/443, сеть `maxim_maxim`) и `maxim-mockapi-1`. Каталог `/opt/maxim` (`deploy:deploy`).
- Деплой maxim (`leha-creator/maxim`, `.github/workflows/deploy.yml`, ветка `master`) при каждом запуске копирует `deploy/Caddyfile` в `/opt/maxim`, делает `caddy reload` и `docker image prune -af --filter until=72h`.
- DNS: `tracker.plwedding.ru` → `95.163.229.132`. У `plwedding.ru` нет MX-записей; DNS у reg.ru.

## Ключевые решения

- **Образы собираются в CI, не на сервере.** На 1 vCPU / 2 GB `next build` не уложится. GitHub Actions публикует `ghcr.io/leha-creator/tracker` (target `runner`) и `ghcr.io/leha-creator/tracker-migrate` (target `migrate`) с тегами `sha-<7>` и `main`; сервер только делает `pull`.
- **Edge-прокси отдельно от проектов.** `/opt/edge`: Caddy с `import /etc/caddy/sites/*.caddy` и внешней docker-сетью `edge`. Каждый проект кладёт свой файл сайта в `/opt/edge/sites/<project>.caddy` и делает `caddy reload`. Конфиг edge хранится в этом репозитории в `deploy/edge/` и применяется вручную (не из CI): он общий, менять его — редкое осознанное действие.
- **Файлы через тот же домен, без отдельного поддомена и CORS.** `S3_PUBLIC_ENDPOINT=https://tracker.plwedding.ru`, `S3_FORCE_PATH_STYLE=true` → presigned-ссылки вида `https://tracker.plwedding.ru/tasker-attachments/<key>?X-Amz-…`. Caddy отправляет `/tasker-attachments/*` в MinIO, сохраняя заголовок `Host` (поведение `reverse_proxy` по умолчанию), поэтому подпись сходится. Наружу доступен только путь бакета, консоль и admin API MinIO закрыты. Same-origin — CORS не нужен.
- **Секреты живут на сервере.** `/opt/tasker/.env` (`600`, владелец `deploy`) создаётся один раз при подготовке сервера. CI передаёт только тег релиза в `/opt/tasker/release.env`. В GitHub — только SSH-ключ деплоя и known_hosts.
- **Отдельный ключ деплоя tasker** (`~/.ssh/tasker_deploy`) для пользователя `deploy`, а не общий с maxim — можно отозвать независимо. Учитывать: членство `deploy` в группе `docker` фактически равно root.
- **Ограничения памяти**: postgres 256m, minio 320m, app 512m (`NODE_OPTIONS=--max-old-space-size=384`), edge-caddy 128m; ротация логов docker `json-file` `max-size=10m`, `max-file=3`.
- **Миграции** — сервис `migrate` из образа `tracker-migrate`; `app` стартует только после успешного завершения (`service_completed_successfully`). Перед `up` деплой делает `pg_dump`.
- **Почта** — ящик на домене (Yandex 360 или Mail.ru для бизнеса), SMTP 465 с паролем приложения. Почта нужна только для приглашений (`invitation.service.ts`); приложение стартует и без неё.
- **Очистку образов tasker не делает**: её уже выполняет деплой maxim (`prune -af`, удаляет только неиспользуемые). Откат на старый тег просто заново скачивает образ из GHCR.

## Commit Plan
- **Commit 1** (после задачи 1, репозиторий tasker): `chore(deploy): add shared edge proxy config`
- **Commit 2** (задача 3, репозиторий maxim, ветка `master`): `chore(deploy): move proxy to shared edge caddy`
- **Commit 3** (после задач 4–6): `feat(deploy): production compose stack and slim migrate image`
- **Commit 4** (после задач 7–8): `ci: publish images to GHCR and deploy to server`
- **Commit 5** (после задачи 10): `chore(deploy): database and files backups`
- **Commit 6** (задача 13): `docs: production deployment`

## Tasks

### Phase 1: Edge-прокси

- [x] **Task 1: Конфиг общего edge-прокси** — `deploy/edge/compose.yml`, `deploy/edge/Caddyfile`, `deploy/edge/README.md`.
  - compose: проект `edge`, сервис `caddy` (`caddy:2.11.7`), порты `80`, `443`, `443/udp`; тома `caddy_data`, `caddy_config`; `./Caddyfile` и `./sites` монтируются read-only; сеть `edge` с явным `name: edge` (её подключают проекты как `external`); `mem_limit: 128m`, `restart: unless-stopped`, `no-new-privileges`.
  - Caddyfile: глобальный блок (JSON-логи в stdout, `email` для ACME), `import /etc/caddy/sites/*.caddy`. Без сайтов Caddy должен стартовать (проверить `caddy validate` с пустым `sites/`).
  - README: назначение, как добавить сайт проекта, команда reload (`docker compose -p edge exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`), порядок переезда с maxim.
  - Логирование: Caddy access-логи JSON в каждом сайте; в README — как смотреть (`docker compose -p edge logs caddy`).

- [x] **Task 2: Подготовка сервера** (вручную под `root`, скрипт `deploy/bootstrap-server.sh`, идемпотентный) (depends on 1)
  - Создать `/opt/edge` (`root:deploy`, `750`), `/opt/edge/sites` (`root:deploy`, `2775` — `deploy` пишет файлы сайтов), `/opt/tasker` (`deploy:deploy`, `750`), `/opt/tasker/backups`.
  - Скопировать `deploy/edge/*` в `/opt/edge`. Сам edge **не запускать** — это делает задача 3, чтобы не конфликтовать за 80/443 с Caddy maxim.
  - Сгенерировать локально `~/.ssh/tasker_deploy` (ed25519, комментарий `tasker-ci`) и добавить публичную часть в `/home/deploy/.ssh/authorized_keys`.
  - Создать `/opt/tasker/.env` (`600`, `deploy`) по шаблону из задачи 6: секреты генерировать на сервере (`openssl rand -base64 32` для `BETTER_AUTH_SECRET`, `openssl rand -hex 24` для паролей Postgres/MinIO); в чат и в логи их не выводить.
  - Логирование: каждый шаг печатает `[bootstrap] <шаг>: ok|skip|fail`; `set -euo pipefail`; не печатать содержимое `.env`.
  - Безопасность: сменить пароль root (он был передан в чате) и проверить, что в `sshd` стоят `PasswordAuthentication no` и `PermitRootLogin prohibit-password`.

- [x] **Task 3: Перевод maxim на edge-прокси** (репозиторий `D:\work\maxim`, ветка `master`) (depends on 2)
  - `deploy/compose.yml`: убрать сервис `caddy` и его тома; `mockapi` подключить к внешней сети `edge` с алиасом `maxim-mockapi` (имена сервисов в общей сети должны быть уникальны), сеть `maxim` оставить.
  - Новый `deploy/maxim.caddy` — текущий сайт из `deploy/Caddyfile` (`encode`, `X-Robots-Tag`, `redir / /docs`, `reverse_proxy maxim-mockapi:8080`, `handle_errors` 502/503/504); домен подставляется в CI при копировании (`sed "s/__DOMAIN__/${DOMAIN}/"`), так как env-переменные maxim edge-Caddy не видит.
  - `deploy.yml`: копировать `maxim.caddy` в `/opt/edge/sites/maxim.caddy`, reload через `docker compose -p edge exec -T caddy caddy reload …`, режим `proxy-only` переделать на «только файл сайта + reload».
  - Переключение (вручную, короткий простой maxim): `docker compose -p maxim stop caddy` → `cd /opt/edge && docker compose up -d` → деплой maxim из CI → `docker compose -p maxim rm -f caddy`. Caddy заново выпустит сертификат для домена maxim (лимиты Let's Encrypt не задеваются).
  - Проверка: домен maxim отвечает по HTTPS, smoke workflow maxim зелёный, `docker ps` — один Caddy (`edge-caddy-1`).
  - Логирование: шаги workflow в `::group::`, `set +x` вокруг SSH, при ошибке — `docker compose -p edge logs --tail=100 caddy`.

### Phase 2: Прод-стек tasker

- [x] **Task 4: Облегчить образ `migrate`** — `Dockerfile`. *Итог: ~610 MB (было ~2 GB): Node-образ ~245 MB + Prisma CLI с зависимостями ~250 MB; меньше без отказа от npm-пакета `prisma` не получить. `migrate deploy` на чистом Postgres проверен.*
  - Сейчас `migrate` = стейдж `deps` (~2 GB со всеми dev-зависимостями): тяжело тянуть на сервер с 14 GB диска.
  - Новый стейдж `migrate-deps`: только `prisma` (CLI) и `dotenv` (их импортирует `prisma.config.ts`) тех же версий, что в `pnpm-lock.yaml`, плюс `prisma/` и `prisma.config.ts`. Вариант — `pnpm deploy --prod` с отдельным манифестом или `pnpm install --filter` по нужным пакетам; выбрать тот, что не ломает `--frozen-lockfile`.
  - Критерий: образ < 500 MB, `prisma migrate deploy` на чистом Postgres проходит (CI-джоб `docker` уже запускает `migrate` через `compose.app.yml`). Если уложиться не удаётся — оставить текущий стейдж и записать причину в комментарий Dockerfile.
  - Логирование: не требуется (Prisma CLI сам пишет применённые миграции в stdout).

- [x] **Task 5: Прод-compose и сайт Caddy** — `deploy/tasker/compose.yml`, `deploy/tasker/tracker.caddy` (depends on 1)
  - compose (проект `tasker`, запуск `docker compose --env-file .env --env-file release.env`):
    - `postgres` (`postgres:17-alpine`), `minio` (тот же образ `pgsty/minio`, что в `compose.yml`), `minio-init` (бакет, `anonymous set none`), `migrate` и `app` из `ghcr.io/leha-creator/tracker{,-migrate}:${TASKER_TAG:?}`.
    - Портов на хост нет. Сети: внутренняя `tasker`; `app` и `minio` ещё и в `edge` (внешней) с алиасами `tasker-app`, `tasker-minio`.
    - Все секреты через `${VAR:?VAR is required}` — без небезопасных дефолтов из `compose.app.yml`.
    - `app`: `NODE_ENV=production`, `LOG_LEVEL=${LOG_LEVEL:-info}`, `BETTER_AUTH_URL=https://${DOMAIN}`, `S3_ENDPOINT=http://minio:9000`, `S3_PUBLIC_ENDPOINT=https://${DOMAIN}`, `S3_FORCE_PATH_STYLE=true`, `SMTP_*` и `MAIL_FROM` из `.env`, healthcheck как в `compose.app.yml`.
    - `mem_limit` и ротация логов (см. «Ключевые решения»), `restart: unless-stopped`, `no-new-privileges`; тома `postgres-data`, `minio-data`.
    - `MINIO_API_CORS_ALLOW_ORIGIN=https://${DOMAIN}` (на случай прямых запросов; при same-origin не используется).
  - `tracker.caddy` (домен `__DOMAIN__`, подставляется при деплое):
    - `handle /tasker-attachments/*` → `reverse_proxy tasker-minio:9000` (Host не переписывать, без лимита тела запроса — лимит размера задаёт presigned POST policy).
    - Остальное → `reverse_proxy tasker-app:3000`.
    - Заголовки: `Strict-Transport-Security`, `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin`, `-Server`; `encode zstd gzip` (не для пути бакета); `handle_errors 502 503 504` → 503 «Обновление, попробуйте через минуту».
    - JSON access-лог, без query string для пути бакета (там подпись) — `log_skip` или фильтр `query` в формате логов.
  - Проверка: `docker compose -f deploy/tasker/compose.yml config` с тестовым env проходит (добавить шаг в CI, задача 7); `caddy validate` для файла сайта.

- [x] **Task 6: Шаблон прод-окружения** — `deploy/tasker/.env.example` (depends on 5)
  - Все переменные прод-стека с комментариями: `DOMAIN=tracker.plwedding.ru`, `POSTGRES_*`, `MINIO_ROOT_*`, `S3_BUCKET=tasker-attachments` (совпадает с путём в `tracker.caddy`), `BETTER_AUTH_SECRET`, `ADMIN_EMAILS`, `SMTP_HOST/PORT/SECURE/USER/PASSWORD`, `MAIL_FROM`, `LOG_LEVEL`.
  - Рядом команды генерации секретов. Значений-секретов в файле нет.

<!-- Commit checkpoint: tasks 4–6 -->

### Phase 3: CD

- [x] **Task 7: Публикация образов в GHCR** — `.github/workflows/ci.yml`, `Dockerfile` (depends on 4, 5)
  - Джоб `publish`: `needs: [check, migrations, docker]`, только `push` в `main`; `permissions: packages: write`; `docker/login-action` с `GITHUB_TOKEN`; `docker/build-push-action` для `runner` и `migrate` с тегами `sha-<7>` и `main`, кеш `type=gha` с теми же scope, что в джобе `docker` (пересборка из кеша быстрая); `provenance: false`; OCI-метки `org.opencontainers.image.source`/`revision`.
  - `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (секрет репозитория): в `Dockerfile` — `RUN --mount=type=secret,id=next_sa_key,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY pnpm build`, в CI — `secrets:`. Ключ стабилен между релизами, поэтому открытые вкладки не ловят «Failed to find Server Action». Без секрета сборка работает как раньше.
  - В джоб `check` (или отдельный лёгкий): `docker compose -f deploy/tasker/compose.yml config -q` с фиктивными значениями переменных и actionlint.
  - Логирование: digest и теги в `$GITHUB_STEP_SUMMARY`.

- [x] **Task 8: Деплой на сервер** — `.github/workflows/ci.yml` (джоб `deploy`) или отдельный `deploy.yml` по образцу maxim (depends on 7, 2)
  - Триггеры: после `publish` на `main`; `workflow_dispatch` с входом `tag` — откат без сборки.
  - `environment: production` (URL `https://tracker.plwedding.ru`), `concurrency: deploy-production`, `cancel-in-progress: false`.
  - Шаги:
    1. SSH: ключ из `secrets.DEPLOY_SSH_KEY`, `secrets.DEPLOY_KNOWN_HOSTS`, `StrictHostKeyChecking yes`, `BatchMode yes`; `vars.DEPLOY_HOST`, `vars.DEPLOY_USER`, `vars.DEPLOY_DOMAIN`.
    2. `scp deploy/tasker/compose.yml` → `/opt/tasker/`; `tracker.caddy` с подставленным доменом → `/opt/edge/sites/tracker.caddy`; `TASKER_TAG=<tag>` → `/opt/tasker/release.env`.
    3. Бэкап БД перед миграциями (`deploy/tasker/backup.sh db`, задача 10), если Postgres уже запущен.
    4. `docker login ghcr.io` токеном workflow (через stdin) → `docker compose pull` → `docker compose up -d --wait --wait-timeout 180 --remove-orphans app` → `docker logout ghcr.io` (в любом случае).
    5. `caddy validate` + `caddy reload` edge.
    6. Smoke: `scripts/smoke-health.sh` с `APP_URL=https://${DOMAIN}`; коды curl 35/60 (TLS ещё не выпущен) на первом деплое — warning, как у maxim.
    7. При ошибке: `docker compose ps`, `logs --tail=100 migrate app minio-init`, `docker compose -p edge logs --tail=50 caddy`.
    8. `$GITHUB_STEP_SUMMARY`: коммит, тег, digest, результат smoke.
  - Если упала миграция, `app` не перезапускается и продолжает работать старая версия: в summary это пометить явно.
  - Логирование: `::group::` на каждый шаг, `set +x` вокруг секретов, токен GHCR только через stdin.

- [x] **Task 9: Настройка GitHub и первый деплой** (через `gh`, с подтверждением пользователя) (depends on 8)
  - `gh api` — environment `production` с ограничением на ветку `main`; `gh variable set` `DEPLOY_HOST=95.163.229.132`, `DEPLOY_USER=deploy`, `DEPLOY_DOMAIN=tracker.plwedding.ru`; `gh secret set` `DEPLOY_SSH_KEY` (из `~/.ssh/tasker_deploy`), `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan -t ed25519 95.163.229.132`), `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (`openssl rand -base64 32`).
  - После первого `publish` проверить, что пакеты GHCR привязаны к репозиторию (у `GITHUB_TOKEN` деплой-джоба есть `packages: read`).
  - Первый деплой: пуш в `main` → зелёный workflow → `https://tracker.plwedding.ru/api/health` = `{"status":"ok"}`.
  - Ручная проверка: регистрация с адресом из `ADMIN_EMAILS` получает роль admin; загрузка и скачивание вложения в задаче и комментарии; maxim продолжает работать.

### Phase 4: Эксплуатация

- [x] **Task 10: Резервные копии** — `deploy/tasker/backup.sh`, systemd-таймер (depends on 5)
  - `backup.sh db`: `docker compose exec -T postgres pg_dump -Fc` → `/opt/tasker/backups/db/tasker-<UTC>.dump`, хранить 7 последних. `backup.sh files`: `tar` тома `minio-data` (через одноразовый контейнер `alpine`) → `/opt/tasker/backups/files/`, хранить 2.
  - systemd unit + timer под `deploy`: БД ежедневно, файлы еженедельно; ставит `bootstrap-server.sh`.
  - В README: копии лежат на том же диске и не спасут от потери сервера — следующий шаг — выгрузка вне сервера; команда восстановления (`pg_restore --clean`).
  - Логирование: `[backup] <kind> start|done size=<bytes> file=<path>|fail`, в journald; ненулевой код при ошибке.

<!-- Commit checkpoint: task 10 -->

- [ ] **Task 11: Почта на домене** (в основном действия пользователя; depends on 9)
  - Подключить `plwedding.ru` к Yandex 360 или Mail.ru для бизнеса, создать ящик `no-reply@plwedding.ru`.
  - DNS в reg.ru: MX, SPF (`v=spf1 include:<провайдер> ~all`), DKIM (ключ из панели провайдера), DMARC (`v=DMARC1; p=none; rua=mailto:…`). A-запись `plwedding.ru` (161.104.18.167) не трогать.
  - Пароль приложения → `/opt/tasker/.env`: `SMTP_HOST` (`smtp.yandex.ru` или `smtp.mail.ru`), `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM="Tasker <no-reply@plwedding.ru>"`; `docker compose up -d app`.
  - Проверка: приглашение доходит во «Входящие»; в заголовках письма `spf=pass`, `dkim=pass`. Отдельно проверить, как ведёт себя создание приглашения, пока SMTP не настроен (ошибка видна пользователю, приглашение не теряется молча).
  - Логирование: уже есть в `sendMail()`; убедиться, что при ошибке SMTP в логах есть код ошибки и замаскированный адрес (`maskEmail`).

- [x] **Task 12: Проверка безопасности стека** (depends on 9)
  - Снаружи открыты только 22/80/443 (`nmap` или проверка `/dev/tcp` с внешней машины); MinIO снаружи отвечает только на `/tasker-attachments/*`, анонимный листинг бакета запрещён; `/api/health` не раскрывает лишнего.
  - *Открыто (решение за пользователем):* открытая регистрация — решить, оставить ли её на старте (Better Auth `disableSignUp` или только приглашения) — записать решение в docs; если закрывать, это отдельная задача в коде.
  - Куки `__Secure-` (`useSecureCookies` в production), HSTS отдаётся.

### Phase 5: Документация

- [x] **Task 13: Документация деплоя** (depends on 1–12)
  - `docs/deployment.md`: раздел «Продакшен» — схема (edge-Caddy → app/MinIO, сети), подготовка сервера, переменные GitHub, деплой и откат, бэкапы и восстановление, диагностика; убрать фразу «Образ никуда не публикуется» из описания CI.
  - `docs/configuration.md`: `S3_PUBLIC_ENDPOINT` с путём бакета через прокси, прод-значения SMTP.
  - `AGENTS.md`: каталог `deploy/` (`edge/`, `tasker/`, `bootstrap-server.sh`) в структуре и ключевых точках входа; комментарий в начале `ci.yml`.
  - `README.md`: ссылка на продакшен-раздел.

<!-- Commit checkpoint: task 13 -->

## Риски

- **Память.** На 2 GB RAM одновременно работают maxim, edge, Postgres, MinIO и Next.js. Лимиты заданы, но после первого деплоя нужно посмотреть `docker stats`; если swap используется постоянно — поднимать тариф.
- **Простой maxim** при переезде на edge (задача 3) — несколько минут, пока Caddy выпускает сертификат.
- **Подпись presigned-ссылок через прокси**: если загрузка падает с `SignatureDoesNotMatch`, проверить, что Caddy не переписывает `Host` и путь (никаких `uri strip_prefix` для `/tasker-attachments`).
- **Бэкапы на том же диске** — защита только от ошибок и неудачных миграций, не от потери сервера.
