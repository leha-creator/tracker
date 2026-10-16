import 'server-only';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  completeDocumentUpload,
  createFolder,
  createNote,
  DOCUMENT_ACCEPT,
  DOCUMENT_FILE_MAX_SIZE,
  DOCUMENT_TAGS_LIMIT,
  DOCUMENT_TITLE_MAX_LENGTH,
  FOLDER_NAME_MAX_LENGTH,
  getDocument,
  linkDocumentToTask,
  listFolderTree,
  listTags,
  NOTE_CONTENT_MAX_LENGTH,
  requestDocumentUpload,
  setDocumentTags,
  TASK_DOCUMENT_LINKS_LIMIT,
  unlinkDocumentFromTask,
  updateNote,
  type DocumentDto,
} from '@/modules/documents';
import { ConflictError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import type { McpContext } from '../context';
import { buildUploadCommand, humanSize, resolveFolder, resolveTag } from '../models';
import { runTool, type ToolOutput } from '../tool-result';
import { findTask } from '../workspace-data';
import { documentRefArg, documentUrl, folderArg } from './document-tools';
import { taskRefArg } from './read-tools';

const log = createLogger('mcp');

/** Сколько живёт слот загрузки документа (как у вложений). */
const UPLOAD_TTL_MINUTES = 5;

const CONFLICT_MESSAGE =
  'Документ изменили после вашего чтения: вызовите get_document и примените правку к новой версии (version).';

const titleArg = z.string().trim().min(1).max(DOCUMENT_TITLE_MAX_LENGTH);
const tagsArg = z
  .array(z.string().trim().min(1))
  .max(DOCUMENT_TAGS_LIMIT)
  .describe('Existing tag names or ids (see list_document_tags); new tags are not created');

async function folderIdOf(ctx: McpContext, ref: string | undefined): Promise<string | null> {
  if (!ref) return null;
  return resolveFolder(await listFolderTree(ctx.session, ctx.workspace.id), ref).id;
}

async function tagIdsOf(ctx: McpContext, refs: readonly string[]): Promise<string[]> {
  if (refs.length === 0) return [];
  const tags = await listTags(ctx.session, ctx.workspace.id);
  return refs.map((ref) => resolveTag(tags, ref).id);
}

async function loadNote(ctx: McpContext, ref: string): Promise<DocumentDto> {
  const document = await getDocument(ctx.session, ctx.workspace.id, ref);
  if (document.kind !== 'note') {
    throw new ValidationError('Это файл, а не заметка: менять можно только содержимое заметки');
  }
  return document;
}

export const createNoteArgs = {
  title: titleArg,
  content: z.string().max(NOTE_CONTENT_MAX_LENGTH).describe('Markdown'),
  folder: folderArg.optional().describe('Folder; default — the workspace root'),
  tags: tagsArg.optional(),
  tasks: z
    .array(taskRefArg)
    .max(TASK_DOCUMENT_LINKS_LIMIT)
    .optional()
    .describe('Tasks to link the note to, e.g. ["TSK-42"]'),
};

export async function createNoteTool(
  ctx: McpContext,
  args: {
    title: string;
    content: string;
    folder?: string;
    tags?: string[];
    tasks?: (string | number)[];
  },
): Promise<ToolOutput> {
  const workspaceId = ctx.workspace.id;
  // Всё, что может не найтись, проверяем до создания: заметка не останется без тегов и связей.
  const [folderId, tagIds, tasks] = await Promise.all([
    folderIdOf(ctx, args.folder),
    tagIdsOf(ctx, args.tags ?? []),
    Promise.all((args.tasks ?? []).map((ref) => findTask(ctx, ref))),
  ]);

  const note = await createNote(ctx.session, {
    workspaceId,
    folderId,
    title: args.title,
    content: args.content,
  });
  if (tagIds.length) {
    await setDocumentTags(ctx.session, { workspaceId, documentId: note.id, tagIds });
  }
  for (const task of tasks) {
    await linkDocumentToTask(ctx.session, { workspaceId, taskId: task.id, documentId: note.id });
  }
  log.info(
    {
      documentId: note.id,
      version: note.version,
      length: args.content.length,
      tags: tagIds.length,
      tasks: tasks.length,
      tokenId: ctx.tokenId,
    },
    '[mcp.create_note] created',
  );
  const linked = tasks.length ? `Linked to ${tasks.map((task) => task.key).join(', ')}.` : null;
  return {
    text: [
      `Created note «${note.title}» (id ${note.id}, version ${note.version}).`,
      `URL: ${documentUrl(ctx, note.id)}`,
      linked,
    ]
      .filter(Boolean)
      .join('\n'),
    activity: { summary: `Создал заметку «${note.title}»`, targetKey: note.id },
  };
}

export const updateNoteArgs = {
  document: documentRefArg,
  version: z.number().int().min(1).describe('version from get_document'),
  title: titleArg.optional(),
  content: z
    .string()
    .max(NOTE_CONTENT_MAX_LENGTH)
    .optional()
    .describe('The whole new Markdown (not a diff)'),
};

export async function updateNoteTool(
  ctx: McpContext,
  args: { document: string; version: number; title?: string; content?: string },
): Promise<ToolOutput> {
  if (args.title === undefined && args.content === undefined) {
    throw new ValidationError('Нечего менять: укажите title или content');
  }
  const note = await loadNote(ctx, args.document);
  let saved: { version: number };
  try {
    saved = await updateNote(ctx.session, {
      workspaceId: ctx.workspace.id,
      documentId: note.id,
      title: args.title ?? note.title,
      content: args.content ?? note.content ?? '',
      version: args.version,
    });
  } catch (error) {
    if (error instanceof ConflictError) {
      log.warn(
        { documentId: note.id, expected: args.version, tokenId: ctx.tokenId },
        '[mcp.update_note] version conflict',
      );
      throw new ConflictError(CONFLICT_MESSAGE);
    }
    throw error;
  }
  const title = args.title ?? note.title;
  log.info(
    {
      documentId: note.id,
      version: saved.version,
      length: (args.content ?? note.content ?? '').length,
      tokenId: ctx.tokenId,
    },
    '[mcp.update_note] updated',
  );
  return {
    text: `Updated note «${title}»: version ${args.version} → ${saved.version}.`,
    activity: {
      summary: `Изменил заметку «${title}» (v${args.version} → v${saved.version})`,
      targetKey: note.id,
    },
  };
}

export async function createFolderTool(
  ctx: McpContext,
  args: { name: string; parent?: string },
): Promise<ToolOutput> {
  const parentId = await folderIdOf(ctx, args.parent);
  const folder = await createFolder(ctx.session, {
    workspaceId: ctx.workspace.id,
    parentId,
    name: args.name,
  });
  log.info({ folderId: folder.id, parentId, tokenId: ctx.tokenId }, '[mcp.create_document_folder]');
  return {
    text: `Created folder «${folder.name}» (id ${folder.id}).`,
    activity: { summary: `Создал папку «${folder.name}»`, targetKey: null },
  };
}

export async function setDocumentTagsTool(
  ctx: McpContext,
  args: { document: string; tags: string[] },
): Promise<ToolOutput> {
  const document = await getDocument(ctx.session, ctx.workspace.id, args.document);
  const tags = await listTags(ctx.session, ctx.workspace.id);
  const picked = args.tags.map((ref) => resolveTag(tags, ref));
  await setDocumentTags(ctx.session, {
    workspaceId: ctx.workspace.id,
    documentId: document.id,
    tagIds: picked.map((tag) => tag.id),
  });
  log.info(
    { documentId: document.id, tags: picked.length, tokenId: ctx.tokenId },
    '[mcp.set_document_tags]',
  );
  const names = picked.map((tag) => tag.name).join(', ') || 'без тегов';
  return {
    text: `Tags of «${document.title}»: ${picked.map((tag) => tag.name).join(', ') || 'none'}.`,
    activity: { summary: `Изменил теги «${document.title}»: ${names}`, targetKey: document.id },
  };
}

export async function linkDocumentTool(
  ctx: McpContext,
  args: { document: string; task: string | number },
  link: boolean,
): Promise<ToolOutput> {
  const [document, task] = await Promise.all([
    getDocument(ctx.session, ctx.workspace.id, args.document),
    findTask(ctx, args.task),
  ]);
  const input = { workspaceId: ctx.workspace.id, taskId: task.id, documentId: document.id };
  if (link) await linkDocumentToTask(ctx.session, input);
  else await unlinkDocumentFromTask(ctx.session, input);
  log.info(
    { documentId: document.id, taskId: task.id, link, tokenId: ctx.tokenId },
    '[mcp.document_link] changed',
  );
  return link
    ? {
        text: `Linked «${document.title}» to ${task.key}.`,
        activity: { summary: `Связал «${document.title}» с ${task.key}`, targetKey: task.key },
      }
    : {
        text: `Unlinked «${document.title}» from ${task.key}.`,
        activity: { summary: `Отвязал «${document.title}» от ${task.key}`, targetKey: task.key },
      };
}

export const requestDocumentUploadArgs = {
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe(`File name; the extension decides the type. Allowed: ${DOCUMENT_ACCEPT}`),
  size: z
    .number()
    .int()
    .min(1)
    .max(DOCUMENT_FILE_MAX_SIZE)
    .describe('Exact file size in bytes (the upload must match it)'),
  folder: folderArg.optional().describe('Folder; default — the workspace root'),
};

export async function requestDocumentUploadTool(
  ctx: McpContext,
  args: { fileName: string; size: number; folder?: string },
): Promise<string> {
  const folderId = await folderIdOf(ctx, args.folder);
  const slot = await requestDocumentUpload(ctx.session, {
    workspaceId: ctx.workspace.id,
    folderId,
    fileName: args.fileName,
    size: args.size,
  });
  log.info(
    { documentId: slot.documentId, folderId, size: args.size, tokenId: ctx.tokenId },
    '[mcp.document_upload] slot issued',
  );
  return [
    `Upload slot for "${args.fileName}" (${humanSize(args.size)}).`,
    `documentId: ${slot.documentId}`,
    '',
    `1. Within ${UPLOAD_TTL_MINUTES} minutes upload the file (replace the path; the file must be exactly ${args.size} bytes). The command is for bash — on Windows run it in Git Bash or WSL:`,
    '',
    '```bash',
    buildUploadCommand(slot),
    '```',
    '',
    'The storage answers 204 with an empty body on success. 403 means the slot expired or the size differs — request a new slot.',
    `2. Call complete_document_upload with documentId "${slot.documentId}" — the file then appears in Documents.`,
    '',
    'The upload URL and fields are secret signed data: do not paste them into comments, commits or PRs.',
  ].join('\n');
}

export async function completeDocumentUploadTool(
  ctx: McpContext,
  args: { documentId: string },
): Promise<ToolOutput> {
  const { documentId } = await completeDocumentUpload(ctx.session, {
    workspaceId: ctx.workspace.id,
    documentId: args.documentId,
  });
  const document = await getDocument(ctx.session, ctx.workspace.id, documentId);
  log.info(
    { documentId, size: document.size, tokenId: ctx.tokenId },
    '[mcp.document_upload] uploaded',
  );
  return {
    text: `File «${document.title}» uploaded (id ${documentId}).\nURL: ${documentUrl(ctx, documentId)}`,
    activity: { summary: `Загрузил файл «${document.title}»`, targetKey: documentId },
  };
}

export function registerDocumentWriteTools(server: McpServer, ctx: McpContext): void {
  const write = { destructiveHint: false, openWorldHint: false } as const;

  server.registerTool(
    'create_note',
    {
      title: 'Create note',
      description:
        'Create a Markdown note in workspace Documents (spec, ADR, report, implementation notes), optionally in a folder, with existing tags and linked to tasks.',
      inputSchema: createNoteArgs,
      annotations: write,
    },
    (args) => runTool(ctx, 'create_note', () => createNoteTool(ctx, args)),
  );

  server.registerTool(
    'update_note',
    {
      title: 'Update note',
      description:
        'Replace the title and/or the whole Markdown of a note. Pass version from get_document; if someone changed the note meanwhile, the call fails — re-read it and apply your edit again.',
      inputSchema: updateNoteArgs,
      annotations: { ...write, idempotentHint: true },
    },
    (args) => runTool(ctx, 'update_note', () => updateNoteTool(ctx, args)),
  );

  server.registerTool(
    'create_document_folder',
    {
      title: 'Create document folder',
      description: 'Create a folder in workspace Documents.',
      inputSchema: {
        name: z.string().trim().min(1).max(FOLDER_NAME_MAX_LENGTH),
        parent: folderArg.optional().describe('Parent folder; default — the root'),
      },
      annotations: write,
    },
    (args) => runTool(ctx, 'create_document_folder', () => createFolderTool(ctx, args)),
  );

  server.registerTool(
    'set_document_tags',
    {
      title: 'Set document tags',
      description: 'Replace the tags of a document with the given existing tags ([] removes all).',
      inputSchema: { document: documentRefArg, tags: tagsArg },
      annotations: { ...write, idempotentHint: true },
    },
    (args) => runTool(ctx, 'set_document_tags', () => setDocumentTagsTool(ctx, args)),
  );

  server.registerTool(
    'link_document_to_task',
    {
      title: 'Link document to task',
      description: 'Link a document to a task: it shows in the task and in get_task.',
      inputSchema: { document: documentRefArg, task: taskRefArg },
      annotations: { ...write, idempotentHint: true },
    },
    (args) => runTool(ctx, 'link_document_to_task', () => linkDocumentTool(ctx, args, true)),
  );

  server.registerTool(
    'unlink_document_from_task',
    {
      title: 'Unlink document from task',
      description: 'Remove the link between a document and a task (the document stays).',
      inputSchema: { document: documentRefArg, task: taskRefArg },
      annotations: { ...write, idempotentHint: true },
    },
    (args) => runTool(ctx, 'unlink_document_from_task', () => linkDocumentTool(ctx, args, false)),
  );

  server.registerTool(
    'request_document_upload',
    {
      title: 'Request document upload',
      description:
        'Step 1 of uploading a file to Documents: get a one-time upload slot and a curl command. Then call complete_document_upload. The workspace storage quota applies.',
      inputSchema: requestDocumentUploadArgs,
      annotations: write,
    },
    (args) => runTool(ctx, 'request_document_upload', () => requestDocumentUploadTool(ctx, args)),
  );

  server.registerTool(
    'complete_document_upload',
    {
      title: 'Complete document upload',
      description:
        'Step 2: confirm the uploaded file (checks size and type) — it appears in Documents.',
      inputSchema: { documentId: z.uuid() },
      annotations: { ...write, idempotentHint: true },
    },
    (args) => runTool(ctx, 'complete_document_upload', () => completeDocumentUploadTool(ctx, args)),
  );
}
