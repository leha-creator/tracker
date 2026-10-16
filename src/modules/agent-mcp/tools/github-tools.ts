import 'server-only';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  findTaskReferences,
  getWorkspaceGithubSummary,
  TASK_REFERENCES_LIMIT,
} from '@/modules/integrations/github';
import { resolveTaskRefs } from '@/modules/tasks';
import { createLogger } from '@/shared/logger';

import type { McpContext } from '../context';
import { runTool } from '../tool-result';
import { loadGithubGuide } from '../workspace-data';

const log = createLogger('mcp');

export async function previewGithubLinksTool(
  ctx: McpContext,
  args: { text: string; repository?: string },
): Promise<string> {
  const taskKey = ctx.workspace.taskKey;
  const references = findTaskReferences(args.text).slice(0, TASK_REFERENCES_LIMIT);
  const own = references.filter((reference) => reference.key === taskKey);
  const foreign = references.filter((reference) => reference.key !== taskKey);
  const [tasks, github] = await Promise.all([
    resolveTaskRefs(
      ctx.workspace.id,
      own.map((reference) => reference.number),
    ),
    getWorkspaceGithubSummary(ctx.session, ctx.workspace.id),
  ]);
  log.debug(
    { workspaceId: ctx.workspace.id, refs: references.length, matched: tasks.length },
    '[mcp.preview_github_links]',
  );

  const lines: string[] = [];
  const warnings: string[] = [];
  if (!taskKey) warnings.push('This workspace has no task key — nothing can be linked.');

  for (const reference of own) {
    const task = tasks.find((item) => item.number === reference.number);
    if (task) lines.push(`- ${task.key} → will link to "${task.title}"`);
    else {
      lines.push(`- ${reference.key}-${reference.number} → no such task in this workspace`);
      warnings.push(`${reference.key}-${reference.number} does not exist.`);
    }
  }
  for (const reference of foreign) {
    lines.push(`- ${reference.key}-${reference.number} → other key, ignored by this workspace`);
  }
  if (foreign.length) {
    warnings.push(
      'Keys of other workspaces may link this PR there if the repository is shared — remove them unless intended.',
    );
  }
  if (references.length === 0) {
    warnings.push(
      taskKey
        ? `No task key found. Add it, e.g. "${taskKey}-42" (number without leading zeros, separated by -, /, space or brackets).`
        : 'No task key found.',
    );
  }
  if (tasks.length > 1) {
    warnings.push(
      `The text links ${tasks.length} tasks. Usually a branch or PR should reference exactly one task.`,
    );
  }

  if (!github.enabled) {
    warnings.push('The GitHub integration is not set up in Tasker — links will not be created.');
  } else if (args.repository) {
    const wanted = args.repository.trim().toLowerCase();
    const repo = github.repositories.find((item) => item.fullName.toLowerCase() === wanted);
    if (!repo) {
      warnings.push(
        `Repository ${args.repository} is not connected to this workspace — its events are ignored. Connected: ${
          github.repositories.map((item) => item.fullName).join(', ') || 'none'
        }.`,
      );
    } else if (repo.suspended) {
      warnings.push(`The GitHub App installation for ${repo.fullName} is suspended.`);
    }
  }

  const verdict =
    warnings.length === 0 && tasks.length === 1 ? 'OK — links to exactly one task.' : 'Check:';
  return [
    `References found: ${references.length}`,
    ...lines,
    '',
    verdict,
    ...warnings.map((warning) => `- ${warning}`),
  ].join('\n');
}

export function registerGithubTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_github_conventions',
    {
      title: 'GitHub conventions',
      description:
        'How Tasker links branches, commits and pull requests to tasks in this workspace: naming rules, connected repositories and which projects move task status automatically when a PR is opened or merged.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => runTool(ctx, 'get_github_conventions', () => loadGithubGuide(ctx)),
  );

  server.registerTool(
    'preview_github_links',
    {
      title: 'Preview GitHub links',
      description:
        'Check which tasks a branch name, commit message or PR title/description will be linked to — uses the same parser as the Tasker webhook. Run before pushing a branch or opening a PR.',
      inputSchema: {
        text: z.string().min(1).max(20_000).describe('Branch name, commit message or PR text'),
        repository: z
          .string()
          .max(200)
          .optional()
          .describe('owner/repo of the current repository, to check it is connected'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(ctx, 'preview_github_links', () => previewGithubLinksTool(ctx, args)),
  );
}
