import 'server-only';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  addToProject,
  changeStatus,
  COMMENT_ATTACHMENTS_LIMIT,
  createComment,
  createTask,
  setTaskParent,
  TASK_COMMENT_MAX_LENGTH,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_PRIORITIES,
  TASK_TITLE_MAX_LENGTH,
  updateTask,
  type TaskDto,
} from '@/modules/tasks';
import { ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import type { McpContext } from '../context';
import {
  resolveMember,
  resolveProject,
  resolveStatus,
  taskKeyOf,
  taskUrl,
  type CatalogProject,
} from '../models';
import { runTool } from '../tool-result';
import { findTask, loadCatalog, loadMembers } from '../workspace-data';
import { branchFor, taskRefArg } from './read-tools';

const log = createLogger('mcp');

const titleArg = z.string().trim().min(1).max(TASK_TITLE_MAX_LENGTH);
const descriptionArg = z.string().trim().max(TASK_DESCRIPTION_MAX_LENGTH);
const dueDateArg = z.iso.date().describe('YYYY-MM-DD');
const assigneeArg = z.string().min(1).describe('"me", or a member userId, email or name');

async function resolveAssigneeId(ctx: McpContext, ref: string): Promise<string> {
  return resolveMember(await loadMembers(ctx), ref, ctx.session.user.id).userId;
}

/** Проект для смены статуса: указанный, иначе единственное размещение задачи. */
function placementProject(
  task: TaskDto,
  catalog: readonly CatalogProject[],
  projectRef: string | undefined,
): CatalogProject {
  if (projectRef) return resolveProject(catalog, projectRef);
  if (task.placements.length === 1) {
    const project = catalog.find((item) => item.id === task.placements[0]!.projectId);
    if (project) return project;
  }
  const where = task.placements.length
    ? `Задача в нескольких проектах: ${task.placements.map((p) => `«${p.projectName}»`).join(', ')}`
    : `Задача ${task.key} не размещена ни в одном проекте (подзадачи по умолчанию не на доске). Проекты: ${catalog.map((p) => `«${p.name}»`).join(', ') || 'нет'}`;
  throw new ValidationError(`Укажите project. ${where}`);
}

export const createTaskArgs = {
  title: titleArg,
  description: descriptionArg.optional().describe('Plain text; line breaks are kept'),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: dueDateArg.optional(),
  assignee: assigneeArg.optional(),
  parent: taskRefArg.optional().describe('Create as a subtask of this task'),
  project: z
    .string()
    .optional()
    .describe(
      'Project name or id to put the task on its board. Default: the only project of the workspace for top-level tasks; subtasks stay off the board unless a project is given',
    ),
  status: z
    .string()
    .optional()
    .describe('Status name, id or category in the project; default — first "todo" status'),
};

type CreateTaskArgs = {
  title: string;
  description?: string;
  priority?: (typeof TASK_PRIORITIES)[number];
  dueDate?: string;
  assignee?: string;
  parent?: string | number;
  project?: string;
  status?: string;
};

export async function createTaskTool(ctx: McpContext, args: CreateTaskArgs): Promise<string> {
  const [catalog, parent] = await Promise.all([
    loadCatalog(ctx),
    args.parent === undefined ? null : findTask(ctx, args.parent),
  ]);

  let project: CatalogProject | null = null;
  if (args.project) project = resolveProject(catalog, args.project);
  else if (!parent && catalog.length === 1) project = catalog[0]!;
  if (args.status && !project) {
    throw new ValidationError('status задаётся вместе с project');
  }
  const status = project ? resolveStatus(project, args.status ?? 'todo') : null;

  const { taskId, number } = await createTask(ctx.session, {
    workspaceId: ctx.workspace.id,
    title: args.title,
    description: args.description || undefined,
    priority: args.priority,
    dueDate: args.dueDate,
    assigneeId: args.assignee ? await resolveAssigneeId(ctx, args.assignee) : undefined,
    placement: project && status ? { projectId: project.id, statusId: status.id } : undefined,
    parentId: parent?.id,
  });
  log.info(
    { taskId, number, parentId: parent?.id ?? null, tokenId: ctx.tokenId },
    '[mcp.create_task] created',
  );

  const key = taskKeyOf(number, ctx.workspace.taskKey);
  const branch = branchFor(key, args.title);
  return [
    `Created **${key}** ${args.title}`,
    `URL: ${taskUrl(ctx.baseUrl, ctx.workspace.slug, number)}`,
    parent ? `Subtask of ${parent.key} ${parent.title}` : null,
    project && status
      ? `Board: ${project.name}: ${status.name} (${status.category})`
      : 'Not on any board (use set_task_status with project to place it).',
    branch ? `Suggested branch: \`${branch}\`` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export const updateTaskArgs = {
  task: taskRefArg,
  title: titleArg.optional(),
  description: descriptionArg.nullable().optional().describe('null clears the description'),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: dueDateArg.nullable().optional().describe('null clears the due date'),
  assignee: assigneeArg.nullable().optional().describe('null unassigns'),
};

type UpdateTaskArgs = {
  task: string | number;
  title?: string;
  description?: string | null;
  priority?: (typeof TASK_PRIORITIES)[number];
  dueDate?: string | null;
  assignee?: string | null;
};

export async function updateTaskTool(ctx: McpContext, args: UpdateTaskArgs): Promise<string> {
  const task = await findTask(ctx, args.task);
  const changed = (['title', 'description', 'priority', 'dueDate', 'assignee'] as const).filter(
    (field) => args[field] !== undefined,
  );
  if (changed.length === 0) throw new ValidationError('Нечего менять: укажите хотя бы одно поле');

  let assigneeId: string | null | undefined;
  if (args.assignee === null) assigneeId = null;
  else if (args.assignee !== undefined) assigneeId = await resolveAssigneeId(ctx, args.assignee);

  await updateTask(ctx.session, {
    workspaceId: ctx.workspace.id,
    taskId: task.id,
    title: args.title,
    description: args.description === '' ? null : args.description,
    priority: args.priority,
    dueDate: args.dueDate,
    assigneeId,
  });
  log.info({ taskId: task.id, fields: changed, tokenId: ctx.tokenId }, '[mcp.update_task] updated');
  return `Updated ${task.key}: ${changed.join(', ')}.`;
}

export const setTaskStatusArgs = {
  task: taskRefArg,
  status: z
    .string()
    .min(1)
    .describe('Status name or id, or a category: todo, in_progress, done (first such status)'),
  project: z
    .string()
    .optional()
    .describe('Project name or id; required when the task is in several projects or in none'),
};

export async function setTaskStatusTool(
  ctx: McpContext,
  args: { task: string | number; status: string; project?: string },
): Promise<string> {
  const [task, catalog] = await Promise.all([findTask(ctx, args.task), loadCatalog(ctx)]);
  const project = placementProject(task, catalog, args.project);
  const status = resolveStatus(project, args.status);
  const ref = { workspaceId: ctx.workspace.id, taskId: task.id, projectId: project.id };
  const current = task.placements.find((placement) => placement.projectId === project.id);

  if (!current) {
    await addToProject(ctx.session, { ...ref, statusId: status.id });
    log.info(
      { taskId: task.id, projectId: project.id, to: status.id, tokenId: ctx.tokenId },
      '[mcp.set_task_status] placed',
    );
    return `${task.key} added to project «${project.name}» with status «${status.name}» (${status.category}).`;
  }
  if (current.statusId === status.id) {
    return `${task.key} is already «${status.name}» in «${project.name}».`;
  }
  await changeStatus(ctx.session, { ...ref, statusId: status.id });
  log.info(
    {
      taskId: task.id,
      projectId: project.id,
      from: current.statusId,
      to: status.id,
      tokenId: ctx.tokenId,
    },
    '[mcp.set_task_status] changed',
  );
  return `${task.key} in «${project.name}»: «${current.statusName}» → «${status.name}» (${status.category}).`;
}

export async function setTaskParentTool(
  ctx: McpContext,
  args: { task: string | number; parent: string | number | null },
): Promise<string> {
  const [task, parent] = await Promise.all([
    findTask(ctx, args.task),
    args.parent === null ? null : findTask(ctx, args.parent),
  ]);
  await setTaskParent(ctx.session, {
    workspaceId: ctx.workspace.id,
    taskId: task.id,
    parentId: parent?.id ?? null,
  });
  log.info(
    { taskId: task.id, parentId: parent?.id ?? null, tokenId: ctx.tokenId },
    '[mcp.set_task_parent] changed',
  );
  return parent
    ? `${task.key} is now a subtask of ${parent.key} ${parent.title}.`
    : `${task.key} is now a top-level task.`;
}

export async function addCommentTool(
  ctx: McpContext,
  args: { task: string | number; body?: string; attachmentIds?: string[] },
): Promise<string> {
  const task = await findTask(ctx, args.task);
  const attachmentIds = args.attachmentIds ?? [];
  const { commentId } = await createComment(ctx.session, {
    workspaceId: ctx.workspace.id,
    taskId: task.id,
    body: args.body ?? '',
    attachmentIds,
  });
  log.info(
    { taskId: task.id, commentId, attachments: attachmentIds.length, tokenId: ctx.tokenId },
    '[mcp.add_comment] created',
  );
  const files = attachmentIds.length ? ` with ${attachmentIds.length} file(s)` : '';
  return `Comment added to ${task.key}${files}.`;
}

export function registerWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'create_task',
    {
      title: 'Create task',
      description:
        'Create a task or a subtask (parent). Returns the new key (e.g. TSK-43), URL and a suggested git branch name.',
      inputSchema: createTaskArgs,
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(ctx, 'create_task', () => createTaskTool(ctx, args)),
  );

  server.registerTool(
    'update_task',
    {
      title: 'Update task',
      description:
        'Change title, description, priority, due date or assignee. Omitted fields stay as they are; null clears a field.',
      inputSchema: updateTaskArgs,
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args) => runTool(ctx, 'update_task', () => updateTaskTool(ctx, args)),
  );

  server.registerTool(
    'set_task_status',
    {
      title: 'Set task status',
      description:
        'Move a task to a status of a project board. If the task is not in that project yet, it is added there. Respect GitHub status automation (see get_github_conventions).',
      inputSchema: setTaskStatusArgs,
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args) => runTool(ctx, 'set_task_status', () => setTaskStatusTool(ctx, args)),
  );

  server.registerTool(
    'set_task_parent',
    {
      title: 'Set task parent',
      description:
        'Make a task a subtask of another task, or pass parent: null to make it top-level. Cycles and nesting deeper than 10 levels are rejected.',
      inputSchema: {
        task: taskRefArg,
        parent: taskRefArg.nullable().describe('New parent task, or null for top level'),
      },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args) => runTool(ctx, 'set_task_parent', () => setTaskParentTool(ctx, args)),
  );

  server.registerTool(
    'add_comment',
    {
      title: 'Add comment',
      description:
        'Add a plain-text comment to a task (Markdown is not rendered). Mention members as @Name using exact names from get_workspace_context — they get notified. Use it for progress notes, decisions and the final summary with the PR link. To attach files, upload them first with request_attachment_upload (target "comment") and complete_attachment_upload, then pass their ids.',
      inputSchema: {
        task: taskRefArg,
        body: z
          .string()
          .trim()
          .max(TASK_COMMENT_MAX_LENGTH)
          .optional()
          .describe('Comment text; may be empty when attachmentIds are given'),
        attachmentIds: z
          .array(z.uuid())
          .max(COMMENT_ATTACHMENTS_LIMIT)
          .optional()
          .describe('Uploaded and completed attachments with target "comment"'),
      },
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(ctx, 'add_comment', () => addCommentTool(ctx, args)),
  );
}
