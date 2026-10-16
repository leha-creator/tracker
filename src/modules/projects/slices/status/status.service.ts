import 'server-only';

import { requireWorkspaceAccess, requireWorkspacePermission } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { prisma, type TransactionClient } from '@/shared/db';
import { NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  isEntityId,
  parseStatusColor,
  StatusSet,
  type StatusCategory,
  type StatusColor,
  type StatusFields,
} from '../../models';
import type { ProjectStatusDto } from './status.dto';
import { statusRepository } from './status.repository';

const log = createLogger('projects.status');

interface ProjectRef {
  workspaceId: string;
  projectId: string;
}

type StatusRow = Awaited<ReturnType<typeof statusRepository.listByProject>>[number];

function toStatusDto({ _count, ...row }: StatusRow): ProjectStatusDto {
  return { ...row, color: parseStatusColor(row.color), tasksCount: _count.placements };
}

function assertIds(ref: ProjectRef, statusId?: string): void {
  if (!isEntityId(ref.projectId)) throw new NotFoundError('Проект не найден');
  if (statusId !== undefined && !isEntityId(statusId)) throw new NotFoundError('Статус не найден');
}

/**
 * Общий сценарий изменения набора: право → блокировка проекта → загрузка набора →
 * метод модели → (beforeSave) → сохранение. Нарушение инварианта логируется как WARN.
 * Если `mutate` вернул false (набор не изменился), сохранение пропускается.
 */
async function mutateStatusSet(
  session: AuthSession,
  ref: ProjectRef,
  operation: string,
  mutate: (set: StatusSet, statuses: readonly ProjectStatusDto[]) => boolean | void,
  beforeSave?: (tx: TransactionClient) => Promise<void>,
): Promise<string[]> {
  const { workspaceId, projectId } = ref;
  await requireWorkspacePermission(session, workspaceId, 'manageProjects');

  return prisma.$transaction(async (tx) => {
    if (!(await statusRepository.lockProject(tx, workspaceId, projectId))) {
      log.warn({ workspaceId, projectId, operation }, '[status] project not found in workspace');
      throw new NotFoundError('Проект не найден');
    }
    const statuses = (await statusRepository.listByProject(workspaceId, projectId, tx)).map(
      toStatusDto,
    );
    const set = StatusSet.fromPersisted(statuses);
    let changed: boolean | void;
    try {
      changed = mutate(set, statuses);
    } catch (error) {
      log.warn(
        { workspaceId, projectId, operation, err: error },
        '[status] rejected by status set invariant',
      );
      throw error;
    }
    if (changed === false) {
      log.debug({ workspaceId, projectId, operation }, '[status] set unchanged, save skipped');
      return [];
    }
    await beforeSave?.(tx);
    return statusRepository.saveSet(tx, workspaceId, projectId, set);
  });
}

export async function listStatuses(
  session: AuthSession,
  workspaceId: string,
  projectId: string,
): Promise<ProjectStatusDto[]> {
  await requireWorkspaceAccess(session, workspaceId);
  assertIds({ workspaceId, projectId });
  log.debug({ userId: session.user.id, workspaceId, projectId }, '[status.listStatuses]');

  const rows = await statusRepository.listByProject(workspaceId, projectId);
  return rows.map(toStatusDto);
}

/** Статусы всех проектов пространства по id проекта (порядок — по позиции). */
export async function listWorkspaceStatuses(
  session: AuthSession,
  workspaceId: string,
): Promise<Record<string, ProjectStatusDto[]>> {
  await requireWorkspaceAccess(session, workspaceId);
  const rows = await statusRepository.listByWorkspace(workspaceId);
  const byProject: Record<string, ProjectStatusDto[]> = {};
  for (const { projectId, ...row } of rows) {
    (byProject[projectId] ??= []).push(toStatusDto(row));
  }
  log.debug(
    { userId: session.user.id, workspaceId, projects: Object.keys(byProject).length },
    '[status.listWorkspaceStatuses]',
  );
  return byProject;
}

export async function addStatus(
  session: AuthSession,
  input: ProjectRef & StatusFields,
): Promise<{ statusId: string }> {
  const { workspaceId, projectId } = input;
  assertIds(input);
  log.debug({ userId: session.user.id, workspaceId, projectId }, '[status.addStatus] start');

  const [statusId] = await mutateStatusSet(session, input, 'add', (set) =>
    set.add({ name: input.name, category: input.category, color: input.color }),
  );
  if (!statusId) throw new NotFoundError('Статус не создан');
  log.info({ projectId, statusId, category: input.category }, '[status] added');
  return { statusId };
}

export async function updateStatus(
  session: AuthSession,
  input: ProjectRef & {
    statusId: string;
    name?: string;
    category?: StatusCategory;
    color?: StatusColor;
  },
): Promise<void> {
  const { workspaceId, projectId, statusId, ...fields } = input;
  assertIds(input, statusId);
  log.debug(
    { userId: session.user.id, workspaceId, projectId, statusId },
    '[status.updateStatus] start',
  );

  await mutateStatusSet(session, input, 'update', (set) => set.update(statusId, fields));
  const changed = Object.entries(fields).flatMap(([key, value]) =>
    value === undefined ? [] : [key],
  );
  log.info({ projectId, statusId, fields: changed }, '[status] updated');
}

export async function moveStatus(
  session: AuthSession,
  input: ProjectRef & { statusId: string; prevStatusId: string | null },
): Promise<void> {
  const { workspaceId, projectId, statusId, prevStatusId } = input;
  assertIds(input, statusId);
  if (prevStatusId !== null && !isEntityId(prevStatusId)) {
    throw new NotFoundError('Статус не найден');
  }
  log.debug(
    { userId: session.user.id, workspaceId, projectId, statusId, prevStatusId },
    '[status.moveStatus] start',
  );

  let moved = false;
  await mutateStatusSet(session, input, 'move', (set) => {
    moved = set.moveAfter(statusId, prevStatusId);
    return moved;
  });
  log.info({ projectId, statusId, prevStatusId, moved }, '[status] moved');
}

/**
 * Удаляет статус. Задачи статуса (если есть) переносятся в `moveToStatusId` того же проекта
 * в той же транзакции — до удаления строки статуса (FK размещения не даст удалить статус с задачами).
 */
export async function deleteStatus(
  session: AuthSession,
  input: ProjectRef & { statusId: string; moveToStatusId?: string },
): Promise<void> {
  const { workspaceId, projectId, statusId, moveToStatusId } = input;
  assertIds(input, statusId);
  if (moveToStatusId !== undefined && !isEntityId(moveToStatusId)) {
    throw new NotFoundError('Статус не найден');
  }
  log.debug(
    { userId: session.user.id, workspaceId, projectId, statusId, moveToStatusId },
    '[status.deleteStatus] start',
  );

  let tasksCount = 0;
  let target: string | null = null;
  let movedTasks = 0;
  await mutateStatusSet(
    session,
    input,
    'delete',
    (set, statuses) => {
      tasksCount = statuses.find((status) => status.id === statusId)?.tasksCount ?? 0;
      if (tasksCount > 0 && !moveToStatusId) {
        log.warn({ projectId, statusId, tasksCount }, '[status.deleteStatus] target required');
      }
      target = set.remove(statusId, { tasksCount, moveToId: moveToStatusId });
    },
    async (tx) => {
      if (!target) return;
      movedTasks = await statusRepository.reassignPlacements(
        tx,
        workspaceId,
        projectId,
        statusId,
        target,
      );
    },
  );
  log.info({ projectId, statusId, movedTasks, moveToStatusId: target }, '[status] deleted');
}
