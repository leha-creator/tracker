import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import type { WorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError } from '@/shared/errors';

import { DOCUMENT_TAGS_LIMIT, WORKSPACE_TAGS_LIMIT } from '../../models';

const WS = 'ws-1';
const DOC = '0199f3a4-1b2c-7d3e-8f40-0000000000d1';
const T1 = '0199f3a4-1b2c-7d3e-8f40-0000000000a1';
const T2 = '0199f3a4-1b2c-7d3e-8f40-0000000000a2';

const requireWorkspacePermission = vi.fn<(...args: unknown[]) => Promise<WorkspaceAccess>>();
const repo = {
  listByWorkspace: vi.fn(),
  findInWorkspace: vi.fn<() => Promise<unknown>>(),
  countInWorkspaceByIds: vi.fn<() => Promise<number>>(),
  countInWorkspace: vi.fn<() => Promise<number>>(),
  isNameTaken: vi.fn<() => Promise<boolean>>(),
  create: vi.fn<(data: Record<string, unknown>) => Promise<Record<string, string>>>(),
  update: vi.fn<() => Promise<number>>(),
  delete: vi.fn<() => Promise<number>>(),
  replaceDocumentTags: vi.fn(),
};
const loadDocument = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: vi.fn(),
  requireWorkspacePermission: (...args: unknown[]) => requireWorkspacePermission(...args),
}));
vi.mock('@/shared/db', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
  isUniqueViolation: (error: { code?: string }) => error?.code === 'P2002',
}));
vi.mock('../document/document.service', () => ({
  loadDocument: (...args: unknown[]) => loadDocument(...args),
}));
vi.mock('./tag.repository', () => ({ tagRepository: repo }));

const { createTag, deleteTag, setDocumentTags, updateTag } = await import('./tag.service');

const session = { user: { id: 'user-1' } } as AuthSession;
const access = {
  userId: 'user-1',
  workspaceId: WS,
  memberId: 'm-1',
  role: 'member',
  permissions: { manageProjects: false, manageDocuments: true },
} satisfies WorkspaceAccess;

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspacePermission.mockResolvedValue(access);
  repo.countInWorkspace.mockResolvedValue(0);
  repo.isNameTaken.mockResolvedValue(false);
  repo.update.mockResolvedValue(1);
  repo.delete.mockResolvedValue(1);
  loadDocument.mockResolvedValue({ id: DOC });
});

describe('createTag', () => {
  it('normalizes the name and stores a key', async () => {
    repo.create.mockResolvedValue({ id: T1, name: 'Важное', color: 'red' });
    await expect(
      createTag(session, { workspaceId: WS, name: ' #Важное ', color: 'red' }),
    ).resolves.toEqual({ id: T1, name: 'Важное', color: 'red', documentsCount: 0 });
    expect(repo.create).toHaveBeenCalledWith({
      workspaceId: WS,
      name: 'Важное',
      nameKey: 'важное',
      color: 'red',
    });
  });

  it('rejects duplicates, the limit and missing permission', async () => {
    repo.isNameTaken.mockResolvedValue(true);
    await expect(
      createTag(session, { workspaceId: WS, name: 'A', color: 'gray' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    repo.isNameTaken.mockResolvedValue(false);
    repo.countInWorkspace.mockResolvedValue(WORKSPACE_TAGS_LIMIT);
    await expect(
      createTag(session, { workspaceId: WS, name: 'A', color: 'gray' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    requireWorkspacePermission.mockRejectedValue(new ForbiddenError());
    await expect(
      createTag(session, { workspaceId: WS, name: 'A', color: 'gray' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('updateTag / deleteTag', () => {
  it('returns NOT_FOUND for a tag of another workspace', async () => {
    repo.findInWorkspace.mockResolvedValue(null);
    await expect(
      updateTag(session, { workspaceId: WS, tagId: T1, name: 'A', color: 'gray' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    repo.delete.mockResolvedValue(0);
    await expect(deleteTag(session, { workspaceId: WS, tagId: T1 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('setDocumentTags', () => {
  it('replaces the tags with deduplicated ids', async () => {
    repo.countInWorkspaceByIds.mockResolvedValue(2);
    await setDocumentTags(session, { workspaceId: WS, documentId: DOC, tagIds: [T1, T2, T1] });
    expect(loadDocument).toHaveBeenCalledWith(WS, DOC);
    expect(repo.replaceDocumentTags).toHaveBeenCalledWith(expect.anything(), WS, DOC, [T1, T2]);
  });

  it('refuses tags of another workspace', async () => {
    repo.countInWorkspaceByIds.mockResolvedValue(1);
    await expect(
      setDocumentTags(session, { workspaceId: WS, documentId: DOC, tagIds: [T1, T2] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.replaceDocumentTags).not.toHaveBeenCalled();
  });

  it('clears tags with an empty list and limits their number', async () => {
    await setDocumentTags(session, { workspaceId: WS, documentId: DOC, tagIds: [] });
    expect(repo.replaceDocumentTags).toHaveBeenCalledWith(expect.anything(), WS, DOC, []);

    const many = Array.from(
      { length: DOCUMENT_TAGS_LIMIT + 1 },
      (_, i) => `0199f3a4-1b2c-7d3e-8f40-${String(i).padStart(12, '0')}`,
    );
    await expect(
      setDocumentTags(session, { workspaceId: WS, documentId: DOC, tagIds: many }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
