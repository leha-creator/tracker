import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess, WorkspaceRole } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';

import type { AttachmentRow } from './attachment.select';

const requireWorkspaceAccess =
  vi.fn<(session: AuthSession, ws: string) => Promise<WorkspaceAccess>>();
const repo = {
  taskExists: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  countForTarget: vi.fn<(...args: unknown[]) => Promise<number>>(),
  createPending: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(),
  findById: vi.fn<(...args: unknown[]) => Promise<AttachmentRow | null>>(),
  find: vi.fn<(...args: unknown[]) => Promise<AttachmentRow | null>>(),
  markReady: vi.fn<(...args: unknown[]) => Promise<number>>(),
  delete: vi.fn<(...args: unknown[]) => Promise<number>>(),
  listForTask: vi.fn<(...args: unknown[]) => Promise<AttachmentRow[]>>(),
  commentContent:
    vi.fn<(...args: unknown[]) => Promise<{ bodyLength: number; attachments: number } | null>>(),
  findStale: vi.fn<(...args: unknown[]) => Promise<{ id: string; storageKey: string }[]>>(),
  deleteByIds: vi.fn<(...args: unknown[]) => Promise<number>>(),
};
const storage = {
  createUploadPost: vi.fn<(...args: unknown[]) => Promise<{ url: string; fields: object }>>(),
  createDownloadUrl: vi.fn<(input: { contentDisposition: string }) => Promise<string>>(),
  headObject: vi.fn<(...args: unknown[]) => Promise<{ size: number } | null>>(),
  readObjectPrefix: vi.fn<(...args: unknown[]) => Promise<Uint8Array>>(),
  deleteObjects: vi.fn<(keys: readonly string[]) => Promise<number>>(),
};

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: (...args: Parameters<typeof requireWorkspaceAccess>) =>
    requireWorkspaceAccess(...args),
}));
vi.mock('@/modules/projects', () => ({
  isEntityId: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
  parseStatusColor: (value: string) => value,
}));
vi.mock('@/shared/storage', () => ({
  createUploadPost: (...args: unknown[]) => storage.createUploadPost(...args),
  createDownloadUrl: (input: { contentDisposition: string }) => storage.createDownloadUrl(input),
  headObject: (...args: unknown[]) => storage.headObject(...args),
  readObjectPrefix: (...args: unknown[]) => storage.readObjectPrefix(...args),
  deleteObjects: (keys: readonly string[]) => storage.deleteObjects(keys),
}));
vi.mock('./attachment.repository', () => ({
  attachmentRepository: Object.fromEntries(
    Object.entries(repo).map(([name, fn]) => [name, (...args: unknown[]) => fn(...args)]),
  ),
}));

const {
  completeUpload,
  deleteAttachment,
  getAttachmentDownload,
  listTaskAttachments,
  requestUpload,
} = await import('./attachment.service');

const session: AuthSession = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    image: null,
    role: 'user',
    banned: false,
    isAgent: false,
  },
  session: { id: 's-1', expiresAt: new Date('2030-01-01') },
};

const TASK_ID = '0192f3a0-0000-7000-8000-000000000010';
const ATTACHMENT_ID = '0192f3a0-0000-7000-8000-0000000000a1';
const COMMENT_ID = '0192f3a0-0000-7000-8000-0000000000c1';
const KEY = { workspaceId: 'ws-1', taskId: TASK_ID, attachmentId: ATTACHMENT_ID };
const STORAGE_KEY = `ws/ws-1/tasks/${TASK_ID}/object`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function row(overrides: Partial<AttachmentRow> = {}): AttachmentRow {
  const uploaderId = overrides.uploaderId === undefined ? 'user-1' : overrides.uploaderId;
  return {
    id: ATTACHMENT_ID,
    workspaceId: 'ws-1',
    taskId: TASK_ID,
    target: 'task',
    commentId: null,
    fileName: 'photo.png',
    contentType: 'image/png',
    size: 100,
    storageKey: STORAGE_KEY,
    status: 'pending',
    createdAt: new Date('2026-10-16T10:00:00.000Z'),
    uploader: uploaderId ? { id: uploaderId, name: 'Uploader', image: null } : null,
    ...overrides,
    uploaderId,
  };
}

function accessAs(role: WorkspaceRole, userId = session.user.id) {
  requireWorkspaceAccess.mockImplementation((_session, workspaceId) =>
    Promise.resolve({
      userId,
      workspaceId,
      memberId: 'm-1',
      role,
      permissions: { manageProjects: role === 'owner', manageDocuments: role === 'owner' },
    }),
  );
}

const uploadInput = {
  workspaceId: 'ws-1',
  taskId: TASK_ID,
  target: 'task' as const,
  fileName: 'Отчёт.pdf',
  size: 1000,
};

