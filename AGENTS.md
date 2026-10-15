# AGENTS.md

> Структурная карта проекта для AI-агентов и новых разработчиков. Обновляйте при существенных изменениях структуры.

## Обзор проекта

Tasker — простой таск-трекер с рабочими пространствами, ролями (admin / владелец пространства / участник), канбан-доской и списком задач; задача может находиться в нескольких проектах со своим статусом в каждом. Подробности — в [`.ai-factory/DESCRIPTION.md`](.ai-factory/DESCRIPTION.md).

## Технологический стек

- **Язык программирования:** TypeScript
- **Фреймворк:** Next.js (App Router)
- **База данных:** PostgreSQL
- **ORM:** Prisma
- **Аутентификация:** Better Auth (плагины `organization`, `admin`)
- **UI:** Tailwind CSS + shadcn/ui

## Структура проекта

Код приложения ещё не создан. Текущее содержимое репозитория:

```
tasker/
├── .ai-factory/            # Контекст AI Factory
│   ├── config.yaml         # Настройки (язык, пути, git-workflow)
│   ├── DESCRIPTION.md      # Спецификация проекта и стек
│   ├── ARCHITECTURE.md     # Архитектурные правила
│   └── rules/base.md       # Базовые соглашения по коду
├── .claude/
│   ├── skills/             # Скиллы агента (aif-* + внешние)
│   └── agents/             # Субагенты AI Factory
├── .mcp.json               # MCP-серверы (github, postgres, filesystem, playwright, chrome-devtools)
├── skills-lock.json        # Зафиксированные версии внешних скиллов
└── AGENTS.md               # Этот файл
```

## Ключевые точки входа

| Файл | Назначение |
|------|------------|
| `.ai-factory/DESCRIPTION.md` | Требования, доменная модель, стек |
| `.ai-factory/ARCHITECTURE.md` | Архитектурный паттерн и структура папок |
| `.mcp.json` | Конфигурация MCP-серверов |

## Документация

| Документ | Путь | Описание |
|----------|------|----------|
| — | — | Документация будет создана через `/aif-docs` |

## Файлы AI-контекста

| Файл | Назначение |
|------|------------|
| AGENTS.md | Структурная карта проекта (этот файл) |
| .ai-factory/DESCRIPTION.md | Спецификация проекта и технологический стек |
| .ai-factory/ARCHITECTURE.md | Архитектурные решения и правила зависимостей |
| .ai-factory/rules/base.md | Соглашения об именовании, ошибках, логировании |

## Правила для агентов

- Не объединяйте shell-команды через `&&` — выполняйте их по отдельности
  - Неправильно: `git checkout main && git pull`
  - Правильно: сначала `git checkout main`, затем `git pull origin main`
- Все запросы к данным фильтруются по `workspaceId` с проверкой членства и роли пользователя
- Не обращайтесь к Prisma из React-компонентов напрямую — только через серверные сервисы модулей

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
