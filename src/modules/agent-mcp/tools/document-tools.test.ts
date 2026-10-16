import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DocumentsModule from '@/modules/documents';
import type { DocumentDto } from '@/modules/documents';
import type { AuthVia } from '@/shared/auth';
import { ConflictError, ForbiddenError } from '@/shared/errors';

import type { McpContext } from '../context';
import { runTool } from '../tool-result';

const docs = {
  listDocuments: vi.fn(),
  listFolderTree: vi.fn(),
  listTags: vi.fn(),
  getDocument: vi.fn(),
  getDocumentText: vi.fn(),
  getDocumentFile: vi.fn(),
  listDocumentTasks: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  setDocumentTags: vi.fn(),
  linkDocumentToTask: vi.fn(),
  unlinkDocumentFromTask: vi.fn(),
  createFolder: vi.fn(),
  requestDocumentUpload: vi.fn(),
  completeDocumentUpload: vi.fn(),
};
const findTask = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const recordActivity = vi.fn<(input: unknown) => Promise<void>>();

vi.mock('@/modules/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof DocumentsModule>();
  return { ...actual, ...docs };
});
vi.mock('@/modules/api-tokens', () => ({
  recordActivity: (input: unknown) => recordActivity(input),
}));
vi.mock('../workspace-data', () => ({ findTask: (...args: unknown[]) => findTask(...args) }));
vi.mock('./read-tools', async () => {
  const { z } = await import('zod');
  return { taskRefArg: z.union([z.string(), z.number()]) };
});

const { listDocumentsTool, getDocumentTool } = await import('./document-tools');
const { createNoteTool, updateNoteTool, requestDocumentUploadTool, completeDocumentUploadTool } =
  await import('./document-write-tools');

const DOC = '0199e5a0-0000-7000-8000-00000000d001';
const FOLDER = '0199e5a0-0000-7000-8000-00000000f001';
const TAG = '0199e5a0-0000-7000-8000-00000000a001';

const VIA: AuthVia = {
  tokenId: 't-1',
  tokenName: 'CI',
  scopes: ['read', 'tasks', 'documents'],
  agent: { name: 'Claude', responsibleUserId: 'u-1', responsibleName: 'Анна' },
};

const ctx: McpContext = {
  session: {
    user: {
      id: 'agent-1',
      email: 'agent-1@agents.tasker.invalid',
      name: 'Claude',
      image: null,
      role: 'user',
      banned: false,
      isAgent: true,
    },
    session: { id: 'api-token:t-1', expiresAt: new Date('2030-01-01') },
    via: VIA,
  },
  workspace: { id: 'ws-1', slug: 'team', name: 'Команда', taskKey: 'TSK' },
  tokenId: 't-1',
  tokenPrefix: 'tkr_abcdefgh',
  via: VIA,
  baseUrl: 'http://localhost:3000',
};

function note(overrides: Partial<DocumentDto> = {}): DocumentDto {
  return {
    id: DOC,
    kind: 'note',
    title: 'ADR-1',
    folderId: null,
    extension: null,
    fileKind: null,
    viewer: null,
    size: null,
    tags: [],
    createdBy: { userId: 'agent-1', name: 'Claude', image: null },
    updatedBy: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-02T00:00:00Z'),
    workspaceId: 'ws-1',
    workspaceSlug: 'team',
    version: 3,
    content: '# ADR',
    fileName: null,
    inlineViewable: false,
    createdVia: null,
    ...overrides,
  };
}

function textOf(output: string | { text: string }): string {
  return typeof output === 'string' ? output : output.text;
}

beforeEach(() => {
  vi.clearAllMocks();
  recordActivity.mockResolvedValue();
  docs.listFolderTree.mockResolvedValue([
    { id: FOLDER, parentId: null, name: 'Specs', documentsCount: 1 },
  ]);
  docs.listTags.mockResolvedValue([
    { id: TAG, name: 'Архитектура', color: 'blue', documentsCount: 0 },
  ]);
  docs.getDocument.mockResolvedValue(note());
  docs.listDocumentTasks.mockResolvedValue([]);
  findTask.mockResolvedValue({ id: 'task-42', key: 'TSK-42', title: 'Вход' });
});

describe('list_documents', () => {
  it('resolves folder and tag names into list filters', async () => {
    docs.listDocuments.mockResolvedValue({
      path: [],
      folders: [],
      documents: [],
      isSearch: true,
      total: 0,
      page: 1,
      pageCount: 1,
      pageSize: 50,
    });
    await listDocumentsTool(ctx, {
      query: 'adr',
      folder: 'specs',
      tag: 'архитектура',
      kind: 'note',
    });
    const query = docs.listDocuments.mock.calls[0]![2] as Record<string, unknown>;
    expect(query).toMatchObject({ q: 'adr', folder: FOLDER, tag: TAG, kind: 'note', page: 1 });
  });
});

