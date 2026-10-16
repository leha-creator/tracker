import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import type { WorkspaceAccess, WorkspacePermission } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError, NotFoundError } from '@/shared/errors';

import { FOLDER_MAX_DEPTH } from '../../models';

const WS = 'ws-1';
const FOLDER = '0199f3a4-1b2c-7d3e-8f40-000000000001';
const PARENT = '0199f3a4-1b2c-7d3e-8f40-000000000002';
const TARGET = '0199f3a4-1b2c-7d3e-8f40-000000000003';

const requireWorkspacePermission =
  vi.fn<
    (
      session: AuthSession,
      workspaceId: string,
      permission: WorkspacePermission,
    ) => Promise<WorkspaceAccess>
  >();
const requireWorkspaceAccess = vi.fn<() => Promise<WorkspaceAccess>>();

type Row = { id: string; workspaceId: string; parentId: string | null; name: string };
const findInWorkspace = vi.fn<(ws: string, id: string) => Promise<Row | null>>();
const pathIds = vi.fn<(ws: string, id: string) => Promise<string[]>>();
const subtreeHeight = vi.fn<() => Promise<number>>();
const subtreeContents = vi.fn<() => Promise<{ storageKeys: string[]; documentsCount: number }>>();
const isNameTaken = vi.fn<(...args: unknown[]) => Promise<boolean>>();
const create = vi.fn<(tx: unknown, data: Record<string, unknown>) => Promise<Row>>();
const update = vi.fn<(...args: unknown[]) => Promise<number>>();
const deleteRow = vi.fn<() => Promise<number>>();
const listByWorkspace = vi.fn<() => Promise<unknown[]>>();
const deleteObjects = vi.fn<(keys: readonly string[]) => Promise<number>>();
const executeRaw = vi.fn();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: () => requireWorkspaceAccess(),
  requireWorkspacePermission: (...args: Parameters<typeof requireWorkspacePermission>) =>
    requireWorkspacePermission(...args),
}));
vi.mock('@/shared/db', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({ $executeRaw: executeRaw }),
  },
  isUniqueViolation: (error: { code?: string }) => error?.code === 'P2002',
}));
vi.mock('@/shared/storage', () => ({
  deleteObjects: (keys: readonly string[]) => deleteObjects(keys),
}));
vi.mock('./folder.repository', () => ({
  folderRepository: {
    findInWorkspace: (ws: string, id: string) => findInWorkspace(ws, id),
    pathIds: (ws: string, id: string) => pathIds(ws, id),
    subtreeHeight: () => subtreeHeight(),
    subtreeContents: () => subtreeContents(),
    isNameTaken: (...args: unknown[]) => isNameTaken(...args),
    create: (tx: unknown, data: Record<string, unknown>) => create(tx, data),
    update: (...args: unknown[]) => update(...args),
    delete: () => deleteRow(),
    listByWorkspace: () => listByWorkspace(),
  },
}));

const { createFolder, deleteFolder, listFolderTree, moveFolder, renameFolder } =
  await import('./folder.service');

const session = { user: { id: 'user-1' } } as AuthSession;
const access = {
  userId: 'user-1',
  workspaceId: WS,
  memberId: 'm-1',
  role: 'member',
  permissions: { manageProjects: false, manageDocuments: true },
} satisfies WorkspaceAccess;

const folderRow = (id: string, parentId: string | null = null, name = 'Папка'): Row => ({
  id,
  workspaceId: WS,
  parentId,
  name,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspacePermission.mockResolvedValue(access);
  requireWorkspaceAccess.mockResolvedValue(access);
  isNameTaken.mockResolvedValue(false);
  update.mockResolvedValue(1);
  deleteRow.mockResolvedValue(1);
  deleteObjects.mockResolvedValue(0);
});

