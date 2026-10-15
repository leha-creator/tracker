import 'server-only';

import { isEntityId } from '@/modules/projects';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { isUniqueViolation, prisma, type TransactionClient } from '@/shared/db';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { assertCanPlace, positionAfter, TaskPlacement } from '../../models';
import { placementRepository } from './placement.repository';

const log = createLogger('tasks.placement');

interface PlacementRef {
  workspaceId: string;
  taskId: string;
  projectId: string;
}

function assertIds(ref: PlacementRef, statusId?: string): void {
  if (!isEntityId(ref.taskId)) throw new NotFoundError('Задача не найдена');
  if (!isEntityId(ref.projectId)) throw new NotFoundError('Проект не найден');
  if (statusId !== undefined && !isEntityId(statusId)) throw new NotFoundError('Статус не найден');
}

/** Статус пространства по id или NOT_FOUND. */
async function loadStatus(tx: TransactionClient, workspaceId: string, statusId: string) {
  const status = await placementRepository.findStatus(tx, workspaceId, statusId);
  if (!status) {
    log.warn({ workspaceId, statusId }, '[placement] status not found in workspace');
    throw new NotFoundError('Статус не найден');
  }
  return status;
}

function alreadyPlaced(): ConflictError {
  return new ConflictError('Задача уже есть в этом проекте', {
    fieldErrors: { projectId: ['Задача уже есть в этом проекте'] },
  });
}

/** Добавляет задачу в проект: в конец колонки выбранного статуса. */
export async function addToProject(
  session: AuthSession,
  input: PlacementRef & { statusId: string },
): Promise<void> {
  const { workspaceId, taskId, projectId, statusId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  assertIds(input, statusId);
  log.debug(
    { userId: session.user.id, workspaceId, taskId, projectId, statusId },
    '[placement.addToProject] start',
  );

  try {
    await prisma.$transaction(async (tx) => {
      if (!(await placementRepository.taskExists(tx, workspaceId, taskId))) {
        log.warn({ workspaceId, taskId }, '[placement.addToProject] task not found');
        throw new NotFoundError('Задача не найдена');
      }
      const status = await loadStatus(tx, workspaceId, statusId);
      if (status.projectId !== projectId) {
        log.warn({ workspaceId, statusId, projectId }, '[placement] status of another project');
        throw new ValidationError('Статус не принадлежит выбранному проекту', {
          fieldErrors: { statusId: ['Выберите статус этого проекта'] },
        });
      }
      const projectIds = await placementRepository.listProjectIds(tx, workspaceId, taskId);
      try {
        assertCanPlace(projectIds, projectId);
      } catch (error) {
        log.warn(
          { workspaceId, taskId, projectId, placements: projectIds.length },
          '[placement.addToProject] rejected',
        );
        throw error;
      }
      const last = await placementRepository.lastPosition(tx, workspaceId, projectId, statusId);
      await placementRepository.create(tx, {
        workspaceId,
        taskId,
        projectId,
        statusId,
        position: positionAfter(last),
      });
    });
  } catch (error) {
    // Предварительная проверка выше; P2002 — только при гонке двух одинаковых запросов.
    if (isUniqueViolation(error)) {
      log.warn({ workspaceId, taskId, projectId }, '[placement.addToProject] race: already placed');
      throw alreadyPlaced();
    }
    throw error;
  }
  log.info({ workspaceId, taskId, projectId, statusId }, '[placement] added');
}

/** Меняет статус задачи в проекте: карточка встаёт в конец новой колонки. */
export async function changeStatus(
  session: AuthSession,
  input: PlacementRef & { statusId: string },
): Promise<void> {
  const { workspaceId, taskId, projectId, statusId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  assertIds(input, statusId);
  log.debug(
    { userId: session.user.id, workspaceId, taskId, projectId, statusId },
    '[placement.changeStatus] start',
  );

  const from = await prisma.$transaction(async (tx) => {
    const row = await placementRepository.find(tx, workspaceId, taskId, projectId);
    if (!row) {
      log.warn({ workspaceId, taskId, projectId }, '[placement.changeStatus] not placed');
      throw new NotFoundError('Задачи нет в этом проекте');
    }
    if (row.statusId === statusId) return row.statusId;

    const status = await loadStatus(tx, workspaceId, statusId);
    const placement = new TaskPlacement(row.taskId, row.projectId, row.statusId, row.position);
    const last = await placementRepository.lastPosition(tx, workspaceId, projectId, statusId);
    try {
      placement.moveTo({
        statusId: status.id,
        statusProjectId: status.projectId,
        position: positionAfter(last),
      });
    } catch (error) {
      log.warn({ workspaceId, taskId, projectId, statusId }, '[placement.changeStatus] rejected');
      throw error;
    }
    await placementRepository.updateStatus(
      tx,
      workspaceId,
      { taskId, projectId },
      { statusId: placement.statusId, position: placement.position },
    );
    return row.statusId;
  });

  if (from === statusId) {
    log.debug({ workspaceId, taskId, projectId, statusId }, '[placement.changeStatus] unchanged');
    return;
  }
  log.info({ workspaceId, taskId, projectId, from, to: statusId }, '[placement] status changed');
}

/** Убирает задачу из проекта; сама задача остаётся в пространстве. */
export async function removeFromProject(session: AuthSession, input: PlacementRef): Promise<void> {
  const { workspaceId, taskId, projectId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  assertIds(input);
  log.debug(
    { userId: session.user.id, workspaceId, taskId, projectId },
    '[placement.removeFromProject] start',
  );

  const count = await placementRepository.delete(workspaceId, { taskId, projectId });
  if (count === 0) {
    log.warn({ workspaceId, taskId, projectId }, '[placement.removeFromProject] not placed');
    throw new NotFoundError('Задачи нет в этом проекте');
  }
  log.info({ workspaceId, taskId, projectId }, '[placement] removed');
}
