# Архитектура: Structured Modules (Vertical Slices)

## Обзор

Tasker строится как модульный монолит на Next.js. Код разделён на доменные модули (`workspaces`, `projects`, `tasks`, `documents`, `integrations/github`). Внутри модуля код сгруппирован в срезы по сущностям: `task`, `placement`, `comment`, `attachment` и т.д. В каждом срезе лежат свои Server Actions, сервис и репозиторий. Бизнес-правила и инварианты сосредоточены в «богатых» доменных моделях, а сервисы только оркестрируют сценарии: загрузить, проверить доступ, вызвать метод модели, сохранить.

Паттерн выбран потому, что домен средней сложности: двухуровневые роли, задача в нескольких проектах со своим статусом в каждом, документы и интеграция с GitHub. Для плоских слоёв это слишком сложно, а полноценная Explicit Architecture с портами избыточна на старте. Структура позволяет позже вынести модуль в Explicit Architecture, не переписывая остальные.

## Обоснование решения

- **Тип проекта:** веб-приложение таск-трекер, мультиарендность через workspace
- **Стек:** TypeScript, Next.js (App Router), PostgreSQL, Prisma, Better Auth
- **Ключевой фактор:** независимые доменные области (задачи, документы, GitHub) с жёсткими границами и единым слоем авторизации при сохранении скорости разработки

## Структура папок

```
tasker/
├── prisma/
│   ├── schema.prisma                 # Единая схема БД
│   └── migrations/
├── src/
│   ├── app/                          # ── ПРЕДСТАВЛЕНИЕ (Next.js) — тонкий слой ──
│   │   ├── (auth)/                   # login, register, accept-invite
│   │   ├── (app)/
│   │   │   ├── w/[workspaceSlug]/
│   │   │   │   ├── projects/[projectId]/board/page.tsx   # Канбан
│   │   │   │   ├── projects/[projectId]/list/page.tsx    # Список
│   │   │   │   ├── tasks/[taskId]/page.tsx
│   │   │   │   ├── docs/[[...docPath]]/page.tsx          # Документация
│   │   │   │   └── settings/members/page.tsx
│   │   │   └── admin/                # Глобальная админка (роль ADMIN)
│   │   └── api/
│   │       ├── auth/[...all]/route.ts         # Better Auth handler
│   │       └── webhooks/github/route.ts       # GitHub webhooks
│   │
│   ├── modules/                      # ── ДОМЕННЫЕ МОДУЛИ ──
│   │   ├── workspaces/
│   │   │   ├── slices/
│   │   │   │   ├── workspace/        # workspace.actions.ts, workspace.service.ts, workspace.repository.ts
│   │   │   │   ├── member/           # выдача/отзыв доступа, роли
│   │   │   │   └── invitation/       # приглашения
│   │   │   ├── models/               # Workspace, Membership (правила ролей)
│   │   │   └── index.ts              # Публичный API модуля
│   │   │
│   │   ├── projects/
│   │   │   ├── slices/
│   │   │   │   ├── project/
│   │   │   │   └── status/           # настраиваемые статусы (колонки)
│   │   │   ├── models/
│   │   │   └── index.ts
│   │   │
│   │   ├── tasks/
│   │   │   ├── slices/
│   │   │   │   ├── task/             # CRUD задачи, срок, приоритет, ответственный
│   │   │   │   ├── placement/        # размещение задачи в проекте: статус + позиция
│   │   │   │   ├── comment/
│   │   │   │   ├── attachment/
│   │   │   │   └── views/            # запросы для канбана и списка (read-модели)
│   │   │   ├── models/               # Task, TaskPlacement, Priority
│   │   │   └── index.ts
│   │   │
│   │   ├── documents/
│   │   │   ├── slices/
│   │   │   │   ├── document/         # страницы, иерархия, контент (Tiptap JSON)
│   │   │   │   └── task-link/        # связь документ ↔ задача
│   │   │   ├── models/
│   │   │   └── index.ts
│   │   │
│   │   └── integrations/
│   │       └── github/
│   │           ├── slices/
│   │           │   ├── webhook/      # проверка подписи, разбор событий
│   │           │   └── pr-link/      # TaskPullRequest
│   │           ├── models/
│   │           └── index.ts
│   │
│   ├── components/                   # ── ОБЩИЙ UI ──
│   │   ├── ui/                       # shadcn/ui (генерируется CLI)
│   │   └── ...                       # общие компоненты (kanban-board, task-table)
│   │
│   └── shared/                       # ── СКВОЗНОЕ (минимально) ──
│       ├── db/                       # Prisma client (singleton)
│       ├── auth/                     # Better Auth config, getSession()
│       ├── access/                   # requireWorkspaceAccess(), requireAdmin()
│       ├── errors/                   # AppError, NotFoundError, ForbiddenError, toActionError()
│       ├── storage/                  # S3-клиент, presigned URL
│       ├── logger/                   # pino, LOG_LEVEL
│       ├── env/                      # Zod-валидация переменных окружения (ленивая)
│       ├── health/                   # checkHealth(): агрегирует checkDatabase/checkStorage для /api/health
│       └── types/                    # ActionResult<T> и пр.
│   └── generated/prisma/             # Сгенерированный Prisma Client (не коммитится)
└── ...
```

