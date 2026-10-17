import { z } from 'zod';

import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from './task-priority';

/**
 * История изменений задачи. Запись хранит снимок имён (участники, проекты, статусы, метки), а не
 * только id: история переживает переименования и удаления, как payload уведомлений.
 */

/** Виды изменений. Порядок совпадает с enum TaskHistoryKind в схеме; новые — только в конец. */
export const TASK_HISTORY_KINDS = [
  'created',
  'title',
  'description',
  'priority',
  'due_date',
  'assignee',
  'status',
  'project_added',
  'project_removed',
  'parent',
  'labels',
  'archived',
  'restored',
] as const;
export type TaskHistoryKind = (typeof TASK_HISTORY_KINDS)[number];

/** Окно слияния подряд идущих правок одного поля одним автором. */
export const HISTORY_MERGE_WINDOW_MS = 5 * 60_000;
/** Поля, правки которых сливаются: их правят по букве или по клику подряд. */
const MERGEABLE_KINDS: ReadonlySet<TaskHistoryKind> = new Set([
  'title',
  'description',
  'priority',
  'due_date',
]);

/** Сколько записей показывать без «Показать всю историю». */
export const TASK_HISTORY_PAGE_SIZE = 20;

const namedRef = z.object({ id: z.string(), name: z.string() });
export type HistoryNamedRef = z.infer<typeof namedRef>;

const taskRef = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  key: z.string(),
  title: z.string(),
});
export type HistoryTaskRef = z.infer<typeof taskRef>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const priority = z.enum(TASK_PRIORITIES);

/** Данные записи по виду. */
export const TASK_HISTORY_DATA_SCHEMAS = {
  created: z.object({}),
  title: z.object({ from: z.string(), to: z.string() }),
  /** Текст описания не хранится — только был ли он до и после. */
  description: z.object({ from: z.boolean(), to: z.boolean() }),
  priority: z.object({ from: priority, to: priority }),
  due_date: z.object({ from: isoDate.nullable(), to: isoDate.nullable() }),
  assignee: z.object({ from: namedRef.nullable(), to: namedRef.nullable() }),
  status: z.object({ project: namedRef, from: namedRef, to: namedRef }),
  project_added: z.object({ project: namedRef, status: namedRef }),
  project_removed: z.object({ project: namedRef }),
  parent: z.object({ from: taskRef.nullable(), to: taskRef.nullable() }),
  labels: z.object({ added: z.array(namedRef), removed: z.array(namedRef) }),
  archived: z.object({ descendants: z.number().int().min(0) }),
  restored: z.object({ descendants: z.number().int().min(0) }),
} satisfies Record<TaskHistoryKind, z.ZodType>;

export type TaskHistoryDataMap = {
  [K in TaskHistoryKind]: z.infer<(typeof TASK_HISTORY_DATA_SCHEMAS)[K]>;
};

/** Изменение: вид и данные согласованы. */
export type TaskHistoryChange = {
  [K in TaskHistoryKind]: { kind: K; data: TaskHistoryDataMap[K] };
}[TaskHistoryKind];

export function isTaskHistoryKind(value: unknown): value is TaskHistoryKind {
  return typeof value === 'string' && (TASK_HISTORY_KINDS as readonly string[]).includes(value);
}

/** Проверяет данные из БД. Несогласованные (старая схема, ручная правка) — null. */
export function parseHistoryData<K extends TaskHistoryKind>(
  kind: K,
  raw: unknown,
): TaskHistoryDataMap[K] | null {
  const result = TASK_HISTORY_DATA_SCHEMAS[kind].safeParse(raw);
  return result.success ? (result.data as TaskHistoryDataMap[K]) : null;
}

/** Поля задачи, которые сравнивает diffTaskFields. */
export interface TaskFieldsSnapshot {
  title: string;
  description: string | null;
  priority: TaskPriority;
  /** `YYYY-MM-DD` или null. */
  dueDate: string | null;
  assignee: HistoryNamedRef | null;
}

function hasText(value: string | null): boolean {
  return value !== null && value.trim() !== '';
}

/**
 * Изменения полей задачи: по записи на каждое реально изменённое поле. Поля, которых нет в
 * `after`, не менялись.
 */
export function diffTaskFields(
  before: TaskFieldsSnapshot,
  after: Partial<TaskFieldsSnapshot>,
): TaskHistoryChange[] {
  const changes: TaskHistoryChange[] = [];
  if (after.title !== undefined && after.title !== before.title) {
    changes.push({ kind: 'title', data: { from: before.title, to: after.title } });
  }
  if (after.description !== undefined && (after.description ?? '') !== (before.description ?? '')) {
    changes.push({
      kind: 'description',
      data: { from: hasText(before.description), to: hasText(after.description) },
    });
  }
  if (after.priority !== undefined && after.priority !== before.priority) {
    changes.push({ kind: 'priority', data: { from: before.priority, to: after.priority } });
  }
  if (after.dueDate !== undefined && after.dueDate !== before.dueDate) {
    changes.push({ kind: 'due_date', data: { from: before.dueDate, to: after.dueDate } });
  }
  if (
    after.assignee !== undefined &&
    (after.assignee?.id ?? null) !== (before.assignee?.id ?? null)
  ) {
    changes.push({ kind: 'assignee', data: { from: before.assignee, to: after.assignee } });
  }
  return changes;
}

