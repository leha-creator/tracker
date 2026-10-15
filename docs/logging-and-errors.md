[← Архитектура](architecture.md) · [Back to README](../README.md) · [Разработка →](development.md)

# Логирование и ошибки

## Логирование

Используется [pino](https://getpino.io). `console.*` в `src/` запрещён линтером.

### Использование

```ts
import { createLogger } from '@/shared/logger';

const log = createLogger('tasks'); // поле scope во всех записях

log.debug({ taskId, projectId }, '[movePlacement] start');
log.info({ taskId }, '[movePlacement] moved');
log.warn({ taskId, reason }, '[movePlacement] rejected');
log.error({ err: error, taskId }, '[movePlacement] failed');
```

Соглашения:

- первый аргумент — объект с данными, второй — сообщение в формате `[Scope.method] текст`;
- ошибки передаются в поле `err`, сериализатор добавляет `type`, `message` и `stack`;
- `createLogger` можно вызывать на уровне модуля: корневой логгер создаётся при первой записи.

### Уровни

| `LOG_LEVEL` | Что видно |
|-------------|-----------|
| `trace` / `debug` | Всё, включая SQL-запросы (`[db.query]`) и шаги health check. По умолчанию в dev |
| `info` | Ключевые события: инициализация клиентов, итог health check. По умолчанию в production |
| `warn` | Доменные ошибки, медленные запросы (≥ 200 мс), `degraded` |
| `error` | Непредвиденные ошибки со стеком |
| `silent` | Ничего (используется в тестах) |

### Формат вывода

| Окружение | Формат |
|-----------|--------|
| `development` | Цветной человекочитаемый вывод (`pino-pretty`, синхронный поток) |
| `production`, `test` | JSON в stdout: `{"level":30,"time":"...","app":"tasker","scope":"tasks","msg":"..."}` |

### Что не логируется

- Значения по ключам `password`, `token`, `secret`, `authorization`, `cookie`, `accessKeyId`, `secretAccessKey` (на верхнем уровне и на один уровень вложенности) заменяются на `[REDACTED]`. Полный список — `REDACT_PATHS` в `src/shared/logger/logger.ts`.
- Параметры SQL-запросов: логируется только текст запроса и длительность.
- Ключи доступа S3.

## Ошибки

### Классы

Все ошибки наследуются от `AppError` (`src/shared/errors/app-error.ts`):

| Класс | `code` | HTTP | Сообщение видно клиенту |
|-------|--------|------|-------------------------|
| `ValidationError` | `VALIDATION_ERROR` | 400 | да (+ `fieldErrors`) |
| `UnauthorizedError` | `UNAUTHORIZED` | 401 | да |
| `ForbiddenError` | `FORBIDDEN` | 403 | да |
| `NotFoundError` | `NOT_FOUND` | 404 | да |
| `ConflictError` | `CONFLICT` | 409 | да (+ `fieldErrors`) |
| `InternalError` | `INTERNAL_ERROR` | 500 | нет |

```ts
throw new NotFoundError('Проект не найден');
throw new ValidationError('Проверьте поля', { fieldErrors: { email: ['Некорректный email'] } });
throw new ConflictError('Адрес занят', { fieldErrors: { slug: ['Этот адрес уже занят'] } });
throw new InternalError('S3 upload failed', { cause: error }); // клиент увидит общее сообщение
```

### Server Actions → `ActionResult<T>`

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> } };
```

```ts
export async function createProjectAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const input = createProjectSchema.parse(raw); // ZodError → VALIDATION_ERROR + fieldErrors
    const project = await createProject(await getSession(), input);
    return ok({ id: project.id });
  } catch (error) {
    return toActionError(error, { action: 'createProject' });
  }
}
```

На клиенте: `if (!result.ok) toast.error(result.error.message)`. Для форм используйте `result.error.fieldErrors`.

### Route Handlers → `toErrorResponse`

```ts
export async function GET() {
  try {
    // ...
  } catch (error) {
    return toErrorResponse(error, { route: 'GET /api/...' });
    // → HTTP 404 { "error": { "code": "NOT_FOUND", "message": "..." } }
  }
}
```

### Как преобразуется ошибка

| Исходная ошибка | Ответ клиенту | Лог |
|-----------------|---------------|-----|
| `ZodError` | `VALIDATION_ERROR`, `fieldErrors` по путям полей | `WARN` + `DEBUG` с полями |
| `AppError` с `expose: true` (4xx) | `code`, `message` и `fieldErrors`, если заданы | `WARN` (+ `DEBUG` с полями) |
| `InternalError`, любая другая ошибка, не-`Error` | `INTERNAL_ERROR`, «Внутренняя ошибка сервера» | `ERROR` со стеком |

Стектрейсы и внутренние сообщения (ошибки Prisma, сети, S3) клиенту не передаются.

## See Also

- [Архитектура](architecture.md): где ловить ошибки (actions, route handlers)
- [Конфигурация](configuration.md): переменная `LOG_LEVEL`
- [Разработка](development.md): тесты логгера и ошибок
