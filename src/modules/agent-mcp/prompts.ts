import 'server-only';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { getWorkspaceGithubSummary } from '@/modules/integrations/github';
import { AppError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import type { McpContext } from './context';
import {
  buildFinishTaskPrompt,
  buildStartTaskPrompt,
  describeAutomations,
  taskUrl,
  type PromptTask,
} from './models';
import { branchFor } from './tools/read-tools';
import { findTask, loadCatalog } from './workspace-data';

const log = createLogger('mcp');

type PromptName = 'start_task' | 'finish_task';

async function buildPrompt(
  ctx: McpContext,
  name: PromptName,
  ref: string,
): Promise<GetPromptResult> {
  const [task, projects, github] = await Promise.all([
    findTask(ctx, ref),
    loadCatalog(ctx),
    getWorkspaceGithubSummary(ctx.session, ctx.workspace.id),
  ]);
  log.debug({ name, taskId: task.id, tokenId: ctx.tokenId }, '[mcp.prompt]');

  const promptTask: PromptTask = {
    key: task.key,
    title: task.title,
    description: task.description,
    url: taskUrl(ctx.baseUrl, ctx.workspace.slug, task.number),
    placements: task.placements.map((placement) => ({
      project: placement.projectName,
      status: placement.statusName,
      category: placement.statusCategory,
    })),
    ancestors: task.ancestors,
    subtasks: task.subtaskProgress,
    branch: branchFor(task.key, task.title),
  };
  const automations = github.enabled
    ? describeAutomations({ taskKey: ctx.workspace.taskKey, github, projects })
    : [];
  const text =
    name === 'start_task'
      ? buildStartTaskPrompt(promptTask, automations)
      : buildFinishTaskPrompt(promptTask, automations);
  return {
    description: `${name} ${task.key}`,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  };
}

/**
 * Ошибку промпта (нет задачи, чужой ключ) отдаём текстом в сообщении: у промптов нет `isError`,
 * а исключение клиент показал бы как сбой сервера.
 */
async function safePrompt(ctx: McpContext, name: PromptName, ref: string) {
  try {
    return await buildPrompt(ctx, name, ref);
  } catch (error) {
    const text =
      error instanceof AppError && error.expose
        ? `Tasker: ${error.message}`
        : 'Tasker: внутренняя ошибка при подготовке сценария.';
    if (!(error instanceof AppError)) log.error({ err: error, name }, '[mcp.prompt] failed');
    return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] };
  }
}

export function registerPrompts(server: McpServer, ctx: McpContext): void {
  const args = { task: z.string().describe('Task key, e.g. TSK-42') };

  server.registerPrompt(
    'start_task',
    {
      title: 'Start a Tasker task',
      description:
        'Read the task, set it in progress (unless GitHub automation does it), create a branch named by the task key and work with key-prefixed commits.',
      argsSchema: args,
    },
    ({ task }) => safePrompt(ctx, 'start_task', task),
  );

  server.registerPrompt(
    'finish_task',
    {
      title: 'Finish a Tasker task',
      description:
        'Open a PR linked to the task by its key, leave a summary comment and set the status according to the workspace automation.',
      argsSchema: args,
    },
    ({ task }) => safePrompt(ctx, 'finish_task', task),
  );
}
