import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import type { WorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';

import {
  DOCUMENT_DOWNLOAD_TTL_SECONDS,
  DOCUMENT_MEDIA_TTL_SECONDS,
  DOCUMENT_TEXT_PREVIEW_MAX_BYTES,
} from '../../models';

const WS = 'ws-1';
const DOC = '0199f3a4-1b2c-7d3e-8f40-0000000000d1';
const MB = 1024 * 1024;

const requireWorkspacePermission = vi.fn<(...args: unknown[]) => Promise<WorkspaceAccess>>();
const requireWorkspaceAccess = vi.fn<(...args: unknown[]) => Promise<WorkspaceAccess>>();

type FileRow = {
  id: string;
  workspaceId: string;
  kind: 'note' | 'file';
  title: string;
  content: string | null;
  fileName: string | null;
  extension: string | null;
  contentType: string | null;
  size: number | null;
  storageKey: string | null;
  status: 'pending' | 'ready' | null;
  createdById: string | null;
};

const repo = {
  findById: vi.fn<(id: string) => Promise<FileRow | null>>(),
  findInWorkspace: vi.fn<(ws: string, id: string) => Promise<FileRow | null>>(),
  lockQuota: vi.fn(),
  usage: vi.fn<() => Promise<{ usedBytes: number; filesCount: number }>>(),
  createPending: vi.fn<(tx: unknown, data: Record<string, unknown>) => Promise<{ id: string }>>(),
  markReady: vi.fn<() => Promise<number>>(),
  delete: vi.fn<() => Promise<number>>(),
  findStale: vi.fn<() => Promise<{ id: string; storageKey: string | null }[]>>(),
  deleteByIds: vi.fn<() => Promise<number>>(),
};
const storage = {
  createUploadPost: vi.fn<(input: Record<string, unknown>) => Promise<unknown>>(),
  createDownloadUrl: vi.fn<(input: Record<string, unknown>) => Promise<string>>(),
  deleteObjects: vi.fn<(keys: readonly string[]) => Promise<number>>(),
  headObject: vi.fn<() => Promise<{ size: number } | null>>(),
  readObjectPrefix: vi.fn<() => Promise<Uint8Array>>(),
  readObjectText: vi.fn<(key: string, max: number) => Promise<unknown>>(),
};
const loadFolder = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: (...args: unknown[]) => requireWorkspaceAccess(...args),
  requireWorkspacePermission: (...args: unknown[]) => requireWorkspacePermission(...args),
}));
vi.mock('@/shared/db', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
}));
vi.mock('@/shared/env', () => ({
  getEnv: () => ({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DOCUMENTS_WORKSPACE_QUOTA_MB: 10 }),
}));
vi.mock('@/shared/storage', () => storage);
vi.mock('../folder/folder.service', () => ({
  loadFolder: (...args: unknown[]) => loadFolder(...args),
}));
vi.mock('./file.repository', () => ({ fileRepository: repo }));

const {
  cancelDocumentUpload,
  completeDocumentUpload,
  getDocumentFile,
  getDocumentText,
  getWorkspaceStorageUsage,
  requestDocumentUpload,
} = await import('./file.service');

const session = { user: { id: 'user-1' } } as AuthSession;
const access = {
  userId: 'user-1',
  workspaceId: WS,
  memberId: 'm-1',
  role: 'member',
  permissions: { manageProjects: false, manageDocuments: true },
} satisfies WorkspaceAccess;

function fileRow(overrides: Partial<FileRow> = {}): FileRow {
  return {
    id: DOC,
    workspaceId: WS,
    kind: 'file',
    title: 'Схема',
    content: null,
    fileName: 'Схема.png',
    extension: 'png',
    contentType: 'image/png',
    size: 8,
    storageKey: `ws/${WS}/docs/obj`,
    status: 'pending',
    createdById: 'user-1',
    ...overrides,
  };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspacePermission.mockResolvedValue(access);
  requireWorkspaceAccess.mockResolvedValue(access);
  repo.usage.mockResolvedValue({ usedBytes: 0, filesCount: 0 });
  repo.findStale.mockResolvedValue([]);
  repo.createPending.mockResolvedValue({ id: DOC });
  repo.markReady.mockResolvedValue(1);
  repo.delete.mockResolvedValue(1);
  storage.createUploadPost.mockResolvedValue({ url: 'http://s3/bucket', fields: { key: 'k' } });
  storage.createDownloadUrl.mockResolvedValue('http://s3/signed');
  storage.deleteObjects.mockResolvedValue(0);
});