Файлы внутри среза: `<entity>.actions.ts` (Server Actions — роль контроллера), `<entity>.service.ts`, `<entity>.repository.ts`, `<entity>.schema.ts` (Zod), при необходимости `use-cases/`.

## Правила зависимостей

Направление: `app/` → `*.actions.ts` → `*.service.ts` → (`models/`, `*.repository.ts`) → `shared/db`.

- ✅ `app/` (страницы, route handlers) вызывает только публичный API модулей (`@/modules/<module>`): actions и read-функции
- ✅ Actions валидируют вход (Zod), получают сессию и вызывают сервис
- ✅ Сервисы проверяют доступ через `shared/access`, вызывают методы моделей, сохраняют через репозиторий
- ✅ Модели — чистый TypeScript без Prisma, Next.js и React
- ✅ Модуль импортирует другой модуль только через его `index.ts`
- ✅ `integrations/github` зависит от `tasks`, но `tasks` не зависит от `integrations/github`
- ❌ Компоненты и страницы не импортируют `prisma` и репозитории
- ❌ Actions не вызывают репозитории в обход сервиса
- ❌ Модели не импортируют сервисы, репозитории и `@prisma/client`
- ❌ Нет импортов из внутренностей чужого модуля (`@/modules/tasks/slices/...` снаружи `tasks`)
- ❌ Нет циклов между модулями

## Взаимодействие слоёв и модулей

- **Чтение для UI:** Server Components вызывают read-функции модуля (`getBoardForProject`, `listTasks`). Те проверяют доступ и возвращают DTO, а не Prisma-объекты.
- **Изменения:** клиентские компоненты вызывают Server Actions. Action возвращает `ActionResult<T>` (`{ ok: true, data } | { ok: false, error: { code, message } }`) и делает `revalidatePath`/`revalidateTag`.
- **Межмодульные вызовы:** через публичный API (`index.ts`) модуля-поставщика. Если нужно избежать обратной зависимости, используются колбэки или простые доменные события в памяти: например, `tasks` не знает о GitHub, а GitHub-модуль сам подписывается на нужное.
- **Транзакции:** если операция затрагивает несколько агрегатов (перемещение карточки с пересчётом позиций), репозиторий принимает `Prisma.TransactionClient`, а сервис открывает `prisma.$transaction`.
- **Авторизация:** централизована в `shared/access`. Каждый сервисный метод, работающий с данными пространства, первым делом вызывает `requireWorkspaceAccess(session, workspaceId, minRole)`.

## Ключевые принципы

1. **Изоляция по workspace.** Каждый запрос к данным пространства фильтруется по `workspaceId`. Ресурс, загруженный по `id`, проверяется на принадлежность пространству (защита от IDOR).
2. **Статус хранится в размещении, а не в задаче.** `TaskPlacement(taskId, projectId, statusId, position)` — единственный источник статуса и порядка. Правила перемещения (статус принадлежит проекту, проект — пространству задачи) реализованы в модели `TaskPlacement`.
3. **Богатые модели.** Инварианты (нельзя удалить последнего владельца, нельзя назначить ответственным не участника пространства, приглашение истекает) живут в моделях. Сервисы их только вызывают.
4. **Тонкий `app/`.** Страницы и route handlers только связывают UI и модули, бизнес-логики в них нет.
5. **Интеграции на периферии.** GitHub и файловое хранилище подключаются через адаптеры в `integrations/` и `shared/storage`. Ядро задач работает без них.
6. **`shared/` минимален.** Туда попадает только сквозная инфраструктура. Доменная логика в `shared/` — сигнал, что не хватает модуля.

