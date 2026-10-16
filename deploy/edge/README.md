# Edge-прокси сервера

Один Caddy на портах 80/443 для всех проектов сервера (tasker, maxim). Выпускает и продлевает сертификаты Let's Encrypt и проксирует запросы в контейнеры проектов по общей docker-сети `edge`.

```
интернет ──► edge-caddy-1 (80/443) ──► сеть edge ──► tasker-app:3000, tasker-minio:9000
                                                 └─► maxim-mockapi:8080
```

Конфиг применяется вручную, не из CI проектов: он общий, и случайный деплой одного проекта не должен ломать прокси остальных.

## Файлы на сервере

| Путь | Владелец | Назначение |
|------|----------|------------|
| `/opt/edge/compose.yml` | `root:deploy` | Сервис `caddy`, сеть `edge` |
| `/opt/edge/Caddyfile` | `root:deploy` | Глобальные настройки и `import /etc/caddy/sites/*.caddy` |
| `/opt/edge/sites/` | `root:deploy`, `2775` | Файлы сайтов проектов; `deploy` может писать (CI проектов) |

Каталог и права создаёт `deploy/bootstrap-server.sh`.

## Запуск и обновление

```sh
cd /opt/edge
docker compose up -d
docker compose ps
```

После изменения `Caddyfile` или любого файла в `sites/`:

```sh
docker compose -p edge exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose -p edge exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

`reload` применяет конфиг без простоя; при ошибке в конфиге Caddy продолжает работать со старым.

## Как подключить проект

1. Сервис проекта подключается к сети `edge` с уникальным алиасом — имена сервисов разных проектов в общей сети не должны пересекаться:

   ```yaml
   services:
     app:
       networks:
         default: {}
         edge:
           aliases: [myproject-app]
   networks:
     edge:
       external: true
       name: edge
   ```

2. Файл сайта `/opt/edge/sites/<project>.caddy` с полным доменом (переменные окружения проекта edge-Caddy не видит, поэтому домен подставляется при копировании):

   ```caddy
   myproject.example.com {
   	reverse_proxy myproject-app:3000
   }
   ```

3. `caddy reload` (см. выше).

## Логи

```sh
docker compose -p edge logs --tail=100 -f caddy
```

Логи — JSON; ротация docker `json-file` по 10 MB, 3 файла.

## Переезд с Caddy в стеке maxim

Раньше 80/443 занимал `maxim-caddy-1` из `/opt/maxim`. Порядок переключения (простой maxim — пока выпускается сертификат):

1. Смержить в maxim изменения: без сервиса `caddy`, `mockapi` в сети `edge`, файл сайта `deploy/maxim.caddy`.
2. `cd /opt/maxim && docker compose stop caddy`
3. `cd /opt/edge && docker compose up -d`
4. Запустить деплой maxim (workflow `deploy`) — он положит `sites/maxim.caddy` и сделает reload.
5. Проверить домен maxim по HTTPS, затем `cd /opt/maxim && docker compose rm -f caddy` и `docker volume rm maxim_caddy_data maxim_caddy_config`.
