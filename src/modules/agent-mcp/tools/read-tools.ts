import 'server-only';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  listTaskBranchesAndCommits,
  listTaskPullRequests,
  suggestBranchName,
} from '@/modules/integrations/github';
import {
  listProjectTasks,
  listSubtasks,
  listTaskComments,
  listTasks,
  parseTaskListParams,
  TASK_DUE_FILTERS,
  TASK_LIST_QUERY_MAX_LENGTH,
  TASK_PRIORITIES,
} from '@/modules/tasks';
import { ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import type { McpContext } from '../context';
import {
  formatTaskDetails,
  formatTaskList,
  formatWorkspaceContext,
  normalizeName,
  parseStatusCategory,
  resolveMember,
  resolveProject,
  taskUrl,
  type CatalogProject,
} from '../models';
import { runTool } from '../tool-result';
import { findTask, loadCatalog, loadGithubGuide, loadMembers } from '../workspace-data';

const log = createLogger('mcp');

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

/** Рекомендованная ветка, как в разделе GitHub задачи; без ключа пространства (`#42`) — нет. */
export function branchFor(taskKey: string, title: string): string | null {
  return taskKey.startsWith('#') ? null : suggestBranchName(taskKey, title);
}

export const taskRefArg = z
  .union([z.string().min(1).max(30), z.number().int().positive()])
  .describe('Task reference: key like "TSK-42", "#42" or the number 42');

export async function getWorkspaceContextTool(ctx: McpContext): Promise<string> {
  const projects = await loadCatalog(ctx);
  const [members, githubGuide] = await Promise.all([
    loadMembers(ctx),
    loadGithubGuide(ctx, projects),
  ]);
  return formatWorkspaceContext({
    workspace: ctx.workspace,
    url: `${ctx.baseUrl.replace(/\/+$/, '')}/w/${ctx.workspace.slug}`,
    me: { userId: ctx.session.user.id, name: ctx.session.user.name },
    projects,
    members,
    githubGuide,
  });
}

export const listTasksArgs = {
  query: z
    .string()
    .max(TASK_LIST_QUERY_MAX_LENGTH)
    .optional()
    .describe('Search in titles, or a task key / number'),
  project: z.string().optional().describe('Project name or id'),
  status: z
    .string()
    .optional()
    .describe(
      'Status category (todo, in_progress, done, or "none" for tasks not on any board) or, together with project, a status name or id',
    ),
  assignee: z
    .string()
    .optional()
    .describe('"me", "none" (unassigned), or a member userId, email or name'),
  priority: z.array(z.enum(TASK_PRIORITIES)).max(5).optional(),
  due: z.enum(TASK_DUE_FILTERS).optional(),
  topLevelOnly: z.boolean().optional().describe('Hide subtasks'),
  sort: z
    .enum(['number', 'title', 'priority', 'due', 'status'])
    .optional()
    .describe('"status" works only with project'),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).max(10_000).optional(),
};

type ListTasksArgs = { [K in keyof typeof listTasksArgs]?: z.infer<(typeof listTasksArgs)[K]> };

/** Статусы проекта для фильтра: точное имя или id → один, категория → все статусы категории. */
function statusFilterIds(project: CatalogProject, ref: string): string[] {
  const exact = project.statuses.filter(
    (status) => status.id === ref.trim() || normalizeName(status.name) === normalizeName(ref),
  );
  if (exact.length) return exact.map((status) => status.id);
  const category = parseStatusCategory(ref);
  const ids = category
    ? project.statuses.filter((status) => status.category === category).map((s) => s.id)
    : [];
  if (ids.length) return ids;
  throw new ValidationError(
    `Статус «${ref}» не найден в проекте «${project.name}». Статусы: ${project.statuses
      .map((status) => `«${status.name}»`)
      .join(', ')}`,
  );
}

