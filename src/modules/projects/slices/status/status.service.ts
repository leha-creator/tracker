import 'server-only';

import { requireWorkspaceAccess, requireWorkspacePermission } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { prisma } from '@/shared/db';
import { NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  isEntityId,
  parseStatusColor,
  StatusSet,
  type StatusCategory,
  type StatusColor,
  type StatusDirection,
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

function toStatusDto(row: StatusRow): ProjectStatusDto {
  return { ...row, color: parseStatusColor(row.color) };
}

function assertIds(ref: ProjectRef, statusId?: string): void {
  if (!isEntityId(ref.projectId)) throw new NotFoundError('Проект не найден');
  if (statusId !== undefined && !isEntityId(statusId)) throw new NotFoundError('Статус не найден');
}

/**
 * Общий сценарий изменения набора: право → блокировка проекта → загрузка набора →
 * метод модели → сохранение. Нарушение инварианта логируется как WARN.
 */
async function mutateStatusSet(
  session: AuthSession,
  ref: ProjectRef,
  operation: string,
  mutate: (set: StatusSet) => void,
): Promise<string[]> {
  const { workspaceId, projectId } = ref;
  await requireWorkspacePermission(session, workspaceId, 'manageProjects');

  return prisma.$transaction(async (tx) => {
    if (!(await statusRepository.lockProject(tx, workspaceId, projectId))) {
      log.warn({ workspaceId, projectId, operation }, '[status] project not found in workspace');
      throw new NotFoundError('Проект не найден');
    }
    const rows = await statusRepository.listByProject(workspaceId, projectId, tx);
    const set = StatusSet.fromPersisted(rows.map(toStatusDto));
    try {
      mutate(set);
    } catch (error) {
      log.warn(
        { workspaceId, projectId, operation, err: error },
        '[status] rejected by status set invariant',
      );
      throw error;
    }
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
  input: ProjectRef & { statusId: string; direction: StatusDirection },
): Promise<void> {
  const { workspaceId, projectId, statusId, direction } = input;
  assertIds(input, statusId);
  log.debug(
    { userId: session.user.id, workspaceId, projectId, statusId, direction },
    '[status.moveStatus] start',
  );

  let moved = false;
  await mutateStatusSet(session, input, 'move', (set) => {
    moved = set.move(statusId, direction);
  });
  log.info({ projectId, statusId, direction, moved }, '[status] moved');
}

export async function deleteStatus(
  session: AuthSession,
  input: ProjectRef & { statusId: string },
): Promise<void> {
  const { workspaceId, projectId, statusId } = input;
  assertIds(input, statusId);
  log.debug(
    { userId: session.user.id, workspaceId, projectId, statusId },
    '[status.deleteStatus] start',
  );

  // Перенос задач из удаляемого статуса появится на этапе «Задачи».
  await mutateStatusSet(session, input, 'delete', (set) => set.remove(statusId));
  log.info({ projectId, statusId }, '[status] deleted');
}
