import 'server-only';

import { requireWorkspaceAccess, requireWorkspacePermission } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { isUniqueViolation, prisma } from '@/shared/db';
import { ConflictError, NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  assertCanCreateProject,
  assertDeleteConfirmed,
  isEntityId,
  normalizeProjectName,
  StatusSet,
} from '../../models';
import type { ProjectDto, ProjectListItemDto } from './project.dto';
import { projectRepository } from './project.repository';

const log = createLogger('projects.project');

type ProjectRow = NonNullable<Awaited<ReturnType<typeof projectRepository.findInWorkspace>>>;

function toProjectDto(row: ProjectRow): ProjectDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    workspaceSlug: row.workspace.slug,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
  };
}

function nameTaken(): ConflictError {
  return new ConflictError('Проект с таким названием уже есть', {
    fieldErrors: { name: ['Проект с таким названием уже есть в пространстве'] },
  });
}

/** Проект пространства или NOT_FOUND (в том числе для id не в формате UUID). */
async function loadProject(workspaceId: string, projectId: string): Promise<ProjectRow> {
  const row = isEntityId(projectId)
    ? await projectRepository.findInWorkspace(workspaceId, projectId)
    : null;
  if (!row) {
    log.warn({ workspaceId, projectId }, '[project] not found in workspace');
    throw new NotFoundError('Проект не найден');
  }
  return row;
}

export async function listProjects(
  session: AuthSession,
  workspaceId: string,
): Promise<ProjectListItemDto[]> {
  await requireWorkspaceAccess(session, workspaceId);
  log.debug({ userId: session.user.id, workspaceId }, '[project.listProjects]');

  const rows = await projectRepository.listByWorkspace(workspaceId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    statusesCount: row._count.statuses,
  }));
}

export async function getProject(
  session: AuthSession,
  workspaceId: string,
  projectId: string,
): Promise<ProjectDto> {
  await requireWorkspaceAccess(session, workspaceId);
  log.debug({ userId: session.user.id, workspaceId, projectId }, '[project.getProject]');
  return toProjectDto(await loadProject(workspaceId, projectId));
}

export async function createProject(
  session: AuthSession,
  input: { workspaceId: string; name: string; description?: string },
): Promise<ProjectDto> {
  const { workspaceId } = input;
  const userId = session.user.id;
  await requireWorkspacePermission(session, workspaceId, 'manageProjects');
  log.debug({ userId, workspaceId }, '[project.createProject] start');

  const name = normalizeProjectName(input.name);
  const statuses = StatusSet.createDefault().statuses;
  try {
    const row = await prisma.$transaction(async (tx) => {
      const count = await projectRepository.countInWorkspace(tx, workspaceId);
      try {
        assertCanCreateProject(count);
      } catch (error) {
        log.warn({ workspaceId, count }, '[project.createProject] limit reached');
        throw error;
      }
      // Предварительная проверка: обычный конфликт не доходит до ошибки БД. P2002 ниже — на гонку.
      if (await projectRepository.isNameTaken(workspaceId, name, undefined, tx)) {
        throw nameTaken();
      }
      return projectRepository.createWithStatuses(
        tx,
        {
          workspaceId,
          name,
          description: input.description ?? null,
          createdById: userId,
        },
        statuses,
      );
    });
    log.info(
      { workspaceId, projectId: row.id, userId, statusesCount: statuses.length },
      '[project] created',
    );
    return toProjectDto(row);
  } catch (error) {
    if (error instanceof ConflictError || isUniqueViolation(error)) {
      log.warn({ workspaceId, userId }, '[project.createProject] name taken');
      throw nameTaken();
    }
    throw error;
  }
}

export async function updateProject(
  session: AuthSession,
  input: { workspaceId: string; projectId: string; name: string; description?: string },
): Promise<ProjectDto> {
  const { workspaceId, projectId } = input;
  await requireWorkspacePermission(session, workspaceId, 'manageProjects');
  log.debug({ userId: session.user.id, workspaceId, projectId }, '[project.updateProject] start');
  await loadProject(workspaceId, projectId);
  const name = normalizeProjectName(input.name);
  if (await projectRepository.isNameTaken(workspaceId, name, projectId)) {
    log.warn({ workspaceId, projectId }, '[project.updateProject] name taken');
    throw nameTaken();
  }

  try {
    const count = await projectRepository.update(workspaceId, projectId, {
      name,
      description: input.description ?? null,
    });
    if (count === 0) throw new NotFoundError('Проект не найден');
  } catch (error) {
    if (isUniqueViolation(error)) {
      log.warn({ workspaceId, projectId }, '[project.updateProject] name taken');
      throw nameTaken();
    }
    throw error;
  }

  log.info({ workspaceId, projectId, userId: session.user.id }, '[project] updated');
  return toProjectDto(await loadProject(workspaceId, projectId));
}

/** Удаляет проект со статусами. Возвращает slug пространства для редиректа. */
export async function deleteProject(
  session: AuthSession,
  input: { workspaceId: string; projectId: string; confirmName: string },
): Promise<{ workspaceSlug: string }> {
  const { workspaceId, projectId } = input;
  await requireWorkspacePermission(session, workspaceId, 'manageProjects');
  log.debug({ userId: session.user.id, workspaceId, projectId }, '[project.deleteProject] start');

  const project = await loadProject(workspaceId, projectId);
  try {
    assertDeleteConfirmed(project.name, input.confirmName);
  } catch (error) {
    log.warn({ workspaceId, projectId }, '[project.deleteProject] confirmation mismatch');
    throw error;
  }

  // Проверка задач в проекте появится на этапе «Задачи».
  const count = await projectRepository.delete(workspaceId, projectId);
  if (count === 0) throw new NotFoundError('Проект не найден');

  log.info({ workspaceId, projectId, userId: session.user.id }, '[project] deleted');
  return { workspaceSlug: project.workspace.slug };
}
