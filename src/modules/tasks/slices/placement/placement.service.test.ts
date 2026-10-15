import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';

import { TASK_PLACEMENT_LIMIT } from '../../models';

type PlacementRow = { taskId: string; projectId: string; statusId: string; position: string };

const requireWorkspaceAccess = vi.fn<() => Promise<WorkspaceAccess>>();
const taskExists = vi.fn<() => Promise<boolean>>();
const findStatus =
  vi.fn<() => Promise<{ id: string; projectId: string; category: string } | null>>();
const listProjectIds = vi.fn<() => Promise<string[]>>();
const lastPosition = vi.fn<() => Promise<string | null>>();
const createPlacement = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const findPlacement = vi.fn<() => Promise<PlacementRow | null>>();
const updateStatus = vi.fn<(...args: unknown[]) => Promise<number>>();
const deletePlacement = vi.fn<(...args: unknown[]) => Promise<number>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: () => requireWorkspaceAccess(),
}));
vi.mock('@/modules/projects', () => ({
  isEntityId: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
}));
vi.mock('@/shared/db', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
  isUniqueViolation: (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002',
}));
vi.mock('./placement.repository', () => ({
  placementRepository: {
    taskExists: () => taskExists(),
    findStatus: () => findStatus(),
    listProjectIds: () => listProjectIds(),
    lastPosition: () => lastPosition(),
    create: (...args: unknown[]) => createPlacement(...args),
    find: () => findPlacement(),
    updateStatus: (...args: unknown[]) => updateStatus(...args),
    delete: (...args: unknown[]) => deletePlacement(...args),
  },
}));

const { addToProject, changeStatus, removeFromProject } = await import('./placement.service');

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

const TASK_ID = '0192f3a0-0000-7000-8000-000000000010';
const PROJECT_ID = '0192f3a0-0000-7000-8000-000000000001';
const OTHER_PROJECT = '0192f3a0-0000-7000-8000-000000000002';
const S1 = '0192f3a0-0000-7000-8000-0000000000a1';
const S2 = '0192f3a0-0000-7000-8000-0000000000a2';
const input = { workspaceId: 'ws-1', taskId: TASK_ID, projectId: PROJECT_ID, statusId: S2 };

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockResolvedValue({
    userId: 'user-1',
    workspaceId: 'ws-1',
    memberId: 'm-1',
    role: 'member',
    permissions: { manageProjects: false },
  });
  taskExists.mockResolvedValue(true);
  findStatus.mockResolvedValue({ id: S2, projectId: PROJECT_ID, category: 'in_progress' });
  listProjectIds.mockResolvedValue([]);
  lastPosition.mockResolvedValue(null);
  findPlacement.mockResolvedValue({
    taskId: TASK_ID,
    projectId: PROJECT_ID,
    statusId: S1,
    position: 'a0',
  });
  updateStatus.mockResolvedValue(1);
  deletePlacement.mockResolvedValue(1);
});

describe('addToProject', () => {
  it('places the task at the end of the column', async () => {
    lastPosition.mockResolvedValue('a5');
    await addToProject(session, input);
    const data = createPlacement.mock.calls[0]?.[1] as { position: string };
    expect(data).toMatchObject({ taskId: TASK_ID, projectId: PROJECT_ID, statusId: S2 });
    expect(data.position > 'a5').toBe(true);
  });

  it('rejects a project the task is already in', async () => {
    listProjectIds.mockResolvedValue([PROJECT_ID]);
    await expect(addToProject(session, input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(createPlacement).not.toHaveBeenCalled();
  });

  it('maps a unique violation race to CONFLICT', async () => {
    createPlacement.mockRejectedValue({ code: 'P2002' });
    await expect(addToProject(session, input)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects above the placement limit', async () => {
    listProjectIds.mockResolvedValue(
      Array.from({ length: TASK_PLACEMENT_LIMIT }, (_, i) => `p-${i}`),
    );
    await expect(addToProject(session, input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects a status of another project', async () => {
    findStatus.mockResolvedValue({ id: S2, projectId: OTHER_PROJECT, category: 'todo' });
    await expect(addToProject(session, input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns NOT_FOUND for a task of another workspace', async () => {
    taskExists.mockResolvedValue(false);
    await expect(addToProject(session, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('changeStatus', () => {
  it('moves the card to the end of the new column', async () => {
    lastPosition.mockResolvedValue('a9');
    await changeStatus(session, input);
    const [, workspaceId, key, data] = updateStatus.mock.calls[0] as [
      unknown,
      string,
      unknown,
      { statusId: string; position: string },
    ];
    expect(workspaceId).toBe('ws-1');
    expect(key).toEqual({ taskId: TASK_ID, projectId: PROJECT_ID });
    expect(data.statusId).toBe(S2);
    expect(data.position > 'a9').toBe(true);
  });

  it('does nothing for the same status', async () => {
    await changeStatus(session, { ...input, statusId: S1 });
    expect(findStatus).not.toHaveBeenCalled();
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('rejects a status of another project', async () => {
    findStatus.mockResolvedValue({ id: S2, projectId: OTHER_PROJECT, category: 'todo' });
    await expect(changeStatus(session, input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the task is not in the project', async () => {
    findPlacement.mockResolvedValue(null);
    await expect(changeStatus(session, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns NOT_FOUND for a status outside the workspace', async () => {
    findStatus.mockResolvedValue(null);
    await expect(changeStatus(session, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('removeFromProject', () => {
  it('removes the placement within the workspace', async () => {
    await removeFromProject(session, {
      workspaceId: 'ws-1',
      taskId: TASK_ID,
      projectId: PROJECT_ID,
    });
    expect(deletePlacement).toHaveBeenCalledWith('ws-1', {
      taskId: TASK_ID,
      projectId: PROJECT_ID,
    });
  });

  it('returns NOT_FOUND when nothing was removed', async () => {
    deletePlacement.mockResolvedValue(0);
    await expect(
      removeFromProject(session, { workspaceId: 'ws-1', taskId: TASK_ID, projectId: PROJECT_ID }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects malformed ids without a query', async () => {
    await expect(
      removeFromProject(session, { workspaceId: 'ws-1', taskId: 'x', projectId: PROJECT_ID }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(deletePlacement).not.toHaveBeenCalled();
  });
});
