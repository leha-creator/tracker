# Базовые правила проекта

> Кода в проекте пока нет — правила заданы на основе выбранного стека (TypeScript, Next.js, Prisma). После появления кода уточните их через `/aif-rules`.

## Соглашения об именовании

- Файлы: `kebab-case` (`task-card.tsx`, `task-service.ts`); служебные файлы Next.js — по конвенции фреймворка (`page.tsx`, `layout.tsx`, `route.ts`)
- Переменные: `camelCase`
- Функции: `camelCase`, глаголом (`createTask`, `moveTaskPlacement`)
- Классы, типы, React-компоненты: `PascalCase`
- Константы: `UPPER_SNAKE_CASE`
- Prisma-модели: `PascalCase` в единственном числе (`Task`, `TaskPlacement`), поля — `camelCase`

## Структура модулей

- Код группируется по доменным модулям (workspaces, projects, tasks, comments, attachments, documents, integrations/github)
- UI (`app/`, компоненты) не обращается к Prisma напрямую — только через серверные сервисы модуля
- Проверка доступа (workspace membership, роли) — в общем слое авторизации, вызывается в каждом серверном действии
- Общие Zod-схемы используются и для форм, и для серверной валидации

## Обработка ошибок

- Доменные ошибки — собственные классы (`NotFoundError`, `ForbiddenError`, `ValidationError`)
- Server Actions и Route Handlers возвращают единый формат ошибки `{ code, message }`, без утечки стектрейсов клиенту
- Ошибки валидации Zod преобразуются в ошибки полей формы

## Логирование

- Структурированный логгер (например, pino), уровень через `LOG_LEVEL`
- Без `console.log` в production-коде
- Не логировать секреты, токены, содержимое файлов
