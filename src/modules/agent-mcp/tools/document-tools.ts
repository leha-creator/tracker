import 'server-only';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  DOCUMENT_KIND_FILTERS,
  DOCUMENT_LIST_QUERY_MAX_LENGTH,
  folderPath,
  formatFolderPath,
  getDocument,
  getDocumentFile,
  getDocumentText,
  listDocuments,
  listDocumentTasks,
  listFolderTree,
  listTags,
  parseDocumentListParams,
} from '@/modules/documents';
import { createLogger } from '@/shared/logger';

import type { McpContext } from '../context';
import {
  formatDocument,
  formatDocumentList,
  formatFolderTree,
  formatTagList,
  resolveFolder,
  resolveTag,
  type DocumentBody,
} from '../models';
import { runTool } from '../tool-result';

const log = createLogger('mcp');

const TEXT_VIEWERS = new Set(['markdown', 'csv', 'tsv', 'json', 'code']);

export const documentRefArg = z
  .string()
  .trim()
  .min(1)
  .describe('Document id (from list_documents)');
export const folderArg = z
  .string()
  .trim()
  .min(1)
  .describe('Folder id, name or path like "Specs / API" (see list_document_folders)');

export function documentUrl(ctx: McpContext, documentId: string): string {
  return `${ctx.baseUrl.replace(/\/+$/, '')}/w/${ctx.workspace.slug}/docs/${documentId}`;
}

export const listDocumentsArgs = {
  query: z
    .string()
    .max(DOCUMENT_LIST_QUERY_MAX_LENGTH)
    .optional()
    .describe('Search in titles across the whole workspace'),
  folder: folderArg.optional().describe('Folder to list; default — the workspace root'),
  tag: z.string().trim().min(1).optional().describe('Tag name or id'),
  kind: z.enum(DOCUMENT_KIND_FILTERS).optional(),
  page: z.number().int().min(1).optional(),
};

export async function listDocumentsTool(
  ctx: McpContext,
  args: {
    query?: string;
    folder?: string;
    tag?: string;
    kind?: (typeof DOCUMENT_KIND_FILTERS)[number];
    page?: number;
  },
): Promise<string> {
  const workspaceId = ctx.workspace.id;
  const [folders, tags] = await Promise.all([
    args.folder ? listFolderTree(ctx.session, workspaceId) : [],
    args.tag ? listTags(ctx.session, workspaceId) : [],
  ]);
  const raw: Record<string, string> = {};
  if (args.query) raw.q = args.query;
  if (args.folder) raw.folder = resolveFolder(folders, args.folder).id;
  if (args.tag) raw.tag = resolveTag(tags, args.tag).id;
  if (args.kind) raw.kind = args.kind;
  if (args.page) raw.page = String(args.page);

  const page = await listDocuments(ctx.session, workspaceId, parseDocumentListParams(raw));
  log.debug(
    { workspaceId, filters: Object.keys(raw).filter((key) => key !== 'q'), total: page.total },
    '[mcp.list_documents] query',
  );
  return formatDocumentList(page);
}

export async function getDocumentTool(
  ctx: McpContext,
  args: { document: string },
): Promise<string> {
  const workspaceId = ctx.workspace.id;
  const document = await getDocument(ctx.session, workspaceId, args.document);
  const [tasks, folders] = await Promise.all([
    listDocumentTasks(ctx.session, workspaceId, document.id),
    document.folderId ? listFolderTree(ctx.session, workspaceId) : [],
  ]);

  let body: DocumentBody;
  if (document.kind === 'note') {
    body = { kind: 'note', content: document.content ?? '' };
  } else if (document.viewer && TEXT_VIEWERS.has(document.viewer)) {
    const { text, truncated } = await getDocumentText(ctx.session, workspaceId, document.id);
    body = { kind: 'text', text, truncated };
  } else {
    const file = await getDocumentFile(ctx.session, document.id);
    body =
      file.kind === 'redirect'
        ? { kind: 'link', url: file.url }
        : { kind: 'note', content: file.content };
  }

  const text = formatDocument({
    document,
    folderPath: document.folderId ? formatFolderPath(folderPath(folders, document.folderId)) : '',
    body,
    tasks,
    url: documentUrl(ctx, document.id),
  });
  // Содержимое и ссылку не логируем — только размер и вид.
  log.debug(
    {
      documentId: document.id,
      kind: document.kind,
      body: body.kind,
      length:
        body.kind === 'link' ? null : body.kind === 'note' ? body.content.length : body.text.length,
      truncated: body.kind === 'text' ? body.truncated : false,
    },
    '[mcp.get_document]',
  );
  return text;
}

export function registerDocumentReadTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'list_documents',
    {
      title: 'List documents',
      description:
        'Workspace documents: Markdown notes (specs, ADRs, guides) and files. Without filters — the root folder; query, tag or kind search the whole workspace.',
      inputSchema: listDocumentsArgs,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(ctx, 'list_documents', () => listDocumentsTool(ctx, args)),
  );

  server.registerTool(
    'list_document_folders',
    {
      title: 'List document folders',
      description: 'The folder tree of workspace documents with ids.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      runTool(ctx, 'list_document_folders', async () =>
        formatFolderTree(await listFolderTree(ctx.session, ctx.workspace.id)),
      ),
  );

  server.registerTool(
    'list_document_tags',
    {
      title: 'List document tags',
      description: 'Tags of workspace documents with ids.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      runTool(ctx, 'list_document_tags', async () =>
        formatTagList(await listTags(ctx.session, ctx.workspace.id)),
      ),
  );

  server.registerTool(
    'get_document',
    {
      title: 'Get document',
      description:
        'Read a document: a note with its Markdown and version (needed for update_note), a text file with its content (first 100 KB), other files — a short-lived download link. Also lists linked tasks.',
      inputSchema: { document: documentRefArg },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(ctx, 'get_document', () => getDocumentTool(ctx, args)),
  );
}