/** Автор записи: пользователь (возможно, через токен агента) или система. */
export interface HistoryAuthor {
  actorId: string | null;
  viaTokenId: string | null;
  source: string | null;
}

export interface MergeCandidate extends HistoryAuthor {
  kind: TaskHistoryKind;
  /** Время последней правки этой записи. */
  updatedAt: Date;
}

/**
 * Сливать ли новое изменение с последней записью задачи: то же поле, тот же автор и путь
 * (токен, источник), не старше окна слияния.
 */
export function shouldMergeHistory(
  previous: MergeCandidate | null,
  next: HistoryAuthor & { kind: TaskHistoryKind },
  now: Date,
): boolean {
  if (!previous || !MERGEABLE_KINDS.has(next.kind)) return false;
  return (
    previous.kind === next.kind &&
    previous.actorId !== null &&
    previous.actorId === next.actorId &&
    previous.viaTokenId === next.viaTokenId &&
    previous.source === next.source &&
    now.getTime() - previous.updatedAt.getTime() <= HISTORY_MERGE_WINDOW_MS
  );
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Слияние сливаемых записей: `from` — из прежней, `to` — из новой. null — после слияния ничего не
 * изменилось (вернули как было), прежнюю запись нужно удалить.
 */
export function mergeHistoryChange(
  previous: TaskHistoryChange,
  next: TaskHistoryChange,
): TaskHistoryChange | null {
  const prev = previous.data as Record<string, unknown>;
  const curr = next.data as Record<string, unknown>;
  if (previous.kind !== next.kind || !('from' in prev) || !('to' in curr)) return next;
  const data = { ...curr, from: prev.from };
  return sameValue(prev.from, curr.to) ? null : ({ kind: next.kind, data } as TaskHistoryChange);
}

const DUE_DATE_FORMAT = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeZone: 'UTC' });

function formatDue(value: string | null): string {
  return value === null ? 'не задан' : DUE_DATE_FORMAT.format(new Date(`${value}T00:00:00Z`));
}

function quote(value: string): string {
  return `«${value}»`;
}

function formatTaskRef(ref: HistoryTaskRef | null): string {
  return ref === null ? 'нет' : `${ref.key} ${quote(ref.title)}`;
}

function formatSubtasks(descendants: number): string {
  return descendants > 0 ? ` вместе с подзадачами (${descendants})` : '';
}

/** Текст записи без автора — для ленты в задаче и для MCP. */
export function describeHistoryChange(change: TaskHistoryChange): string {
  switch (change.kind) {
    case 'created':
      return 'Задача создана';
    case 'title':
      return `Название: ${quote(change.data.from)} → ${quote(change.data.to)}`;
    case 'description':
      if (!change.data.from) return 'Описание добавлено';
      return change.data.to ? 'Описание изменено' : 'Описание удалено';
    case 'priority':
      return `Приоритет: ${TASK_PRIORITY_LABELS[change.data.from]} → ${TASK_PRIORITY_LABELS[change.data.to]}`;
    case 'due_date':
      return `Срок: ${formatDue(change.data.from)} → ${formatDue(change.data.to)}`;
    case 'assignee':
      return `Ответственный: ${change.data.from?.name ?? 'не назначен'} → ${change.data.to?.name ?? 'не назначен'}`;
    case 'status':
      return `Статус в ${quote(change.data.project.name)}: ${change.data.from.name} → ${change.data.to.name}`;
    case 'project_added':
      return `Добавлена в проект ${quote(change.data.project.name)} (${change.data.status.name})`;
    case 'project_removed':
      return `Убрана из проекта ${quote(change.data.project.name)}`;
    case 'parent':
      if (change.data.to === null) return `Больше не подзадача ${formatTaskRef(change.data.from)}`;
      return `Родитель: ${formatTaskRef(change.data.from)} → ${formatTaskRef(change.data.to)}`;
    case 'labels': {
      const parts = [
        ...change.data.added.map((label) => `+${label.name}`),
        ...change.data.removed.map((label) => `−${label.name}`),
      ];
      return `Метки: ${parts.join(', ')}`;
    }
    case 'archived':
      return `Отправлена в архив${formatSubtasks(change.data.descendants)}`;
    case 'restored':
      return `Восстановлена из архива${formatSubtasks(change.data.descendants)}`;
  }
}