describe('get_document', () => {
  it('reads a text file through getDocumentText', async () => {
    docs.getDocument.mockResolvedValue(
      note({ kind: 'file', extension: 'md', viewer: 'markdown', content: null }),
    );
    docs.getDocumentText.mockResolvedValue({ text: 'hello', truncated: false });
    const text = await getDocumentTool(ctx, { document: DOC });
    expect(text).toContain('hello');
    expect(docs.getDocumentFile).not.toHaveBeenCalled();
  });

  it('gives a link for a binary file', async () => {
    docs.getDocument.mockResolvedValue(
      note({ kind: 'file', extension: 'png', viewer: 'image', content: null }),
    );
    docs.getDocumentFile.mockResolvedValue({ kind: 'redirect', url: 'https://s3/signed' });
    expect(await getDocumentTool(ctx, { document: DOC })).toContain('https://s3/signed');
  });
});

describe('create_note', () => {
  it('creates a note with tags and task links and returns a journal entry', async () => {
    docs.createNote.mockResolvedValue(note({ title: 'Итоги' }));
    const output = await createNoteTool(ctx, {
      title: 'Итоги',
      content: '# Итоги',
      folder: 'Specs',
      tags: ['Архитектура'],
      tasks: ['TSK-42'],
    });
    expect(docs.createNote).toHaveBeenCalledWith(ctx.session, {
      workspaceId: 'ws-1',
      folderId: FOLDER,
      title: 'Итоги',
      content: '# Итоги',
    });
    expect(docs.setDocumentTags).toHaveBeenCalledWith(ctx.session, {
      workspaceId: 'ws-1',
      documentId: DOC,
      tagIds: [TAG],
    });
    expect(docs.linkDocumentToTask).toHaveBeenCalledWith(ctx.session, {
      workspaceId: 'ws-1',
      taskId: 'task-42',
      documentId: DOC,
    });
    expect(output).toMatchObject({
      activity: { summary: 'Создал заметку «Итоги»', targetKey: DOC },
    });
    expect(textOf(output)).toContain('Linked to TSK-42');
  });

  it('does not create a note with an unknown tag', async () => {
    await expect(
      createNoteTool(ctx, { title: 'A', content: '', tags: ['Новый тег'] }),
    ).rejects.toThrow(/не найден/);
    expect(docs.createNote).not.toHaveBeenCalled();
  });

  it('without the manageDocuments permission — isError', async () => {
    docs.createNote.mockRejectedValue(
      new ForbiddenError('Недостаточно прав для управления документами'),
    );
    const result = await runTool(ctx, 'create_note', () =>
      createNoteTool(ctx, { title: 'A', content: '' }),
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('управления документами');
    expect(recordActivity).not.toHaveBeenCalled();
  });
});

describe('update_note', () => {
  it('saves with the version and keeps the omitted title', async () => {
    docs.updateNote.mockResolvedValue({ version: 4, updatedAt: new Date() });
    const output = await updateNoteTool(ctx, { document: DOC, version: 3, content: '# Новое' });
    expect(docs.updateNote).toHaveBeenCalledWith(ctx.session, {
      workspaceId: 'ws-1',
      documentId: DOC,
      title: 'ADR-1',
      content: '# Новое',
      version: 3,
    });
    expect(output).toMatchObject({
      activity: { summary: 'Изменил заметку «ADR-1» (v3 → v4)' },
    });
  });

  it('version conflict — isError with a hint to re-read', async () => {
    docs.updateNote.mockRejectedValue(new ConflictError('Заметку изменили'));
    const result = await runTool(ctx, 'update_note', () =>
      updateNoteTool(ctx, { document: DOC, version: 2, content: 'x' }),
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('get_document');
  });
});

describe('document upload', () => {
  it('issues a slot with a curl command and then confirms the file', async () => {
    docs.requestDocumentUpload.mockResolvedValue({
      documentId: DOC,
      url: 'http://minio/bucket',
      fields: { key: 'ws/ws-1/docs/x' },
    });
    const slot = await requestDocumentUploadTool(ctx, { fileName: 'report.pdf', size: 1024 });
    expect(docs.requestDocumentUpload).toHaveBeenCalledWith(ctx.session, {
      workspaceId: 'ws-1',
      folderId: null,
      fileName: 'report.pdf',
      size: 1024,
    });
    expect(slot).toContain('curl');
    expect(slot).toContain(`documentId: ${DOC}`);

    docs.completeDocumentUpload.mockResolvedValue({ documentId: DOC });
    docs.getDocument.mockResolvedValue(note({ kind: 'file', title: 'report', size: 1024 }));
    const done = await completeDocumentUploadTool(ctx, { documentId: DOC });
    expect(done).toMatchObject({ activity: { summary: 'Загрузил файл «report»', targetKey: DOC } });
  });
});