describe('requestDocumentUpload', () => {
  const input = { workspaceId: WS, folderId: null, fileName: 'Отчёт за май.pdf', size: 2 * MB };

  it('creates a pending document under the workspace prefix and returns the upload form', async () => {
    await expect(requestDocumentUpload(session, input)).resolves.toEqual({
      documentId: DOC,
      url: 'http://s3/bucket',
      fields: { key: 'k' },
    });
    expect(requireWorkspacePermission).toHaveBeenCalledWith(session, WS, 'manageDocuments');
    expect(repo.lockQuota).toHaveBeenCalled();
    const data = repo.createPending.mock.calls[0]?.[1];
    expect(data).toMatchObject({
      workspaceId: WS,
      title: 'Отчёт за май',
      titleKey: 'отчёт за май',
      fileName: 'Отчёт за май.pdf',
      extension: 'pdf',
      contentType: 'application/pdf',
      size: 2 * MB,
      userId: 'user-1',
    });
    expect(String(data?.storageKey)).toMatch(new RegExp(`^ws/${WS}/docs/[0-9a-f-]{36}$`));
    expect(storage.createUploadPost).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'application/pdf', size: 2 * MB }),
    );
  });

  it('rejects types outside the allowlist and empty files', async () => {
    await expect(
      requestDocumentUpload(session, { ...input, fileName: 'setup.exe' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(requestDocumentUpload(session, { ...input, size: 0 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(repo.createPending).not.toHaveBeenCalled();
  });

  it('allows filling the quota exactly and rejects exceeding it', async () => {
    repo.usage.mockResolvedValue({ usedBytes: 8 * MB, filesCount: 3 });
    await expect(requestDocumentUpload(session, input)).resolves.toBeDefined();

    repo.usage.mockResolvedValue({ usedBytes: 8 * MB + 1, filesCount: 3 });
    await expect(requestDocumentUpload(session, input)).rejects.toThrow(/не хватает места/);
  });

  it('checks the folder and purges stale uploads of the user', async () => {
    repo.findStale.mockResolvedValue([{ id: 'old', storageKey: 'ws/x/docs/old' }]);
    repo.deleteByIds.mockResolvedValue(1);
    const folderId = '0199f3a4-1b2c-7d3e-8f40-0000000000f1';
    await requestDocumentUpload(session, { ...input, folderId });
    expect(loadFolder).toHaveBeenCalledWith(WS, folderId);
    expect(storage.deleteObjects).toHaveBeenCalledWith(['ws/x/docs/old']);
  });
});

describe('completeDocumentUpload', () => {
  const key = { workspaceId: WS, documentId: DOC };

  it('marks a valid upload ready', async () => {
    repo.findInWorkspace.mockResolvedValue(fileRow());
    storage.headObject.mockResolvedValue({ size: 8 });
    storage.readObjectPrefix.mockResolvedValue(PNG);
    await expect(completeDocumentUpload(session, key)).resolves.toEqual({ documentId: DOC });
    expect(repo.markReady).toHaveBeenCalled();
  });

  it('discards an upload with a wrong signature', async () => {
    repo.findInWorkspace.mockResolvedValue(fileRow());
    storage.headObject.mockResolvedValue({ size: 8 });
    storage.readObjectPrefix.mockResolvedValue(new TextEncoder().encode('<script>'));
    await expect(completeDocumentUpload(session, key)).rejects.toThrow(/не соответствует/);
    expect(repo.delete).toHaveBeenCalled();
    expect(storage.deleteObjects).toHaveBeenCalledWith([`ws/${WS}/docs/obj`]);
    expect(repo.markReady).not.toHaveBeenCalled();
  });

  it('discards an upload with a different size or a missing object', async () => {
    repo.findInWorkspace.mockResolvedValue(fileRow());
    storage.headObject.mockResolvedValue({ size: 9 });
    await expect(completeDocumentUpload(session, key)).rejects.toThrow(/не полностью/);

    storage.headObject.mockResolvedValue(null);
    await expect(completeDocumentUpload(session, key)).rejects.toThrow(/не загрузился/);
  });

  it('skips the signature check for types without one', async () => {
    repo.findInWorkspace.mockResolvedValue(
      fileRow({ extension: 'txt', contentType: 'text/plain', fileName: 'a.txt' }),
    );
    storage.headObject.mockResolvedValue({ size: 8 });
    await completeDocumentUpload(session, key);
    expect(storage.readObjectPrefix).not.toHaveBeenCalled();
  });

  it('hides uploads of other users', async () => {
    repo.findInWorkspace.mockResolvedValue(fileRow({ createdById: 'user-2' }));
    await expect(completeDocumentUpload(session, key)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('is idempotent for a ready file', async () => {
    repo.findInWorkspace.mockResolvedValue(fileRow({ status: 'ready' }));
    await completeDocumentUpload(session, key);
    expect(storage.headObject).not.toHaveBeenCalled();
  });
});

describe('cancelDocumentUpload', () => {
  it('deletes a pending upload and keeps a completed one', async () => {
    repo.findInWorkspace.mockResolvedValue(fileRow());
    await cancelDocumentUpload(session, { workspaceId: WS, documentId: DOC });
    expect(repo.delete).toHaveBeenCalled();

    vi.clearAllMocks();
    requireWorkspacePermission.mockResolvedValue(access);
    repo.findInWorkspace.mockResolvedValue(fileRow({ status: 'ready' }));
    await cancelDocumentUpload(session, { workspaceId: WS, documentId: DOC });
    expect(repo.delete).not.toHaveBeenCalled();
  });
});

describe('getDocumentFile', () => {
  it('checks access to the workspace of the document', async () => {
    repo.findById.mockResolvedValue(fileRow({ status: 'ready', workspaceId: 'ws-9' }));
    requireWorkspaceAccess.mockRejectedValue(new NotFoundError());
    await expect(getDocumentFile(session, DOC)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(requireWorkspaceAccess).toHaveBeenCalledWith(session, 'ws-9');
  });

  it('hides pending uploads and malformed ids', async () => {
    repo.findById.mockResolvedValue(fileRow());
    await expect(getDocumentFile(session, DOC)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getDocumentFile(session, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('serves images inline with a short link', async () => {
    repo.findById.mockResolvedValue(fileRow({ status: 'ready' }));
    await expect(getDocumentFile(session, DOC, { inline: true })).resolves.toEqual({
      kind: 'redirect',
      url: 'http://s3/signed',
    });
    expect(storage.createDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        contentDisposition: expect.stringMatching(/^inline;/),
        expiresIn: DOCUMENT_DOWNLOAD_TTL_SECONDS,
      }),
    );
  });

  it('gives media a long link and never serves markup inline', async () => {
    repo.findById.mockResolvedValue(
      fileRow({ status: 'ready', extension: 'mp4', contentType: 'video/mp4', fileName: 'a.mp4' }),
    );
    await getDocumentFile(session, DOC, { inline: true });
    expect(storage.createDownloadUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ expiresIn: DOCUMENT_MEDIA_TTL_SECONDS }),
    );

    repo.findById.mockResolvedValue(
      fileRow({
        status: 'ready',
        extension: 'html',
        contentType: 'text/plain',
        fileName: 'a.html',
      }),
    );
    await getDocumentFile(session, DOC, { inline: true });
    expect(storage.createDownloadUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ contentDisposition: expect.stringMatching(/^attachment;/) }),
    );
  });

  it('exports a note as Markdown', async () => {
    repo.findById.mockResolvedValue(
      fileRow({
        kind: 'note',
        title: 'План: Q1',
        content: '# План',
        status: null,
        storageKey: null,
      }),
    );
    await expect(getDocumentFile(session, DOC)).resolves.toEqual({
      kind: 'note',
      content: '# План',
      contentDisposition: expect.stringContaining('.md'),
    });
  });
});

describe('getDocumentText', () => {
  it('reads up to the preview limit for text viewers', async () => {
    repo.findInWorkspace.mockResolvedValue(
      fileRow({ status: 'ready', extension: 'csv', contentType: 'text/csv', fileName: 'a.csv' }),
    );
    storage.readObjectText.mockResolvedValue({ text: 'a,b', truncated: false });
    await expect(getDocumentText(session, WS, DOC)).resolves.toEqual({
      text: 'a,b',
      truncated: false,
    });
    expect(storage.readObjectText).toHaveBeenCalledWith(
      `ws/${WS}/docs/obj`,
      DOCUMENT_TEXT_PREVIEW_MAX_BYTES,
    );
  });

  it('refuses binary files', async () => {
    repo.findInWorkspace.mockResolvedValue(fileRow({ status: 'ready' }));
    await expect(getDocumentText(session, WS, DOC)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('getWorkspaceStorageUsage', () => {
  it('reports usage against the configured quota', async () => {
    repo.usage.mockResolvedValue({ usedBytes: 5 * MB, filesCount: 2 });
    await expect(getWorkspaceStorageUsage(session, WS)).resolves.toEqual({
      usedBytes: 5 * MB,
      filesCount: 2,
      quotaBytes: 10 * MB,
    });
  });
});