## Примеры кода

### Богатая модель: размещение задачи в проекте

```typescript
// src/modules/tasks/models/task-placement.ts
import { ValidationError } from '@/shared/errors';

export class TaskPlacement {
  constructor(
    readonly taskId: string,
    readonly projectId: string,
    private _statusId: string,
    private _position: string, // lexorank / дробная позиция
  ) {}

  get statusId() { return this._statusId; }
  get position() { return this._position; }

  moveTo(target: { statusId: string; statusProjectId: string; position: string }) {
    if (target.statusProjectId !== this.projectId) {
      throw new ValidationError('Статус не принадлежит проекту этого размещения');
    }
    this._statusId = target.statusId;
    this._position = target.position;
  }
}
```

### Сервис: оркестрация без бизнес-правил

```typescript
// src/modules/tasks/slices/placement/placement.service.ts
import { prisma } from '@/shared/db';
import { requireWorkspaceAccess, type Session } from '@/shared/access';
import { NotFoundError } from '@/shared/errors';
import { positionBetween } from '../../models/position';
import { placementRepository } from './placement.repository';

export async function movePlacement(
  session: Session,
  input: { taskId: string; projectId: string; statusId: string; beforeId?: string; afterId?: string },
) {
  return prisma.$transaction(async (tx) => {
    const placement = await placementRepository.find(tx, input.taskId, input.projectId);
    if (!placement) throw new NotFoundError('Размещение не найдено');

    await requireWorkspaceAccess(session, placement.workspaceId, 'MEMBER');

    const status = await placementRepository.findStatus(tx, input.statusId);
    const neighbours = await placementRepository.findPositions(tx, input.beforeId, input.afterId);

    placement.model.moveTo({
      statusId: status.id,
      statusProjectId: status.projectId,
      position: positionBetween(neighbours.before, neighbours.after),
    });

    await placementRepository.save(tx, placement.model);
    return placement.model;
  });
}
```

### Server Action: валидация, сессия, единый формат ошибки

```typescript
// src/modules/tasks/slices/placement/placement.actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/shared/auth';
import { toActionError, type ActionResult } from '@/shared/errors';
import { movePlacementSchema } from './placement.schema';
import { movePlacement } from './placement.service';

export async function movePlacementAction(raw: unknown): Promise<ActionResult<null>> {
  try {
    const input = movePlacementSchema.parse(raw);
    const session = await getSession();
    await movePlacement(session, input);
    revalidatePath(`/w/[workspaceSlug]/projects/${input.projectId}/board`, 'page');
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error); // доменные ошибки → { code, message }, остальное логируется
  }
}
```

### Правило зависимостей: публичный API модуля

```typescript
// src/modules/tasks/index.ts — единственная точка входа для других модулей и app/
export { movePlacementAction } from './slices/placement/placement.actions';
export { getBoardForProject, listTasks } from './slices/views/views.queries';
export type { BoardDto, TaskListItemDto } from './slices/views/views.dto';

// ✅ src/app/(app)/w/[workspaceSlug]/projects/[projectId]/board/page.tsx
import { getBoardForProject } from '@/modules/tasks';

// ❌ Обход публичного API и прямой доступ к БД из страницы
import { placementRepository } from '@/modules/tasks/slices/placement/placement.repository';
import { prisma } from '@/shared/db';
```

## Анти-паттерны

- ❌ **Prisma в компонентах и страницах.** Обходит авторизацию и границы модулей.
- ❌ **Проверка прав только в UI.** Скрытая кнопка не защищает: каждый сервисный метод проверяет доступ сам.
- ❌ **`status` в таблице `Task`.** Ломает размещение задачи в нескольких проектах.
- ❌ **Анемичные модели и толстые сервисы.** Правила ролей и перемещений в `if`-ах сервиса вместо методов модели.
- ❌ **Возврат Prisma-объектов клиенту.** Утекают лишние поля; отдавайте DTO.
- ❌ **Зависимость ядра от GitHub.** `tasks` не импортирует `integrations/github`.
- ❌ **Пересчёт позиций всех карточек колонки при каждом перемещении.** Используйте lexorank/дробные позиции.
- ❌ **Разрастание `shared/`.** Доменная логика туда не кладётся.