describe('access', () => {
  it('requires manageDocuments for changes', async () => {
    requireWorkspacePermission.mockRejectedValue(new ForbiddenError());
    await expect(
      createFolder(session, { workspaceId: WS, parentId: null, name: 'A' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(requireWorkspacePermission).toHaveBeenCalledWith(session, WS, 'manageDocuments');
    expect(create).not.toHaveBeenCalled();
  });

  it('hides another workspace', async () => {
    requireWorkspaceAccess.mockRejectedValue(new NotFoundError());
    await expect(listFolderTree(session, 'ws-2')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('createFolder', () => {
  it('creates a root folder with a normalized name', async () => {
    create.mockResolvedValue(folderRow(FOLDER, null, 'Договоры 2026'));
    const folder = await createFolder(session, {
      workspaceId: WS,
      parentId: null,
      name: '  Договоры   2026 ',
    });
    expect(create).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: WS,
      parentId: null,
      name: 'Договоры 2026',
      nameKey: 'договоры 2026',
      createdById: 'user-1',
    });
    expect(folder).toEqual({
      id: FOLDER,
      parentId: null,
      name: 'Договоры 2026',
      documentsCount: 0,
    });
    expect(executeRaw).toHaveBeenCalled();
  });

  it('rejects a parent from another workspace', async () => {
    findInWorkspace.mockResolvedValue(null);
    await expect(
      createFolder(session, { workspaceId: WS, parentId: PARENT, name: 'A' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects exceeding the depth', async () => {
    findInWorkspace.mockResolvedValue(folderRow(PARENT));
    pathIds.mockResolvedValue(Array.from({ length: FOLDER_MAX_DEPTH }, (_, i) => `p${i}`));
    await expect(
      createFolder(session, { workspaceId: WS, parentId: PARENT, name: 'A' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('reports a duplicate name on the name field', async () => {
    isNameTaken.mockResolvedValue(true);
    await expect(
      createFolder(session, { workspaceId: WS, parentId: null, name: 'A' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', fieldErrors: { name: [expect.any(String)] } });
  });

  it('maps a unique violation race to the same error', async () => {
    create.mockRejectedValue({ code: 'P2002' });
    await expect(
      createFolder(session, { workspaceId: WS, parentId: null, name: 'A' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('validates the name', async () => {
    await expect(
      createFolder(session, { workspaceId: WS, parentId: null, name: 'a/b' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('renameFolder', () => {
  it('checks uniqueness within the same parent excluding itself', async () => {
    findInWorkspace.mockResolvedValue(folderRow(FOLDER, PARENT));
    await renameFolder(session, { workspaceId: WS, folderId: FOLDER, name: 'Новое' });
    expect(isNameTaken).toHaveBeenCalledWith(WS, PARENT, 'новое', FOLDER);
    expect(update).toHaveBeenCalledWith(WS, FOLDER, { name: 'Новое', nameKey: 'новое' });
  });

  it('returns NOT_FOUND for a malformed id without a query', async () => {
    await expect(
      renameFolder(session, { workspaceId: WS, folderId: 'nope', name: 'A' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(findInWorkspace).not.toHaveBeenCalled();
  });
});

describe('moveFolder', () => {
  beforeEach(() => {
    findInWorkspace.mockImplementation((_ws, id) =>
      Promise.resolve(id === FOLDER ? folderRow(FOLDER, PARENT) : folderRow(id)),
    );
    subtreeHeight.mockResolvedValue(2);
  });

  it('moves into another folder', async () => {
    pathIds.mockResolvedValue([TARGET]);
    await moveFolder(session, { workspaceId: WS, folderId: FOLDER, targetId: TARGET });
    expect(update).toHaveBeenCalledWith(WS, FOLDER, { parentId: TARGET }, expect.anything());
  });

  it('moves to the root', async () => {
    await moveFolder(session, { workspaceId: WS, folderId: FOLDER, targetId: null });
    expect(update).toHaveBeenCalledWith(WS, FOLDER, { parentId: null }, expect.anything());
  });

  it('skips moving to the same parent', async () => {
    await moveFolder(session, { workspaceId: WS, folderId: FOLDER, targetId: PARENT });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses to move into a descendant', async () => {
    pathIds.mockResolvedValue([FOLDER, TARGET]);
    await expect(
      moveFolder(session, { workspaceId: WS, folderId: FOLDER, targetId: TARGET }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a duplicate name in the target', async () => {
    pathIds.mockResolvedValue([TARGET]);
    isNameTaken.mockResolvedValue(true);
    await expect(
      moveFolder(session, { workspaceId: WS, folderId: FOLDER, targetId: TARGET }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('deleteFolder', () => {
  beforeEach(() => {
    findInWorkspace.mockResolvedValue(folderRow(FOLDER));
  });

  it('deletes rows and then storage objects of the whole subtree', async () => {
    subtreeContents.mockResolvedValue({ storageKeys: ['k1', 'k2'], documentsCount: 3 });
    const order: string[] = [];
    deleteRow.mockImplementation(() => {
      order.push('rows');
      return Promise.resolve(1);
    });
    deleteObjects.mockImplementation(() => {
      order.push('objects');
      return Promise.resolve(0);
    });

    await expect(deleteFolder(session, { workspaceId: WS, folderId: FOLDER })).resolves.toEqual({
      documentsDeleted: 3,
    });
    expect(deleteObjects).toHaveBeenCalledWith(['k1', 'k2']);
    expect(order).toEqual(['rows', 'objects']);
  });

  it('does not fail when storage cleanup fails', async () => {
    subtreeContents.mockResolvedValue({ storageKeys: ['k1'], documentsCount: 1 });
    deleteObjects.mockResolvedValue(1);
    await expect(deleteFolder(session, { workspaceId: WS, folderId: FOLDER })).resolves.toEqual({
      documentsDeleted: 1,
    });
  });

  it('skips storage for folders without files', async () => {
    subtreeContents.mockResolvedValue({ storageKeys: [], documentsCount: 2 });
    await deleteFolder(session, { workspaceId: WS, folderId: FOLDER });
    expect(deleteObjects).not.toHaveBeenCalled();
  });
});

describe('listFolderTree', () => {
  it('maps rows to DTOs', async () => {
    listByWorkspace.mockResolvedValue([
      { id: FOLDER, workspaceId: WS, parentId: null, name: 'A', _count: { documents: 4 } },
    ]);
    await expect(listFolderTree(session, WS)).resolves.toEqual([
      { id: FOLDER, parentId: null, name: 'A', documentsCount: 4 },
    ]);
  });
});
