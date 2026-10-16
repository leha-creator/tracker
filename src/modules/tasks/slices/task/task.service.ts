import 'server-only';

import { notify } from '@/modules/notifications';
import { isEntityId } from '@/modules/projects';
import { isWorkspaceMember } from '@/modules/workspaces';
import { requireWorkspaceAccess, type WorkspaceRole } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { prisma, type TransactionClient } from '@/shared/db';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  assertAssigneeIsMember,
  assertCanAddSubtask,
  assertCanDeleteTask,
  canDeleteTask,
  formatTaskKey,
  normalizeTaskTitle,
  positionAfter,
  toIsoDate,
  type TaskPriority,
} from '../../models';
import { attachmentRepository } from '../attachment/attachment.repository';
import { deleteStoredObjects } from '../attachment/attachment.storage';
import { placementRepository } from '../placement/placement.repository';
import { subtaskRepository } from '../subtask/subtask.repository';
import { getSubtaskProgress, getTaskAncestors } from '../subtask/subtask.service';
import type { TaskDto, TaskRefDto } from './task.dto';
import { toTaskSummary, toCreatedVia, toUserDto } from './task.mapper';
import { taskRepository, type TaskRow, type TaskWriteData } from './task.repository';

const log = createLogger('tasks.task');

/** Срок `YYYY-MM-DD` → Date в полночь UTC (колонка DATE без времени). */
function parseDueDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function today(): string {
  return toIsoDate(new Date());
}

type TaskTreeFields = 'ancestors' | 'descendantCount' | 'subtaskProgress';

function toTaskDto(
  row: TaskRow,
  actor: { userId: string; role: WorkspaceRole },
): Omit<TaskDto, TaskTreeFields> {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    description: row.description,
    priority: row.priority,
    createdBy: toUserDto(row.createdBy),
    createdVia: toCreatedVia(row.createdBy, row.createdViaToken),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    canDelete: canDeleteTask(row, actor),
    ...toTaskSummary(row, today()),
  };
}

/** Ответственный — участник пространства; иначе VALIDATION с ошибкой поля. */
async function checkAssignee(workspaceId: string, assigneeId: string): Promise<void> {
  const isMember = await isWorkspaceMember(workspaceId, assigneeId);
  if (!isMember) log.warn({ workspaceId, assigneeId }, '[task] assignee is not a member');
  assertAssigneeIsMember(isMember);
}

/**
 * Уведомление «вас назначили ответственным». Себе не отправляется (это отсекает notify),
 * сбой не отменяет изменение задачи (notify не бросает).
 */
async function notifyAssignee(input: {
  session: AuthSession;
  workspaceId: string;
  assigneeId: string;
  task: {
    id: string;
    number: number;
    title: string;
    workspace: { slug: string; name: string; taskKey: string | null };
  };
}): Promise<void> {
  const { session, workspaceId, assigneeId, task } = input;
  log.debug(
    { workspaceId, taskId: task.id, assigneeId, byUserId: session.user.id },
    '[task] assignee notification',
  );
  await notify([
    {
      type: 'task_assigned',
      recipientId: assigneeId,
      workspaceId,
      actorId: session.user.id,
      taskId: task.id,
      payload: {
        workspaceSlug: task.workspace.slug,
        workspaceName: task.workspace.name,
        actorName: session.user.name,
        taskNumber: task.number,
        taskKey: formatTaskKey(task.number, task.workspace.taskKey),
        taskTitle: task.title,
      },
    },
  ]);
}

async function loadTask(workspaceId: string, taskId: string): Promise<TaskRow> {
  const row = isEntityId(taskId) ? await taskRepository.findById(workspaceId, taskId) : null;
  if (!row) {
    log.warn({ workspaceId, taskId }, '[task] not found in workspace');
    throw new NotFoundError('Задача не найдена');
  }
  return row;
}

export interface CreateTaskInput {
  workspaceId: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
  assigneeId?: string;
  /** Сразу разместить в проекте: в конец колонки статуса. */
  placement?: { projectId: string; statusId: string };
  /** Родительская задача того же пространства: новая задача станет её подзадачей. */
  parentId?: string;
}

/**
 * Проверка родителя новой подзадачи под блокировкой дерева: родитель есть в пространстве,
 * глубина и число подзадач в пределах лимитов.
 */
async function checkNewSubtaskParent(
  tx: TransactionClient,
  workspaceId: string,
  parentId: string,
): Promise<void> {
  await subtaskRepository.lockTree(tx, workspaceId);
  const parentPath = await subtaskRepository.pathIds(workspaceId, parentId, tx);
  if (parentPath.length === 0) {
    log.warn({ workspaceId, parentId }, '[task.createTask] parent not found');
    throw new NotFoundError('Родительская задача не найдена');
  }
  const childrenCount = await subtaskRepository.countChildren(workspaceId, parentId, tx);
  try {
    assertCanAddSubtask(parentPath.length, childrenCount);
  } catch (error) {
    log.warn(
      { workspaceId, parentId, depth: parentPath.length, childrenCount },
      '[task.createTask] subtask rejected',
    );
    throw error;
  }
}

