# План реализации: `deploy/edge` и bootstrap — общая часть сервера уходит в infra

Branch: none (`git.create_branches: false`, работа в `main`)
Created: 2026-10-21

## Settings
- Testing: no — автотестов нет (shell-скрипты и конфиг Caddy, Vitest их не покрывает). Вместо них — ручная проверка в задаче 6: `sh -n`, shellcheck, прогон скрипта в контейнере, `caddy validate` сайта с Caddyfile из infra.
- Logging: standard — в `bootstrap-app-server.sh` остаётся текущий `log()` с префиксом `[bootstrap]`: одна строка на шаг в формате `<шаг>: ok|skip|fail (<причина>)`, секреты не печатаются. В CI — `::error::` / `::group::`, как в соседних шагах.
- Docs: yes — обязательный docs-чекпоинт в конце: `docs/production.md`, `AGENTS.md`, ссылки на `leha-creator/infra`.

## Roadmap Linkage
Milestone: "Переход на общую инфраструктуру"
Rationale: План закрывает пункт «`deploy/edge` и bootstrap — заменить ссылкой на infra», включая необязательный подпункт про `import access_log`.

## Контекст

С 2026-10-20 общие сервисы сервера `95.163.229.132` применяются из [`leha-creator/infra`](https://github.com/leha-creator/infra) (`D:\work\infra`). Подробности — `infra/docs/tasker-handoff.md`, журнал применения — `infra/docs/apply-log.md`.

- `/opt/edge/{compose.yml,Caddyfile,README.md}` — из `infra/edge` (healthcheck и сниппет `(access_log)`; на сервере уже применено, коммит infra `bfe3205`).
- Подготовка хоста (Docker, `deploy`, ufw, swap, `/opt/edge` и `sites/`, сеть `edge`, MSS clamping, проверки sshd) — `infra/host/bootstrap-server.sh`.
- Вывоз дампов `/opt/tasker/backups/db/tasker-*.dump` в Object Storage — `infra/backups`.

**Главный риск сейчас:** `deploy/bootstrap-server.sh` перезапишет `/opt/edge` старой копией `deploy/edge` (без healthcheck и `(access_log)`). После этого плана общей части в tasker не останется.

Образец — `D:\work\meet\deploy\bootstrap-app-server.sh`: только проверяет edge и падает, если его нет.

### Принятые решения
- Скрипт переименовывается в `deploy/bootstrap-app-server.sh` (как в meet). По имени понятно, что он не готовит хост, а старая команда `sh .../bootstrap-server.sh` перестанет работать, а не запустит что-то не то.
- `tracker.caddy` переходит на `import access_log`. Фильтр секретов presigned-ссылок живёт в одном месте — в infra.
- Контракты CI не меняются: `/opt/edge/sites/tracker.caddy`, `cd /opt/edge && docker compose exec -T caddy caddy validate|reload ...`, алиас `tasker-app` в сети `edge`, дампы `tasker-*.dump` в `/opt/tasker/backups/db` (права каталога `db` скрипт не трогает).

### Перед началом
В рабочем дереве уже есть незакоммиченные правки другой задачи (шаг `Prune old images` в `.github/workflows/ci.yml`, раздел «Место на диске» в `docs/production.md`, строка про `507` в `docs/agents.md`, `.ai-factory/ROADMAP.md`, патчи). Эти же файлы правят задачи 3 и 5. **Сначала закоммитить те правки отдельно** (или явно согласовать, что они едут вместе), чтобы коммиты этого плана не смешались с ними.

## Commit Plan
- **Commit 1** (после задач 1–4): `refactor(deploy): move shared edge and host setup to infra`
- **Commit 2** (после задач 5–6): `docs(deploy): bootstrap infra first, link edge contracts`

## Tasks

### Phase 1: Скрипт и файлы деплоя

- [x] **Task 1: `bootstrap-app-server.sh` — только часть tasker**
  `git mv deploy/bootstrap-server.sh deploy/bootstrap-app-server.sh`, затем переделать:
  - Убрать: блок «edge-прокси» (`install -d` для `/opt/edge` и `/opt/edge/sites`, копирование `compose.yml`, `Caddyfile`, `README.md`), `docker network create edge`, блок MSS clamping, блок «проверки SSH». Из проверки обязательных файлов убрать `edge/compose.yml` и `edge/Caddyfile`. Вместо них проверять `tasker/.env.example`, `tasker/backup.sh`, `tasker/reminders.sh`, `tasker/cleanup.sh` и `tasker/systemd/tasker-backup@.service` (сейчас `reminders.sh` и `cleanup.sh` не проверяются, хотя `install` их ждёт).
  - Добавить проверки перед любыми изменениями, по образцу meet. Каждая падает с `exit 1` и подсказкой «run infra/host/bootstrap-server.sh first»:
    - root (уже есть);
    - пользователь `$DEPLOY_USER` (уже есть, добавить подсказку);
    - `command -v docker` → `fail: docker is not installed`;
    - `docker network inspect edge` → `fail: docker network edge does not exist (edge proxy is not set up)`;
    - `[ -d "$EDGE_DIR/sites" ]` → `fail: $EDGE_DIR/sites does not exist (edge proxy is not set up)`.
    При успехе — одна строка `edge proxy: ok (network edge, /opt/edge/sites)`. `EDGE_DIR=/opt/edge` остаётся только для проверки, скрипт в него ничего не пишет.
  - Без изменений: `/opt/tasker` и `backups/` (права `750` только у этих двух каталогов, `backups/db` не трогать), установка `backup.sh`, `reminders.sh`, `cleanup.sh`, ключ `TASKER_DEPLOY_PUBKEY`, генерация `.env` (существующий не меняется), systemd-таймеры `tasker-backup-db`, `tasker-backup-files`, `tasker-reminders`, `tasker-cleanup`.
  - Шапку переписать: сервер уже подготовлен infra, общий edge не меняется; пример запуска — `scp -r deploy root@<host>:/tmp/tasker-deploy`, `sh /tmp/tasker-deploy/bootstrap-app-server.sh`; список «Что делает» — без edge и MSS.
  - Последняя строка: `log "done. Next: run the deploy workflow (see docs/production.md)"` вместо отсылки к `$EDGE_DIR/README.md` и переезду с maxim.
  - Остаётся POSIX `sh` с `set -eu`, как сейчас.
  Логирование: `log()` с `[bootstrap]`, по строке на шаг (`ok` / `skip` / `fail` с причиной), секреты не выводятся.

- [x] **Task 2: удалить общие файлы**
  `git rm -r deploy/edge deploy/host` (`Caddyfile`, `compose.yml`, `README.md`, `docker-mss-clamp.service`). Перед удалением сверить с `D:\work\infra\edge` и `D:\work\infra\host`: если в tasker есть что-то, чего нет в infra, — не удалять молча, а сообщить пользователю (по `tasker-handoff.md` расхождений быть не должно, в infra файлы новее).
  Зависит от: задачи 1 (скрипт больше не ссылается на `edge/` и `host/`).
  Логирование: не требуется.

- [x] **Task 3: `tracker.caddy` на сниппете infra и проверка в CI**
  - `deploy/tasker/tracker.caddy`: блок `log { ... }` целиком заменить на `import access_log`. Оставить комментарий, зачем фильтр («в query presigned-ссылок — подпись: фильтр в сниппете `access_log` edge-прокси, `infra/edge/Caddyfile`»). Шапку файла поправить: edge-прокси — из `leha-creator/infra`, а не `deploy/edge`.
  - `.github/workflows/ci.yml`, джоб `deploy`:
    - в шаге `Configure SSH` поменять текст ошибки про отсутствующий `.env`: `run infra/host/bootstrap-server.sh, then deploy/bootstrap-app-server.sh`;
    - в начало шага `Upload stack files`, до записи `${EDGE_DIR}/sites/tracker.caddy`, добавить проверку: `ssh target "grep -q '^(access_log)' ${EDGE_DIR}/Caddyfile" || { echo "::error::${EDGE_DIR}/Caddyfile has no (access_log) snippet: apply infra/edge first"; exit 1; }`. Без неё на сервере со старым Caddyfile деплой сначала перепишет сайт, а потом упадёт на `caddy validate`. Сломанный `tracker.caddy` останется в `sites/`, и `reload` любого другого проекта тоже будет падать.
    - Остальные команды (`validate` и `reload` в `/opt/edge`, путь сайта) не трогать.
  Логирование: `::error::` с причиной и подсказкой, как у соседних проверок.

- [x] **Task 4: ссылки в комментариях `deploy/tasker`**
  Заменить `deploy/bootstrap-server.sh` на `deploy/bootstrap-app-server.sh`, а `deploy/edge` — на «edge-прокси из `leha-creator/infra`»:
  - `deploy/tasker/compose.yml` (строки 5, 11 и 168: «Общая сеть edge-прокси (deploy/edge/compose.yml)» → `infra/edge/compose.yml`, сеть создаёт `infra/host/bootstrap-server.sh`);
  - `deploy/tasker/backup.sh`, `reminders.sh`, `cleanup.sh`, `.env.example`;
  - после правок `rg -n "bootstrap-server|deploy/edge|deploy/host" deploy .github` должен находить только упоминания `infra/host/bootstrap-server.sh`.
  Логирование: не требуется (комментарии).

### Phase 2: Документация и проверка

- [x] **Task 5: документация**
  - `docs/production.md`:
    - вступление: рядом со стендом maxim упомянуть meet; добавить фразу, что общие сервисы сервера (edge-прокси, подготовка хоста, вывоз дампов) живут в [`leha-creator/infra`](https://github.com/leha-creator/infra);
    - таблица «Что где лежит»: `/opt/edge/` — «из `infra/edge`, контракты — `edge/README.md` infra», «кто меняет» — «infra вручную, сайты — CI проектов»; строки `.env` и таймеров — `bootstrap-app-server.sh`; `docker-mss-clamp.service` — «`infra/host/bootstrap-server.sh`»;
    - «Таймауты SMTP из контейнера (MTU)»: правило ставит infra (`infra/host`, раздел «MSS clamping» его README), проверочная команда остаётся;
    - разделы напоминаний и очистки: `bootstrap-server.sh` → `bootstrap-app-server.sh`, `/tmp/tasker-deploy/...` — без изменений;
    - «Новый сервер»: шаг 1 — `infra/host/bootstrap-server.sh` (Docker, `deploy`, ufw, swap, `/opt/edge`, сеть `edge`, MSS) и запуск edge по `infra/edge/README.md`; шаг 2 — `bootstrap-app-server.sh`. Явно: «сначала bootstrap infra, потом этот; без сети `edge` и `/opt/edge/sites` скрипт остановится». Шаг 3 (`cd /opt/edge && docker compose up -d`) убрать: это часть infra. Опору на `bootstrap.sh` из maxim убрать;
    - добавить короткий список контрактов, на которые опирается CI tasker (как в «Принятых решениях»), со ссылкой на «Неизменяемые контракты» в `infra/edge/README.md`;
    - «See Also»: ссылку на `deploy/edge/README.md` заменить на `infra/edge/README.md` (GitHub) и добавить `infra/host/README.md`.
  - `AGENTS.md`, дерево `deploy/`: убрать строки `host/` и `edge/`, `bootstrap-server.sh` → `bootstrap-app-server.sh` («каталог /opt/tasker, ключ деплоя, .env, таймеры; сервер и edge готовит leha-creator/infra»), в строке `deploy/` добавить «общая часть сервера — leha-creator/infra».
  - `docs/deployment.md` и `README.md` проверить через `rg`. Сейчас ссылок на `deploy/edge` в них нет; если найдутся — поправить так же.
  - `.ai-factory/ROADMAP.md`: пункт отмечает `/aif-implement` или `/aif-roadmap` по завершении, в этом плане его не трогать.
  Зависит от: задач 1–4.
  Логирование: не требуется.

- [x] **Task 6: проверка**
  Только локально, на сервере ничего не запускать.
  - `sh -n deploy/bootstrap-app-server.sh`; shellcheck — `docker run --rm -v "$PWD/deploy:/mnt:ro" koalaman/shellcheck:stable -s sh /mnt/bootstrap-app-server.sh /mnt/tasker/*.sh`. Новых предупреждений быть не должно.
  - Прогон в одноразовом контейнере (`alpine` с `docker-cli` и `openssl`, каталог `deploy` смонтирован только на чтение, без сокета Docker):
    1. без пользователя `deploy` — падает с `fail: user deploy does not exist`;
    2. `adduser -D deploy`, без сокета Docker — падает на проверке сети `edge` (или на проверке `docker`, если `docker-cli` не ставить), до создания `/opt/tasker`; проверить, что `/opt/tasker` не появился.
    Секреты в выводе не печатаются. Полный успешный прогон не обязателен: части после проверок не менялись.
  - `caddy validate` сайта с Caddyfile из infra: во временном каталоге (scratchpad) — `Caddyfile` из `D:\work\infra\edge\Caddyfile`, `sites/tracker.caddy` из `deploy/tasker/tracker.caddy` с `__DOMAIN__` → `tracker.example.com`. Запуск — `docker run --rm -v <tmp>/Caddyfile:/etc/caddy/Caddyfile:ro -v <tmp>/sites:/etc/caddy/sites:ro caddy:2 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` (тот же мажор, что в `infra/edge/compose.yml`). Upstream-имена (`tasker-app`) validate не резолвит.
  - `rg -n "bootstrap-server\.sh|deploy/edge|deploy/host" --glob '!.ai-factory/{plans,patches,archive}/**'` — остаются только ссылки на `infra/host/bootstrap-server.sh` и строки роадмапа.
  - `pnpm check` не нужен (TS-код не менялся); YAML CI проверить `actionlint`, если он есть, иначе внимательно прочитать diff.
  - После пуша в `main` (по правилу проекта пуш = деплой) следить за джобом `deploy`: шаг с проверкой `(access_log)` проходит, `caddy validate`/`reload` зелёные, `https://tracker.plwedding.ru/api/health` — 200, в `docker compose -p edge logs caddy` access-лог по-прежнему JSON без `X-Amz-Signature`.
  Зависит от: задач 1–5.
  Логирование: результаты проверок — в отчёте `/aif-implement`.
