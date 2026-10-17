import 'server-only';

import { requireWorkspaceAccess, requireWorkspacePermission } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { isUniqueViolation, prisma } from '@/shared/db';
import { ConflictError, NotFoundError } from '@/shared/errors';
import { resolveEntityIcon, type EntityIcon } from '@/shared/entity-icon';
import { createLogger } from '@/shared/logger';

import {
  assertCanCreateProject,
  assertCanDeleteProject,
  assertDeleteConfirmed,
  assertProjectNotArchived,
  countTasksByCategory,
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
    icon: resolveEntityIcon(row.icon, row.id),
    createdAt: row.createdAt,
    tasksCount: row._count.placements,
    archivedAt: row.archivedAt,
    archivedByName: row.archivedBy?.name ?? null,
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

/** Проекты пространства: по умолчанию активные, `archived` — только архивные. */
export async function listProjects(
  session: AuthSession,
  workspaceId: string,
  options: { archived?: boolean } = {},
): Promise<ProjectListItemDto[]> {
  await requireWorkspaceAccess(session, workspaceId);
  const userId = session.user.id;
  const archived = options.archived ?? false;
  // Срок — дата без времени, «сегодня» — в UTC (как у фильтра «Просрочено» в задачах).
  const today = new Date().toISOString().slice(0, 10);
  log.debug({ userId, workspaceId, today, archived }, '[project.listProjects]');

  const [rows, stats] = await Promise.all([
    projectRepository.listByWorkspace(workspaceId, archived),
    projectRepository.taskStatsByWorkspace(workspaceId, userId, today),
  ]);
  const statsByProject = new Map(stats.map((row) => [row.projectId, row]));
  return rows.map((row) => {
    const projectStats = statsByProject.get(row.id);
    const tasksActivity = projectStats?.lastActivityAt;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      icon: resolveEntityIcon(row.icon, row.id),
      tasksCount: row._count.placements,
      tasksByCategory: countTasksByCategory(
        row.statuses.map((status) => ({
          category: status.category,
          tasksCount: status._count.placements,
        })),
      ),
      overdueCount: projectStats?.overdue ?? 0,
      myOpenCount: projectStats?.mine ?? 0,
      lastActivityAt:
        tasksActivity && tasksActivity > row.updatedAt ? tasksActivity : row.updatedAt,
      archivedAt: row.archivedAt,
    };
  });
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
  input: { workspaceId: string; name: string; description?: string; icon?: EntityIcon },
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
          icon: input.icon ?? null,
          createdById: userId,
        },
        statuses,
      );
    });
    log.info(
      { workspaceId, projectId: row.id, userId, statusesCount: statuses.length, icon: row.icon },
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
  input: {
    workspaceId: string;
    projectId: string;
    name: string;
    description?: string;
    /** Не передана — иконка не меняется. */
    icon?: EntityIcon;
  },
): Promise<ProjectDto> {
  const { workspaceId, projectId } = input;
  await requireWorkspacePermission(session, workspaceId, 'manageProjects');
  log.debug({ userId: session.user.id, workspaceId, projectId }, '[project.updateProject] start');
  const project = await loadProject(workspaceId, projectId);
  try {
    assertProjectNotArchived(project);
  } catch (error) {
    log.warn({ workspaceId, projectId }, '[project.updateProject] archived project');
    throw error;
  }
  const name = normalizeProjectName(input.name);
  if (await projectRepository.isNameTaken(workspaceId, name, projectId)) {
    log.warn({ workspaceId, projectId }, '[project.updateProject] name taken');
    throw nameTaken();
  }

  try {
    const count = await projectRepository.update(workspaceId, projectId, {
      name,
      description: input.description ?? null,
      icon: input.icon,
    });
    if (count === 0) throw new NotFoundError('Проект не найден');
  } catch (error) {
    if (isUniqueViolation(error)) {
      log.warn({ workspaceId, projectId }, '[project.updateProject] name taken');
      throw nameTaken();
    }
    throw error;
  }

  log.info(
    { workspaceId, projectId, userId: session.user.id, icon: input.icon },
    '[project] updated',
  );
  return toProjectDto(await loadProject(workspaceId, projectId));
}

/**
 * Отправляет проект в архив: доска и статусы только для чтения, задачи остаются в пространстве.
 * Повторный вызов для архивного проекта ничего не меняет.
 */
export async function archiveProject(
  session: AuthSession,
  input: { workspaceId: string; projectId: string },
): Promise<ProjectDto> {
  return setProjectArchived(session, input, true);
}

/** Возвращает проект из архива. */
export async function restoreProject(
  session: AuthSession,
  input: { workspaceId: string; projectId: string },
): Promise<ProjectDto> {
  return setProjectArchived(session, input, false);
}

async function setProjectArchived(
  session: AuthSession,
  input: { workspaceId: string; projectId: string },
  archive: boolean,
): Promise<ProjectDto> {
  const { workspaceId, projectId } = input;
  const userId = session.user.id;
  await requireWorkspacePermission(session, workspaceId, 'manageProjects');
  log.debug({ userId, workspaceId, projectId, archive }, '[project.setArchived] start');

  await loadProject(workspaceId, projectId);
  const count = await projectRepository.setArchived(
    workspaceId,
    projectId,
    archive
      ? { archivedAt: new Date(), archivedById: userId }
      : { archivedAt: null, archivedById: null },
  );
  if (count === 0) {
    log.debug({ workspaceId, projectId, archive }, '[project.setArchived] already in state');
  } else {
    log.info(
      { workspaceId, projectId, userId },
      archive ? '[project] archived' : '[project] restored',
    );
  }
  return toProjectDto(await loadProject(workspaceId, projectId));
}

/** Удаляет архивный проект со статусами. Возвращает slug пространства для редиректа. */
export async function deleteProject(
  session: AuthSession,
  input: { workspaceId: string; projectId: string; confirmName: string },
): Promise<{ workspaceSlug: string }> {
  const { workspaceId, projectId } = input;
  await requireWorkspacePermission(session, workspaceId, 'manageProjects');
  log.debug({ userId: session.user.id, workspaceId, projectId }, '[project.deleteProject] start');

  const project = await loadProject(workspaceId, projectId);
  try {
    assertCanDeleteProject(project);
  } catch (error) {
    log.warn({ workspaceId, projectId }, '[project.deleteProject] project is not archived');
    throw error;
  }
  try {
    assertDeleteConfirmed(project.name, input.confirmName);
  } catch (error) {
    log.warn({ workspaceId, projectId }, '[project.deleteProject] confirmation mismatch');
    throw error;
  }

  const count = await projectRepository.delete(workspaceId, projectId);
  if (count === 0) throw new NotFoundError('Проект не найден');

  log.info(
    { workspaceId, projectId, userId: session.user.id, tasksCount: project._count.placements },
    '[project] deleted',
  );
  return { workspaceSlug: project.workspace.slug };
}
