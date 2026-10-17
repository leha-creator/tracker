import 'server-only';

import { isEntityId } from '@/modules/projects';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { prisma } from '@/shared/db';
import { NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  assertCanAddSubtask,
  assertCanMoveTask,
  formatTaskKey,
  parseTaskNumberQuery,
  summarizeSubtasks,
  toIsoDate,
  type SubtaskProgress,
} from '../../models';
import { historyAuthorOf, recordHistory, taskSnapshot } from '../history/history.service';
import { assertTaskActive } from '../task/task-archive.guard';
import { toTaskListItem } from '../task/task.mapper';
import { taskRepository } from '../task/task.repository';
import type { SubtasksDto, TaskAncestorDto, TaskParentOptionDto } from './subtask.dto';
import { subtaskRepository } from './subtask.repository';

const log = createLogger('tasks.subtask');

/** Сколько кандидатов в родители показывать в поиске. */
const PARENT_OPTIONS_LIMIT = 20;

function assertTaskId(taskId: string): void {
  if (!isEntityId(taskId)) throw new NotFoundError('Задача не найдена');
}

/** Прямые подзадачи и прогресс по ним. */
export async function listSubtasks(
  session: AuthSession,
  workspaceId: string,
  taskId: string,
): Promise<SubtasksDto> {
  await requireWorkspaceAccess(session, workspaceId);
  assertTaskId(taskId);
  // У активной задачи архивные подзадачи скрыты; у архивной видны те, что ушли в архив с ней.
  const parent = await taskRepository.findArchiveState(workspaceId, taskId);
  const rows = await subtaskRepository.listChildren(workspaceId, taskId, !parent?.archivedAt);
  const today = toIsoDate(new Date());
  const items = rows.map((row) => ({
    ...toTaskListItem(row, today),
    subtaskCount: row._count.subtasks,
  }));
  const progress = summarizeSubtasks(
    items.map((item) => ({
      categories: item.placements.map((placement) => placement.statusCategory),
    })),
  );
  log.debug(
    { userId: session.user.id, workspaceId, taskId, subtasks: items.length, done: progress.done },
    '[subtask.listSubtasks]',
  );
  return { items, progress };
}

/**
 * Прогресс подзадач для нескольких задач одним запросом (доска, страница задачи).
 * Задачи без подзадач в результат не попадают. Доступ проверяет вызывающий.
 */
export async function getSubtaskProgress(
  workspaceId: string,
  taskIds: readonly string[],
): Promise<Map<string, SubtaskProgress>> {
  const rows = await subtaskRepository.childrenCategories(workspaceId, [...taskIds]);
  const byParent = new Map<string, { categories: string[] }[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const children = byParent.get(row.parentId) ?? [];
    children.push({ categories: row.placements.map((placement) => placement.status.category) });
    byParent.set(row.parentId, children);
  }
  const result = new Map<string, SubtaskProgress>();
  for (const [parentId, children] of byParent) result.set(parentId, summarizeSubtasks(children));
  return result;
}

/** Предки задачи от корня к родителю — для хлебных крошек. Доступ проверяет вызывающий. */
export async function getTaskAncestors(
  workspaceId: string,
  taskId: string,
  taskKey: string | null,
): Promise<TaskAncestorDto[]> {
  const rows = await subtaskRepository.ancestors(workspaceId, taskId);
  return rows.map((row) => ({
    number: row.number,
    key: formatTaskKey(row.number, taskKey),
    title: row.title,
  }));
}

/**
 * Перенос задачи (вместе с поддеревом) к другому родителю того же пространства;
 * `parentId: null` — сделать задачей верхнего уровня.
 */
