import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import type { WorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';

import type { StatusSet } from '../../models';

const requireWorkspacePermission = vi.fn<() => Promise<WorkspaceAccess>>();
const lockProject = vi.fn<() => Promise<boolean>>();
const listByProject =
  vi.fn<
    () => Promise<{ id: string; name: string; category: string; color: string; position: number }[]>
  >();
const saveSet = vi.fn<(tx: unknown, ws: string, project: string, set: StatusSet) => string[]>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspacePermission: () => requireWorkspacePermission(),
}));
vi.mock('@/shared/db', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
}));
vi.mock('./status.repository', () => ({
  statusRepository: {
    lockProject: () => lockProject(),
    listByProject: () => listByProject(),
    saveSet: (...args: Parameters<typeof saveSet>) => saveSet(...args),
  },
}));

const { addStatus, deleteStatus, moveStatus } = await import('./status.service');

const session: AuthSession = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    image: null,
    role: 'user',
    banned: false,
  },
  session: { id: 's-1', expiresAt: new Date('2030-01-01') },
};

const PROJECT_ID = '0192f3a0-0000-7000-8000-000000000001';
const S1 = '0192f3a0-0000-7000-8000-0000000000a1';
const S2 = '0192f3a0-0000-7000-8000-0000000000a2';
const ref = { workspaceId: 'ws-1', projectId: PROJECT_ID };

function savedSet(): StatusSet {
  const call = saveSet.mock.calls[0];
  if (!call) throw new Error('saveSet was not called');
  return call[3];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspacePermission.mockResolvedValue({
    userId: 'user-1',
    workspaceId: 'ws-1',
    memberId: 'm-1',
    role: 'owner',
    permissions: { manageProjects: true },
  });
  lockProject.mockResolvedValue(true);
  saveSet.mockReturnValue([]);
  listByProject.mockResolvedValue([
    { id: S1, name: 'К выполнению', category: 'todo', color: 'gray', position: 0 },
    { id: S2, name: 'Готово', category: 'done', color: 'green', position: 1 },
  ]);
});

describe('status mutations', () => {
  it('returns NOT_FOUND for a project outside the workspace', async () => {
    lockProject.mockResolvedValue(false);
    await expect(deleteStatus(session, { ...ref, statusId: S1 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(saveSet).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for a status of another project', async () => {
    await expect(
      moveStatus(session, {
        ...ref,
        statusId: '0192f3a0-0000-7000-8000-0000000000ff',
        direction: 'up',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses to delete the last status', async () => {
    listByProject.mockResolvedValue([
      { id: S1, name: 'К выполнению', category: 'todo', color: 'gray', position: 0 },
    ]);
    await expect(deleteStatus(session, { ...ref, statusId: S1 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(saveSet).not.toHaveBeenCalled();
  });

  it('saves normalized positions after move', async () => {
    await moveStatus(session, { ...ref, statusId: S2, direction: 'up' });
    expect(savedSet().statuses.map(({ id, position }) => [id, position])).toEqual([
      [S2, 0],
      [S1, 1],
    ]);
  });

  it('adds a status and returns its id', async () => {
    saveSet.mockReturnValue(['new-id']);
    await expect(
      addStatus(session, { ...ref, name: 'В работе', category: 'in_progress', color: 'blue' }),
    ).resolves.toEqual({ statusId: 'new-id' });
    expect(savedSet().statuses.at(-1)).toMatchObject({ id: null, name: 'В работе', position: 2 });
  });

  it('rejects malformed status id before touching the database', async () => {
    await expect(deleteStatus(session, { ...ref, statusId: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(lockProject).not.toHaveBeenCalled();
  });
});