beforeEach(() => {
  vi.clearAllMocks();
  accessAs('member');
  repo.taskExists.mockResolvedValue(true);
  repo.countForTarget.mockResolvedValue(0);
  repo.createPending.mockResolvedValue({ id: ATTACHMENT_ID });
  repo.find.mockResolvedValue(row());
  repo.findById.mockResolvedValue(row({ status: 'ready' }));
  repo.markReady.mockResolvedValue(1);
  repo.delete.mockResolvedValue(1);
  repo.listForTask.mockResolvedValue([]);
  repo.commentContent.mockResolvedValue({ bodyLength: 5, attachments: 1 });
  repo.findStale.mockResolvedValue([]);
  repo.deleteByIds.mockResolvedValue(0);
  storage.createUploadPost.mockResolvedValue({ url: 'http://s3/bucket', fields: { key: 'k' } });
  storage.createDownloadUrl.mockResolvedValue('http://s3/signed');
  storage.headObject.mockResolvedValue({ size: 100 });
  storage.readObjectPrefix.mockResolvedValue(PNG);
  storage.deleteObjects.mockResolvedValue(0);
});

describe('requestUpload', () => {
  it('creates pending row with content type from extension and returns presigned post', async () => {
    const result = await requestUpload(session, uploadInput);

    expect(result).toEqual({
      attachmentId: ATTACHMENT_ID,
      url: 'http://s3/bucket',
      fields: { key: 'k' },
    });
    expect(repo.createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'Отчёт.pdf',
        contentType: 'application/pdf',
        uploaderId: 'user-1',
        storageKey: expect.stringMatching(new RegExp(`^ws/ws-1/tasks/${TASK_ID}/[0-9a-f-]{36}$`)),
      }),
    );
    expect(storage.createUploadPost).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'application/pdf', size: 1000, expiresIn: 300 }),
    );
  });

  it('hides tasks of other workspaces and non-members', async () => {
    repo.taskExists.mockResolvedValue(false);
    await expect(requestUpload(session, uploadInput)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    requireWorkspaceAccess.mockRejectedValue(new NotFoundError('Пространство не найдено'));
    await expect(requestUpload(session, uploadInput)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.createPending).not.toHaveBeenCalled();
  });

  it('rejects forbidden type and oversize without creating a row', async () => {
    await expect(
      requestUpload(session, { ...uploadInput, fileName: 'virus.exe' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      requestUpload(session, { ...uploadInput, size: 25 * 1024 * 1024 + 1 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.createPending).not.toHaveBeenCalled();
  });

  it('enforces task and comment limits', async () => {
    repo.countForTarget.mockResolvedValue(20);
    await expect(requestUpload(session, uploadInput)).rejects.toThrow('не больше 20');

    repo.countForTarget.mockResolvedValue(10);
    await expect(requestUpload(session, { ...uploadInput, target: 'comment' })).rejects.toThrow(
      'не больше 10',
    );
  });

  it('purges stale uploads of the user', async () => {
    repo.findStale.mockResolvedValue([{ id: 'old', storageKey: 'ws/old' }]);
    repo.deleteByIds.mockResolvedValue(1);

    await requestUpload(session, uploadInput);

    expect(repo.findStale).toHaveBeenCalledWith('user-1', expect.any(Date), 50);
    expect(repo.deleteByIds).toHaveBeenCalledWith(['old']);
    expect(storage.deleteObjects).toHaveBeenCalledWith(['ws/old']);
  });
});

describe('completeUpload', () => {
  it('marks verified image as ready', async () => {
    await expect(completeUpload(session, KEY)).resolves.toEqual({ target: 'task' });
    expect(storage.readObjectPrefix).toHaveBeenCalledWith(STORAGE_KEY, 16);
    expect(repo.markReady).toHaveBeenCalledWith(KEY, expect.any(Date));
  });

  it('skips signature check for non-images', async () => {
    repo.find.mockResolvedValue(row({ contentType: 'application/pdf', fileName: 'a.pdf' }));
    await completeUpload(session, KEY);
    expect(storage.readObjectPrefix).not.toHaveBeenCalled();
  });

  it('hides slots of other users', async () => {
    repo.find.mockResolvedValue(row({ uploaderId: 'user-2' }));
    await expect(completeUpload(session, KEY)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.markReady).not.toHaveBeenCalled();
  });

  it.each([
    ['missing object', () => storage.headObject.mockResolvedValue(null)],
    ['size mismatch', () => storage.headObject.mockResolvedValue({ size: 99 })],
    [
      'spoofed signature',
      () => storage.readObjectPrefix.mockResolvedValue(new TextEncoder().encode('<html>')),
    ],
  ])('discards upload on %s', async (_name, arrange) => {
    arrange();
    await expect(completeUpload(session, KEY)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.delete).toHaveBeenCalledWith(KEY);
    expect(storage.deleteObjects).toHaveBeenCalledWith([STORAGE_KEY]);
    expect(repo.markReady).not.toHaveBeenCalled();
  });

  it('is a no-op for already uploaded file', async () => {
    repo.find.mockResolvedValue(row({ status: 'ready' }));
    await expect(completeUpload(session, KEY)).resolves.toEqual({ target: 'task' });
    expect(storage.headObject).not.toHaveBeenCalled();
  });
});

describe('deleteAttachment', () => {
  it('lets uploader delete and removes the object', async () => {
    repo.find.mockResolvedValue(row({ status: 'ready' }));
    await deleteAttachment(session, KEY);
    expect(repo.delete).toHaveBeenCalledWith(KEY);
    expect(storage.deleteObjects).toHaveBeenCalledWith([STORAGE_KEY]);
  });

  it('lets owner delete a file of another user', async () => {
    accessAs('owner', 'owner-1');
    repo.find.mockResolvedValue(row({ status: 'ready' }));
    await expect(deleteAttachment(session, KEY)).resolves.toEqual({ target: 'task' });
  });

  it('forbids member to delete a file of another user', async () => {
    repo.find.mockResolvedValue(row({ status: 'ready', uploaderId: 'user-2' }));
    await expect(deleteAttachment(session, KEY)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('hides drafts of other users even from owner', async () => {
    accessAs('owner', 'owner-1');
    repo.find.mockResolvedValue(row({ status: 'ready', target: 'comment' }));
    await expect(deleteAttachment(session, KEY)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps the last file of a comment without text', async () => {
    repo.find.mockResolvedValue(row({ status: 'ready', target: 'comment', commentId: COMMENT_ID }));
    repo.commentContent.mockResolvedValue({ bodyLength: 0, attachments: 1 });
    await expect(deleteAttachment(session, KEY)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    repo.commentContent.mockResolvedValue({ bodyLength: 0, attachments: 2 });
    await expect(deleteAttachment(session, KEY)).resolves.toEqual({ target: 'comment' });
  });

  it('returns NOT_FOUND when row disappeared', async () => {
    repo.find.mockResolvedValue(row({ status: 'ready' }));
    repo.delete.mockResolvedValue(0);
    await expect(deleteAttachment(session, KEY)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(storage.deleteObjects).not.toHaveBeenCalled();
  });
});

describe('getAttachmentDownload', () => {
  it('serves previewable image inline on request', async () => {
    await getAttachmentDownload(session, ATTACHMENT_ID, { inline: true });
    expect(storage.createDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentDisposition: expect.stringMatching(/^inline;/) }),
    );
  });

  it('forces attachment disposition for other types', async () => {
    repo.findById.mockResolvedValue(
      row({ status: 'ready', contentType: 'image/svg+xml', fileName: 'logo.svg' }),
    );
    await getAttachmentDownload(session, ATTACHMENT_ID, { inline: true });
    expect(storage.createDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentDisposition: expect.stringMatching(/^attachment;/) }),
    );
  });

  it('checks access to the workspace of the file', async () => {
    requireWorkspaceAccess.mockRejectedValue(new NotFoundError('Пространство не найдено'));
    await expect(getAttachmentDownload(session, ATTACHMENT_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(requireWorkspaceAccess).toHaveBeenCalledWith(session, 'ws-1');
  });

  it('hides pending uploads, drafts of others and invalid ids', async () => {
    repo.findById.mockResolvedValue(row());
    await expect(getAttachmentDownload(session, ATTACHMENT_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    repo.findById.mockResolvedValue(
      row({ status: 'ready', target: 'comment', uploaderId: 'user-2' }),
    );
    await expect(getAttachmentDownload(session, ATTACHMENT_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    await expect(getAttachmentDownload(session, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
});

describe('listTaskAttachments', () => {
  it('maps rows to DTO with links and rights', async () => {
    repo.listForTask.mockResolvedValue([
      row({ status: 'ready' }),
      row({ id: 'other', status: 'ready', uploaderId: 'user-2', contentType: 'application/pdf' }),
    ]);

    const items = await listTaskAttachments(session, 'ws-1', TASK_ID);

    expect(items[0]).toMatchObject({
      kind: 'image',
      href: `/api/attachments/${ATTACHMENT_ID}`,
      previewHref: `/api/attachments/${ATTACHMENT_ID}?inline=1`,
      canDelete: true,
    });
    expect(items[1]).toMatchObject({ kind: 'pdf', previewHref: null, canDelete: false });
  });
});
