import { ValidationError } from '@/shared/errors/app-error';

import { isTaskOpen } from './task';

/** Максимум уровней в дереве задач: задача верхнего уровня — уровень 1. */
export const TASK_MAX_DEPTH = 10;
/** Максимум прямых подзадач у одной задачи. */
export const TASK_SUBTASKS_LIMIT = 200;

const DEPTH_MESSAGE = `Вложенность подзадач — не больше ${TASK_MAX_DEPTH} уровней`;
const LIMIT_MESSAGE = `У задачи не больше ${TASK_SUBTASKS_LIMIT} подзадач`;

/** Прогресс подзадач: сколько всего и сколько выполнено. */
export interface SubtaskProgress {
  total: number;
  done: number;
}

/**
 * Можно ли добавить подзадачу к родителю. `parentPathLength` — длина цепочки от корня до родителя
 * включительно (уровень родителя), `childrenCount` — сколько подзадач у него уже есть.
 */
export function assertCanAddSubtask(parentPathLength: number, childrenCount: number): void {
  if (parentPathLength + 1 > TASK_MAX_DEPTH) throw new ValidationError(DEPTH_MESSAGE);
  if (childrenCount >= TASK_SUBTASKS_LIMIT) throw new ValidationError(LIMIT_MESSAGE);
}

/**
 * Можно ли перенести задачу (вместе с поддеревом) к новому родителю.
 * `targetPathIds` — цепочка id от корня до нового родителя включительно (пусто — в корень),
 * `subtreeHeight` — высота поддерева задачи (1 — без подзадач).
 */
export function assertCanMoveTask(input: {
  taskId: string;
  targetPathIds: readonly string[];
  subtreeHeight: number;
}): void {
  const { taskId, targetPathIds, subtreeHeight } = input;
  if (targetPathIds.includes(taskId)) {
    throw new ValidationError('Нельзя сделать задачу подзадачей её собственной подзадачи');
  }
  if (targetPathIds.length + subtreeHeight > TASK_MAX_DEPTH) {
    throw new ValidationError(DEPTH_MESSAGE);
  }
}

/**
 * Прогресс по подзадачам: подзадача выполнена по общему правилу задачи — есть размещения и все в
 * статусах категории `done` (см. isTaskOpen).
 */
export function summarizeSubtasks(
  children: readonly { categories: readonly string[] }[],
): SubtaskProgress {
  const done = children.filter((child) => !isTaskOpen(child.categories)).length;
  return { total: children.length, done };
}