export async function createTask(
  session: AuthSession,
  input: CreateTaskInput,
): Promise<{ taskId: string; number: number; workspaceSlug: string }> {
  const { workspaceId, placement, parentId } = input;
  const userId = session.user.id;
  await requireWorkspaceAccess(session, workspaceId);
  log.debug(
    {
      userId,
      workspaceId,
      placed: Boolean(placement),
      parentId,
      via: session.via?.tokenId ?? null,
    },
    '[task.createTask] start',
  );

  if (input.assigneeId) await checkAssignee(workspaceId, input.assigneeId);
  if (placement && (!isEntityId(placement.projectId) || !isEntityId(placement.statusId))) {
    throw new NotFoundError('Статус не найден');
  }
  if (parentId !== undefined && !isEntityId(parentId)) {
    throw new NotFoundError('Родительская задача не найдена');
  }

  const data: TaskWriteData = {
    title: normalizeTaskTitle(input.title),
    description: input.description ?? null,
    priority: input.priority ?? 'none',
    dueDate: input.dueDate ? parseDueDate(input.dueDate) : null,
    assigneeId: input.assigneeId ?? null,
  };

  const task = await prisma.$transaction(async (tx) => {
    // Блокировка дерева — до счётчика номеров (тот же порядок, что и при смене родителя).
    if (parentId) await checkNewSubtaskParent(tx, workspaceId, parentId);
    const number = await taskRepository.nextNumber(tx, workspaceId);
    const created = await taskRepository.create(tx, {
      ...data,
      workspaceId,
      number,
      createdById: userId,
      createdViaTokenId: session.via?.tokenId ?? null,
      parentId: parentId ?? null,
    });
    if (placement) {
      const status = await placementRepository.findStatus(tx, workspaceId, placement.statusId);
      if (!status) {
        log.warn({ workspaceId, statusId: placement.statusId }, '[task.createTask] no status');
        throw new NotFoundError('Статус не найден');
      }
      if (status.projectId !== placement.projectId) {
        log.warn(
          { workspaceId, statusId: status.id, projectId: placement.projectId },
          '[task.createTask] status of another project',
        );
        throw new ValidationError('Статус не принадлежит выбранному проекту', {
          fieldErrors: { statusId: ['Выберите статус этого проекта'] },
        });
      }
      const last = await placementRepository.lastPosition(
        tx,
        workspaceId,
        placement.projectId,
        status.id,
      );
      await placementRepository.create(tx, {
        workspaceId,
        taskId: created.id,
        projectId: placement.projectId,
        statusId: status.id,
        position: positionAfter(last),
      });
    }
    return created;
  });

  log.info(
    {
      workspaceId,
      taskId: task.id,
      number: task.number,
      userId,
      placed: Boolean(placement),
      parentId,
    },
    '[task] created',
  );
  if (input.assigneeId) {
    await notifyAssignee({ session, workspaceId, assigneeId: input.assigneeId, task });
  }
  return { taskId: task.id, number: task.number, workspaceSlug: task.workspace.slug };
}

export async function getTaskByNumber(
  session: AuthSession,
  workspaceId: string,
  number: number,
): Promise<TaskDto> {
  const access = await requireWorkspaceAccess(session, workspaceId);
  log.debug({ userId: access.userId, workspaceId, number }, '[task.getTaskByNumber]');

  const row = await taskRepository.findByNumber(workspaceId, number);
  if (!row) {
    log.warn({ workspaceId, number }, '[task.getTaskByNumber] not found');
    throw new NotFoundError('Задача не найдена');
  }

  // Дерево: рекурсивные запросы — только когда есть родитель или подзадачи.
  const hasSubtasks = row._count.subtasks > 0;
  const [ancestors, subtreeIds, progress] = await Promise.all([
    row.parentId ? getTaskAncestors(workspaceId, row.id, row.workspace.taskKey) : [],
    hasSubtasks ? subtaskRepository.subtreeIds(workspaceId, row.id) : [row.id],
    hasSubtasks ? getSubtaskProgress(workspaceId, [row.id]) : null,
  ]);
  const descendantCount = Math.max(subtreeIds.length - 1, 0);
  log.debug(
    { workspaceId, taskId: row.id, depth: ancestors.length + 1, descendants: descendantCount },
    '[task.getTaskByNumber] tree',
  );
  return {
    ...toTaskDto(row, access),
    ancestors,
    descendantCount,
    subtaskProgress: progress?.get(row.id) ?? { total: 0, done: 0 },
  };
}

export interface UpdateTaskInput {
  workspaceId: string;
  taskId: string;
  title?: string;
  /** null — очистить. */
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  assigneeId?: string | null;
}

