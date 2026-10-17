import { z } from 'zod';

/**
 * Событие реалтайма: сигнал «в пространстве что-то изменилось». Текстов задач и комментариев
 * в событии нет — только идентификаторы; клиент перезагружает данные обычными запросами
 * с проверкой доступа, поэтому канал не может раскрыть содержимое.
 */

/** Канал Postgres `LISTEN/NOTIFY`. */
export const REALTIME_CHANNEL = 'tasker_events';

/** Лимит payload у `pg_notify` — 8000 байт; оставляем запас на служебные поля. */
export const REALTIME_PAYLOAD_LIMIT_BYTES = 7500;

export const REALTIME_EVENT_KINDS = [
  'task.created',
  'task.updated',
  'task.archived',
  'placement.changed',
  'comment.changed',
  'attachment.changed',
  'resync',
] as const;

export type RealtimeEventKind = (typeof REALTIME_EVENT_KINDS)[number];

const realtimeEventSchema = z.object({
  v: z.literal(1),
  workspaceId: z.string().min(1).max(64),
  kind: z.enum(REALTIME_EVENT_KINDS),
  taskId: z.string().min(1).max(64).optional(),
  taskNumber: z.number().int().positive().optional(),
  projectIds: z.array(z.string().min(1).max(64)),
  /** Список проектов обрезан по лимиту payload — клиенту стоит обновиться в любом случае. */
  truncated: z.boolean().optional(),
  actorId: z.string().min(1).max(64).nullable(),
  /** Время события, мс с эпохи. */
  at: z.number().int().nonnegative(),
});

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

/** Событие без служебных полей — так его передают сервисы. */
export type RealtimeEventInput = Omit<RealtimeEvent, 'v' | 'at' | 'truncated'> & { at?: number };

export function createRealtimeEvent(input: RealtimeEventInput): RealtimeEvent {
  return { ...input, v: 1, at: input.at ?? Date.now() };
}

const byteLength = (value: string) => new TextEncoder().encode(value).length;

/**
 * JSON для `pg_notify`. Если payload не влезает в лимит, список проектов отбрасывается
 * и ставится `truncated` — такое событие подходит любому фильтру.
 */
export function encodeRealtimeEvent(event: RealtimeEvent): string {
  const json = JSON.stringify(event);
  if (byteLength(json) <= REALTIME_PAYLOAD_LIMIT_BYTES) return json;
  return JSON.stringify({ ...event, projectIds: [], truncated: true });
}

/** Разбор payload из канала или из SSE; мусор → `null`. */
export function parseRealtimeEvent(raw: string): RealtimeEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = realtimeEventSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Что интересует подписчика на клиенте: проект (доска, список проекта) или задача (панель). */
export interface RealtimeFilter {
  projectId?: string;
  taskId?: string;
  /** Только события об изменении задач (списки, дашборд), без комментариев и вложений. */
  tasksOnly?: boolean;
}

const TASK_KINDS: ReadonlySet<RealtimeEventKind> = new Set([
  'task.created',
  'task.updated',
  'task.archived',
  'placement.changed',
]);

/** Подходит ли событие фильтру. `resync` и обрезанные события подходят всем. */
export function matchesRealtimeFilter(event: RealtimeEvent, filter: RealtimeFilter): boolean {
  if (event.kind === 'resync') return true;
  if (filter.tasksOnly && !TASK_KINDS.has(event.kind)) return false;
  if (filter.taskId !== undefined && event.taskId === filter.taskId) return true;
  if (filter.projectId !== undefined) {
    return event.truncated === true || event.projectIds.includes(filter.projectId);
  }
  // Фильтр только по задаче: другие задачи не интересны.
  if (filter.taskId !== undefined) return false;
  return true;
}
