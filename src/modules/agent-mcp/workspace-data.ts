import 'server-only';

import { getWorkspaceGithubSummary } from '@/modules/integrations/github';
import { listProjects, listWorkspaceStatuses } from '@/modules/projects';
import { getTaskByNumber, type TaskDto } from '@/modules/tasks';
import { listMemberIdentities } from '@/modules/workspaces';

import type { McpContext } from './context';
import { buildGithubGuide, parseTaskRef, type CatalogMember, type CatalogProject } from './models';

/** Проекты пространства со статусами по порядку колонок. */
export async function loadCatalog(ctx: McpContext): Promise<CatalogProject[]> {
  const [projects, statuses] = await Promise.all([
    listProjects(ctx.session, ctx.workspace.id),
    listWorkspaceStatuses(ctx.session, ctx.workspace.id),
  ]);
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    statuses: [...(statuses[project.id] ?? [])]
      .sort((a, b) => a.position - b.position)
      .map(({ id, name, category, position }) => ({ id, name, category, position })),
  }));
}

/** Участники пространства. Членство токена уже проверено при аутентификации. */
export async function loadMembers(ctx: McpContext): Promise<CatalogMember[]> {
  const members = await listMemberIdentities(ctx.workspace.id);
  return members.map(({ userId, name, email }) => ({ userId, name, email }));
}

export async function loadGithubGuide(
  ctx: McpContext,
  projects?: readonly CatalogProject[],
): Promise<string> {
  const [github, catalog] = await Promise.all([
    getWorkspaceGithubSummary(ctx.session, ctx.workspace.id),
    projects ?? loadCatalog(ctx),
  ]);
  return buildGithubGuide({ taskKey: ctx.workspace.taskKey, github, projects: catalog });
}

/** Задача по ссылке агента (`TSK-42`, `#42`, `42`) в пространстве токена. */
export function findTask(ctx: McpContext, ref: string | number): Promise<TaskDto> {
  const number = parseTaskRef(ref, ctx.workspace.taskKey);
  return getTaskByNumber(ctx.session, ctx.workspace.id, number);
}
