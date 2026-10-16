import 'server-only';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_SIZE,
  completeAttachmentUpload,
  getAttachmentDownload,
  requestAttachmentUpload,
} from '@/modules/tasks';
import { createLogger } from '@/shared/logger';

import type { McpContext } from '../context';
import { buildUploadCommand, humanSize } from '../models';
import { runTool, type ToolOutput } from '../tool-result';
import { findTask } from '../workspace-data';
import { taskRefArg } from './read-tools';

const log = createLogger('mcp');

/** Сколько живёт слот загрузки (ATTACHMENT_UPLOAD_TTL_SECONDS в tasks). */
const UPLOAD_TTL_MINUTES = 5;

export const requestUploadArgs = {
  task: taskRefArg,
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe(
      `File name; the extension decides the type. Allowed: ${ATTACHMENT_ACCEPT}. For logs and other text use .txt, e.g. "build-error.txt"`,
    ),
  size: z
    .number()
    .int()
    .min(1)
    .max(ATTACHMENT_MAX_SIZE)
    .describe('Exact file size in bytes (the upload must match it)'),
  target: z
    .enum(['task', 'comment'])
    .optional()
    .describe('"task" (default) — attach to the task; "comment" — attach to the next add_comment'),
};

export async function requestUploadTool(
  ctx: McpContext,
  args: { task: string | number; fileName: string; size: number; target?: 'task' | 'comment' },
): Promise<string> {
  const task = await findTask(ctx, args.task);
  const target = args.target ?? 'task';
  const slot = await requestAttachmentUpload(ctx.session, {
    workspaceId: ctx.workspace.id,
    taskId: task.id,
    target,
    fileName: args.fileName,
    size: args.size,
  });
  log.info(
    {
      taskId: task.id,
      attachmentId: slot.attachmentId,
      target,
      size: args.size,
      tokenId: ctx.tokenId,
    },
    '[mcp.request_attachment_upload] slot issued',
  );

  const finish =
    target === 'task'
      ? `complete_attachment_upload with task "${task.key}" and attachmentId "${slot.attachmentId}" — the file then appears in the task.`
      : `complete_attachment_upload with task "${task.key}" and attachmentId "${slot.attachmentId}", then add_comment on ${task.key} with attachmentIds: ["${slot.attachmentId}"].`;
  return [
    `Upload slot for "${args.fileName}" (${humanSize(args.size)}) on ${task.key}.`,
    `attachmentId: ${slot.attachmentId}`,
    '',
    `1. Within ${UPLOAD_TTL_MINUTES} minutes upload the file (replace the path; the file must be exactly ${args.size} bytes). The command is for bash — on Windows run it in Git Bash or WSL:`,
    '',
    '```bash',
    buildUploadCommand(slot),
    '```',
    '',
    'The storage answers 204 with an empty body on success. 403 means the slot expired or the size differs — request a new slot.',
    `2. Call ${finish}`,
    '',
    'The upload URL and fields are secret signed data: do not paste them into comments, commits or PRs.',
  ].join('\n');
}

export async function completeUploadTool(
  ctx: McpContext,
  args: { task: string | number; attachmentId: string },
): Promise<ToolOutput> {
  const task = await findTask(ctx, args.task);
  const { target } = await completeAttachmentUpload(ctx.session, {
    workspaceId: ctx.workspace.id,
    taskId: task.id,
    attachmentId: args.attachmentId,
  });
  log.info(
    { taskId: task.id, attachmentId: args.attachmentId, target, tokenId: ctx.tokenId },
    '[mcp.complete_attachment_upload] uploaded',
  );
  if (target === 'task') {
    return {
      text: `File attached to ${task.key}.`,
      activity: { summary: `Прикрепил файл к ${task.key}`, targetKey: task.key },
    };
  }
  // Файл комментария — черновик: в журнал попадёт add_comment.
  return `File uploaded. Now call add_comment on ${task.key} with attachmentIds: ["${args.attachmentId}"] — until then it is a draft visible only to you (drafts are removed after 24 hours).`;
}

export async function getAttachmentUrlTool(
  ctx: McpContext,
  args: { attachmentId: string },
): Promise<string> {
  const { url } = await getAttachmentDownload(ctx.session, args.attachmentId);
  log.debug(
    { attachmentId: args.attachmentId, tokenId: ctx.tokenId },
    '[mcp.get_attachment_url] issued',
  );
  return [
    'Download link (valid for 60 seconds, use it right away):',
    url,
    '',
    'Example: curl -sS -o <file> "<link>". Do not share the link — it is signed.',
  ].join('\n');
}

export function registerAttachmentTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'request_attachment_upload',
    {
      title: 'Request attachment upload',
      description:
        'Step 1 of attaching a file (log, screenshot, report…) to a task or to a comment. Returns a short-lived upload slot and a ready curl command that sends the file directly to Tasker storage. Up to 25 MB, 20 files per task and 10 per comment; the type is taken from the file extension (see fileName). Then call complete_attachment_upload.',
      inputSchema: requestUploadArgs,
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    (args) => runTool(ctx, 'request_attachment_upload', () => requestUploadTool(ctx, args)),
  );

  server.registerTool(
    'complete_attachment_upload',
    {
      title: 'Complete attachment upload',
      description:
        'Step 2: confirm the upload after curl succeeded. Tasker checks that the file exists, its size and (for images) its content. Files for comments then go to add_comment attachmentIds.',
      inputSchema: {
        task: taskRefArg,
        attachmentId: z.uuid().describe('attachmentId from request_attachment_upload'),
      },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args) => runTool(ctx, 'complete_attachment_upload', () => completeUploadTool(ctx, args)),
  );

  server.registerTool(
    'get_attachment_url',
    {
      title: 'Get attachment download link',
      description:
        'A 60-second signed link to download a file attached to a task or comment (attachment ids are listed by get_task). Use it to read screenshots, logs or specs that people attached.',
      inputSchema: { attachmentId: z.uuid() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(ctx, 'get_attachment_url', () => getAttachmentUrlTool(ctx, args)),
  );
}
