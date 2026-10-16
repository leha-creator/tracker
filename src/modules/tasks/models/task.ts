import type { WorkspaceRole } from '@/shared/access/workspace-role';
import { ForbiddenError, ValidationError } from '@/shared/errors/app-error';

export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 10_000;
/** Максимум проектов, в которых одновременно размещена задача. */
export const TASK_PLACEMENT_LIMIT = 20;

const TASK_NUMBER_RE = /^[1-9]\d{0,8}$/;

/** Название задачи без пробелов по краям и с одиночными пробелами внутри. */
export function normalizeTaskTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ');
}

/** Номер задачи из URL: целое положительное число, иначе null. */
export function parseTaskNumber(raw: string): number | null {
  return TASK_NUMBER_RE.test(raw) ? Number(raw) : null;
}

/**
 * Ключ задачи для отображения: `TSK-42` по ключу пространства, без ключа — `#42`
 * (ключ ещё не проставлен; см. Workspace.taskKey).
 */
export function formatTaskKey(number: number, workspaceTaskKey: string | null): string {
  return workspaceTaskKey ? `${workspaceTaskKey}-${number}` : `#${number}`;
}

interface TaskActor {
  userId: string;
  role: WorkspaceRole;
}

/** Удалить задачу может её автор или владелец пространства. */
export function canDeleteTask(task: { createdById: string | null }, actor: TaskActor): boolean {
  return actor.role === 'owner' || task.createdById === actor.userId;
}

export function assertCanDeleteTask(task: { createdById: string | null }, actor: TaskActor): void {
  if (!canDeleteTask(task, actor)) {
    throw new ForbiddenError('Удалить задачу может её автор или владелец пространства');
  }
}

/** Ответственным можно назначить только участника пространства. */
export function assertAssigneeIsMember(isMember: boolean): void {
  if (!isMember) {
    throw new ValidationError('Ответственный должен быть участником пространства', {
      fieldErrors: { assigneeId: ['Выберите участника пространства'] },
    });
  }
}

/**
 * Задача просрочена, если срок раньше сегодняшней даты и она не выполнена.
 * Даты — строки `YYYY-MM-DD` (сравниваются лексикографически). Задача выполнена, если у неё
 * есть размещения и все они в статусах категории `done`.
 */
export function isTaskOverdue(
  dueDate: string | null,
  today: string,
  statusCategories: readonly string[],
): boolean {
  if (!dueDate || dueDate >= today) return false;
  return isTaskOpen(statusCategories);
}

/**
 * Задача открыта: нет размещений или хотя бы в одном проекте статус не «Готово». Выполнена —
 * когда во всех проектах «Готово».
 */
export function isTaskOpen(statusCategories: readonly string[]): boolean {
  const done =
    statusCategories.length > 0 && statusCategories.every((category) => category === 'done');
  return !done;
}

/** Дата `YYYY-MM-DD` в UTC: срок хранится как дата без времени. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Профиль участника: за сколько дней считать выполненные задачи. */
export const MEMBER_DONE_RECENT_DAYS = 30;
/** Профиль участника: сколько ближайших открытых задач показывать. */
export const MEMBER_OPEN_TASKS_LIMIT = 10;