export async function setTaskParent(
  session: AuthSession,
  input: { workspaceId: string; taskId: string; parentId: string | null },
): Promise<void> {
  const { workspaceId, taskId, parentId } = input;
  const access = await requireWorkspaceAccess(session, workspaceId);
  log.debug(
    { userId: access.userId, workspaceId, taskId, parentId },
    '[subtask.setTaskParent] start',
  );
  assertTaskId(taskId);
  if (parentId !== null && !isEntityId(parentId)) {
    throw new NotFoundError('Родительская задача не найдена');
  }

  const fromParentId = await prisma.$transaction(async (tx) => {
    await subtaskRepository.lockTree(tx, workspaceId);
    // Архивная задача и архивный новый родитель — только для чтения.
    await assertTaskActive(workspaceId, taskId, tx);
    if (parentId) await assertTaskActive(workspaceId, parentId, tx);
    const taskPath = await subtaskRepository.pathIds(workspaceId, taskId, tx);
    if (taskPath.length === 0) {
      log.warn({ workspaceId, taskId }, '[subtask.setTaskParent] task not found');
      throw new NotFoundError('Задача не найдена');
    }
    const currentParentId = taskPath.at(-2) ?? null;
    if (currentParentId === parentId) return currentParentId;

    const targetPathIds = parentId
      ? await subtaskRepository.pathIds(workspaceId, parentId, tx)
      : [];
    if (parentId && targetPathIds.length === 0) {
      log.warn({ workspaceId, taskId, parentId }, '[subtask.setTaskParent] parent not found');
      throw new NotFoundError('Родительская задача не найдена');
    }
    const subtreeHeight = await subtaskRepository.subtreeHeight(workspaceId, taskId, tx);
    try {
      assertCanMoveTask({ taskId, targetPathIds, subtreeHeight });
      if (parentId) {
        const childrenCount = await subtaskRepository.countChildren(workspaceId, parentId, tx);
        // Глубину уже проверили с учётом поддерева — здесь только лимит подзадач.
        assertCanAddSubtask(0, childrenCount);
      }
    } catch (error) {
      log.warn(
        { workspaceId, taskId, parentId, targetDepth: targetPathIds.length, subtreeHeight },
        '[subtask.setTaskParent] move rejected',
      );
      throw error;
    }

    const count = await subtaskRepository.setParent(tx, workspaceId, taskId, parentId);
    if (count === 0) throw new NotFoundError('Задача не найдена');
    // Запросы транзакции — по очереди: одно соединение не выполняет их параллельно.
    const from = await taskSnapshot(tx, workspaceId, currentParentId);
    const to = await taskSnapshot(tx, workspaceId, parentId);
    await recordHistory(tx, {
      workspaceId,
      taskId,
      author: historyAuthorOf(session),
      changes: [{ kind: 'parent', data: { from, to } }],
    });
    return currentParentId;
  });

  if (fromParentId === parentId) {
    log.debug({ workspaceId, taskId, parentId }, '[subtask.setTaskParent] parent unchanged');
    return;
  }
  log.info(
    { workspaceId, taskId, fromParentId, toParentId: parentId, userId: access.userId },
    '[subtask] parent changed',
  );
}

/**
 * Кандидаты в родители: по номеру (`42`, `TSK-42`, `#42`) или части названия; без самой задачи
 * и её поддерева (сохранение всё равно перепроверяет цикл под блокировкой).
 */
export async function searchParentCandidates(
  session: AuthSession,
  input: { workspaceId: string; taskId: string; q: string },
): Promise<TaskParentOptionDto[]> {
  const { workspaceId, taskId, q } = input;
  await requireWorkspaceAccess(session, workspaceId);
  assertTaskId(taskId);
  const excludeIds = await subtaskRepository.subtreeIds(workspaceId, taskId);
  const rows = await subtaskRepository.searchCandidates(workspaceId, {
    number: parseTaskNumberQuery(q) ?? undefined,
    text: q,
    excludeIds: excludeIds.length > 0 ? excludeIds : [taskId],
    take: PARENT_OPTIONS_LIMIT,
  });
  // Текст поиска не логируем: в нём могут быть названия задач.
  log.debug(
    {
      userId: session.user.id,
      workspaceId,
      taskId,
      found: rows.length,
      excluded: excludeIds.length,
    },
    '[subtask.searchParentCandidates]',
  );
  return rows.map((row) => ({
    taskId: row.id,
    number: row.number,
    key: formatTaskKey(row.number, row.workspace.taskKey),
    title: row.title,
  }));
}