/** Частичное обновление: undefined — поле не меняется, null — очищается. */
export async function updateTask(session: AuthSession, input: UpdateTaskInput): Promise<void> {
  const { workspaceId, taskId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  log.debug({ userId: session.user.id, workspaceId, taskId }, '[task.updateTask] start');

  const current = await loadTask(workspaceId, taskId);
  if (input.assigneeId && input.assigneeId !== current.assignee?.id) {
    await checkAssignee(workspaceId, input.assigneeId);
  }

  const data: Partial<TaskWriteData> = {
    ...(input.title !== undefined && { title: normalizeTaskTitle(input.title) }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.priority !== undefined && { priority: input.priority }),
    ...(input.dueDate !== undefined && {
      dueDate: input.dueDate === null ? null : parseDueDate(input.dueDate),
    }),
    ...(input.assigneeId !== undefined && { assigneeId: input.assigneeId }),
  };
  const fields = Object.keys(data);
  if (fields.length === 0) {
    log.debug({ workspaceId, taskId }, '[task.updateTask] nothing to update');
    return;
  }

  const count = await taskRepository.update(workspaceId, taskId, data);
  if (count === 0) throw new NotFoundError('Задача не найдена');
  log.info({ workspaceId, taskId, userId: session.user.id, fields }, '[task] updated');

  if (input.assigneeId && input.assigneeId !== current.assignee?.id) {
    await notifyAssignee({
      session,
      workspaceId,
      assigneeId: input.assigneeId,
      task: { ...current, title: data.title ?? current.title },
    });
  }
}

/** Удаляет задачу (размещения — каскадом). Возвращает slug пространства для редиректа. */
export async function deleteTask(
  session: AuthSession,
  input: { workspaceId: string; taskId: string },
): Promise<{ workspaceSlug: string }> {
  const { workspaceId, taskId } = input;
  const access = await requireWorkspaceAccess(session, workspaceId);
  log.debug({ userId: access.userId, workspaceId, taskId }, '[task.deleteTask] start');

  const task = await loadTask(workspaceId, taskId);
  try {
    assertCanDeleteTask(task, access);
  } catch (error) {
    log.warn(
      { workspaceId, taskId, userId: access.userId, role: access.role },
      '[task.deleteTask] forbidden',
    );
    throw error;
  }

  // Подзадачи и строки вложений всего поддерева удалит каскад, объекты хранилища — после
  // удаления задачи.
  const subtreeIds = await subtaskRepository.subtreeIds(workspaceId, taskId);
  const storageKeys = await attachmentRepository.keysForTasks(
    workspaceId,
    subtreeIds.length > 0 ? subtreeIds : [taskId],
  );
  const descendants = Math.max(subtreeIds.length - 1, 0);
  const count = await taskRepository.delete(workspaceId, taskId);
  if (count === 0) throw new NotFoundError('Задача не найдена');
  await deleteStoredObjects(storageKeys, { workspaceId, taskId });
  log.info(
    {
      workspaceId,
      taskId,
      number: task.number,
      userId: access.userId,
      attachments: storageKeys.length,
      descendants,
    },
    '[task] deleted',
  );
  return { workspaceSlug: task.workspace.slug };
}

/** Сколько задач разбирать из одной внешней ссылки (описание PR может упоминать много задач). */
const TASK_REFS_LIMIT = 50;

/**
 * Задачи пространства по номерам — системное чтение без сессии для интеграций (ссылки TSK-42 в
 * GitHub). Вызывающий отвечает за доверие к источнику; несуществующие номера пропускаются.
 */
export async function resolveTaskRefs(
  workspaceId: string,
  numbers: readonly number[],
): Promise<TaskRefDto[]> {
  const unique = [...new Set(numbers)]
    .filter((number) => Number.isSafeInteger(number) && number > 0)
    .slice(0, TASK_REFS_LIMIT);
  if (unique.length === 0) return [];
  const rows = await taskRepository.listByNumbers(workspaceId, unique);
  log.debug(
    { workspaceId, requested: unique.length, found: rows.length },
    '[task.resolveTaskRefs]',
  );
  return rows.map(toTaskRef);
}

/** Задачи пространства по id — системное чтение для интеграций (связи PR, ветки). */
export async function resolveTaskRefsByIds(
  workspaceId: string,
  taskIds: readonly string[],
): Promise<TaskRefDto[]> {
  const ids = [...new Set(taskIds)].filter(isEntityId);
  if (ids.length === 0) return [];
  const rows = await taskRepository.listRefsByIds(workspaceId, ids);
  log.debug(
    { workspaceId, requested: ids.length, found: rows.length },
    '[task.resolveTaskRefsByIds]',
  );
  return rows.map(toTaskRef);
}

function toTaskRef(row: {
  id: string;
  number: number;
  title: string;
  assigneeId: string | null;
  createdById: string | null;
  workspace: { taskKey: string | null };
}): TaskRefDto {
  return {
    taskId: row.id,
    number: row.number,
    key: formatTaskKey(row.number, row.workspace.taskKey),
    title: row.title,
    assigneeId: row.assigneeId,
    createdById: row.createdById,
  };
}