export async function listTasksTool(ctx: McpContext, args: ListTasksArgs): Promise<string> {
  const raw: Record<string, string> = {};
  if (args.query) raw.q = args.query;
  if (args.priority?.length) raw.priority = args.priority.join(',');
  if (args.due) raw.due = args.due;
  if (args.topLevelOnly) raw.level = 'top';
  if (args.sort) raw.sort = args.sort;
  if (args.dir) raw.dir = args.dir;
  if (args.page) raw.page = String(args.page);

  if (args.assignee) {
    const value = args.assignee.trim().toLowerCase();
    raw.assignee =
      value === 'me' || value === 'none'
        ? value
        : resolveMember(await loadMembers(ctx), args.assignee, ctx.session.user.id).userId;
  }

  const status = args.status?.trim();
  const category = status ? (status === 'none' ? 'none' : parseStatusCategory(status)) : null;

  if (args.project) {
    const project = resolveProject(await loadCatalog(ctx), args.project);
    if (status && status !== 'none') {
      // Фильтр по статусам доступен только в списке проекта.
      raw.status = statusFilterIds(project, status).join(',');
      const query = parseTaskListParams(raw, 'project');
      log.debug(
        { workspaceId: ctx.workspace.id, projectId: project.id, page: query.page },
        '[mcp.list_tasks] project query',
      );
      return formatTaskList(
        await listProjectTasks(ctx.session, ctx.workspace.id, project.id, query),
      );
    }
    raw.project = project.id;
  }
  if (status) {
    if (!category) {
      throw new ValidationError(
        'Фильтр по названию статуса работает вместе с project. Без проекта укажите категорию: todo, in_progress, done или none.',
      );
    }
    raw.category = category;
  }

  const query = parseTaskListParams(raw, 'workspace');
  const page = await listTasks(ctx.session, ctx.workspace.id, query);
  log.debug(
    {
      workspaceId: ctx.workspace.id,
      filters: Object.keys(raw).filter((key) => key !== 'q'),
      page: page.page,
      total: page.total,
    },
    '[mcp.list_tasks] query',
  );
  return formatTaskList(page);
}

export async function getTaskTool(
  ctx: McpContext,
  args: { task: string | number },
): Promise<string> {
  const task = await findTask(ctx, args.task);
  const workspaceId = ctx.workspace.id;
  const [subtasks, comments, pullRequests, branchesAndCommits] = await Promise.all([
    listSubtasks(ctx.session, workspaceId, task.id),
    listTaskComments(ctx.session, workspaceId, task.id),
    listTaskPullRequests(ctx.session, workspaceId, task.id),
    listTaskBranchesAndCommits(ctx.session, workspaceId, task.id),
  ]);
  return formatTaskDetails({
    task,
    url: taskUrl(ctx.baseUrl, ctx.workspace.slug, task.number),
    suggestedBranch: branchFor(task.key, task.title),
    subtasks,
    comments,
    pullRequests,
    branchesAndCommits,
  });
}

export function registerReadTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_workspace_context',
    {
      title: 'Workspace context',
      description:
        'Projects with their statuses (ids, names, categories), members (for assignee and @mentions) and the GitHub linking rules of this workspace. Call this first.',
      annotations: READ_ONLY,
    },
    () => runTool(ctx, 'get_workspace_context', () => getWorkspaceContextTool(ctx)),
  );

  server.registerTool(
    'list_tasks',
    {
      title: 'List tasks',
      description:
        'Search and filter tasks of the workspace (50 per page). Returns key, title, status in each project, assignee, priority, due date and parent of subtasks.',
      inputSchema: listTasksArgs,
      annotations: READ_ONLY,
    },
    (args) => runTool(ctx, 'list_tasks', () => listTasksTool(ctx, args)),
  );

  server.registerTool(
    'get_task',
    {
      title: 'Get task',
      description:
        'Full task: fields, status in each project, parent chain, subtasks with progress, linked GitHub pull requests, branches and commits, latest comments and a suggested branch name.',
      inputSchema: { task: taskRefArg },
      annotations: READ_ONLY,
    },
    (args) => runTool(ctx, 'get_task', () => getTaskTool(ctx, args)),
  );
}
