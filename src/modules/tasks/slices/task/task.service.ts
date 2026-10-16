import 'server-only';

import { isEntityId } from '@/modules/projects';
import { isWorkspaceMember } from '@/modules/workspaces';
import { requireWorkspaceAccess, type WorkspaceRole } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { prisma } from '@/shared/db';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  assertAssigneeIsMember,
  assertCanDeleteTask,
  canDeleteTask,
  normalizeTaskTitle,
  positionAfter,
  toIsoDate,
  type TaskPriority,
} from '../../models';
import { attachmentRepository } from '../attachment/attachment.repository';
import { deleteStoredObjects } from '../attachment/attachment.storage';
import { placementRepository } from '../placement/placement.repository';
import type { TaskDto } from './task.dto';
import { toTaskSummary, toUserDto } from './task.mapper';
import { taskRepository, type TaskRow, type TaskWriteData } from './task.repository';

const log = createLogger('tasks.task');

/** Срок `YYYY-MM-DD` → Date в полночь UTC (колонка DATE без времени). */
function parseDueDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function today(): string {
  return toIsoDate(new Date());
}

function toTaskDto(row: TaskRow, actor: { userId: string; role: WorkspaceRole }): TaskDto {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    description: row.description,
    priority: row.priority,
    createdBy: toUserDto(row.createdBy),
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
}

export async function createTask(
  session: AuthSession,
  input: CreateTaskInput,
): Promise<{ taskId: string; number: number; workspaceSlug: string }> {
  const { workspaceId, placement } = input;
  const userId = session.user.id;
  await requireWorkspaceAccess(session, workspaceId);
  log.debug({ userId, workspaceId, placed: Boolean(placement) }, '[task.createTask] start');

  if (input.assigneeId) await checkAssignee(workspaceId, input.assigneeId);
  if (placement && (!isEntityId(placement.projectId) || !isEntityId(placement.statusId))) {
    throw new NotFoundError('Статус не найден');
  }

  const data: TaskWriteData = {
    title: normalizeTaskTitle(input.title),
    description: input.description ?? null,
    priority: input.priority ?? 'none',
    dueDate: input.dueDate ? parseDueDate(input.dueDate) : null,
    assigneeId: input.assigneeId ?? null,
  };

  const task = await prisma.$transaction(async (tx) => {
    const number = await taskRepository.nextNumber(tx, workspaceId);
    const created = await taskRepository.create(tx, {
      ...data,
      workspaceId,
      number,
      createdById: userId,
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
    { workspaceId, taskId: task.id, number: task.number, userId, placed: Boolean(placement) },
    '[task] created',
  );
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
  return toTaskDto(row, access);
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

  // Строки вложений удалит каскад, объекты хранилища — после удаления задачи.
  const storageKeys = await attachmentRepository.keysForTask(workspaceId, taskId);
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
    },
    '[task] deleted',
  );
  return { workspaceSlug: task.workspace.slug };
}
