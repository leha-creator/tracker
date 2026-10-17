import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';

import { TASK_PLACEMENT_LIMIT } from '../../models';

type PlacementRow = { taskId: string; projectId: string; statusId: string; position: string };

const requireWorkspaceAccess = vi.fn<() => Promise<WorkspaceAccess>>();
type ArchiveState = { taskArchived: boolean; projectArchived: boolean } | null;
const findArchiveState = vi.fn<() => Promise<ArchiveState>>();
const findStatus =
  vi.fn<() => Promise<{ id: string; projectId: string; category: string } | null>>();
const listProjectIds = vi.fn<() => Promise<string[]>>();
const lastPosition = vi.fn<() => Promise<string | null>>();
const createPlacement = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const findPlacement = vi.fn<() => Promise<PlacementRow | null>>();
const updateStatus = vi.fn<(...args: unknown[]) => Promise<number>>();
const deletePlacement = vi.fn<(...args: unknown[]) => Promise<number>>();
const listColumn = vi.fn<() => Promise<{ taskId: string; position: string }[]>>();
const updatePositions = vi.fn<(...args: unknown[]) => Promise<void>>();
const listWithCategory = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const recordHistory = vi.fn<(...args: unknown[]) => Promise<void>>();
const statusSnapshots = vi.fn((_tx: unknown, _workspaceId: string, ids: string[]) => {
  const refs = new Map(
    ids.map((id) => [
      id,
      { status: { id, name: `Статус ${id.slice(-2)}` }, project: { id: 'p', name: 'Проект' } },
    ]),
  );
  return Promise.resolve(refs);
});

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: () => requireWorkspaceAccess(),
}));
vi.mock('@/modules/projects', () => ({
  isEntityId: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
  ARCHIVED_PROJECT_MESSAGE: 'Проект в архиве — восстановите его, чтобы изменить',
}));
vi.mock('@/shared/db', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
  isForeignKeyViolation: (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003',
  isUniqueViolation: (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002',
}));
const notifyWatchersAboutStatus = vi.fn<(notice: unknown) => Promise<number>>(() =>
  Promise.resolve(1),
);
vi.mock('../watcher/watcher.service', () => ({
  notifyWatchersAboutStatus: (notice: unknown) => notifyWatchersAboutStatus(notice),
}));
vi.mock('../history/history.service', () => ({
  GITHUB_HISTORY_AUTHOR: { actorId: null, viaTokenId: null, source: 'github' },
  historyAuthorOf: (s: AuthSession) => ({
    actorId: s.user.id,
    viaTokenId: s.via?.tokenId ?? null,
    source: null,
  }),
  recordHistory: (...args: unknown[]) => recordHistory(...args),
  statusSnapshots: (tx: unknown, workspaceId: string, ids: string[]) =>
    statusSnapshots(tx, workspaceId, ids),
}));
vi.mock('./placement.repository', () => ({
  placementRepository: {
    findArchiveState: () => findArchiveState(),
    findStatus: () => findStatus(),
    listProjectIds: () => listProjectIds(),
    lastPosition: () => lastPosition(),
    create: (...args: unknown[]) => createPlacement(...args),
    find: () => findPlacement(),
    updateStatus: (...args: unknown[]) => updateStatus(...args),
    delete: (...args: unknown[]) => deletePlacement(...args),
    listColumn: () => listColumn(),
    updatePositions: (...args: unknown[]) => updatePositions(...args),
    listWithCategory: (...args: unknown[]) => listWithCategory(...args),
  },
}));

const {
  addToProject,
  changePlacementStatusBySystem,
  changeStatus,
  listPlacementsForAutomation,
  movePlacement,
  removeFromProject,
} = await import('./placement.service');

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
    permissions: { manageProjects: false, manageDocuments: false },
  });
  findArchiveState.mockResolvedValue({ taskArchived: false, projectArchived: false });
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
  listColumn.mockResolvedValue([]);
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
    findArchiveState.mockResolvedValue(null);
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
    expect(notifyWatchersAboutStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: TASK_ID,
        actor: { id: 'user-1', name: session.user.name },
      }),
    );
  });

  it('does nothing for the same status', async () => {
    await changeStatus(session, { ...input, statusId: S1 });
    expect(findStatus).not.toHaveBeenCalled();
    expect(updateStatus).not.toHaveBeenCalled();
    expect(notifyWatchersAboutStatus).not.toHaveBeenCalled();
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
    expect(deletePlacement).toHaveBeenCalledWith(
      'ws-1',
      { taskId: TASK_ID, projectId: PROJECT_ID },
      expect.anything(),
    );
    expect(recordHistory.mock.calls[0]?.[1]).toMatchObject({
      changes: [{ kind: 'project_removed', data: { project: { name: 'Проект' } } }],
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

describe('movePlacement', () => {
  const A = '0192f3a0-0000-7000-8000-0000000000b1';
  const B = '0192f3a0-0000-7000-8000-0000000000b2';
  const moveInput = { ...input, prevTaskId: null as string | null };

  function written(): { statusId: string; position: string } {
    const call = updateStatus.mock.calls[0] as [unknown, string, unknown, never];
    return call[3];
  }

  it('moves the card into another column between neighbours', async () => {
    listColumn.mockResolvedValue([
      { taskId: B, position: 'a1' },
      { taskId: A, position: 'a0' },
    ]);
    await movePlacement(session, { ...moveInput, prevTaskId: A });
    expect(written().statusId).toBe(S2);
    expect('a0' < written().position && written().position < 'a1').toBe(true);
  });

  it('moves the card to the top of the column', async () => {
    listColumn.mockResolvedValue([{ taskId: A, position: 'a0' }]);
    await movePlacement(session, moveInput);
    expect(written().position < 'a0').toBe(true);
  });

  it('moves the card to the bottom of the column', async () => {
    listColumn.mockResolvedValue([{ taskId: A, position: 'a0' }]);
    await movePlacement(session, { ...moveInput, prevTaskId: A });
    expect(written().position > 'a0').toBe(true);
  });

  it('reorders within the same column without loading the status', async () => {
    listColumn.mockResolvedValue([
      { taskId: TASK_ID, position: 'a0' },
      { taskId: A, position: 'a1' },
    ]);
    await movePlacement(session, { ...moveInput, statusId: S1, prevTaskId: A });
    expect(findStatus).not.toHaveBeenCalled();
    expect(written()).toMatchObject({ statusId: S1 });
    expect(written().position > 'a1').toBe(true);
  });

  it('records history only when the column changes', async () => {
    listColumn.mockResolvedValue([{ taskId: A, position: 'a0' }]);
    await movePlacement(session, moveInput);
    expect(recordHistory).toHaveBeenCalledTimes(1);
    expect(recordHistory.mock.calls[0]?.[1]).toMatchObject({
      author: { actorId: 'user-1', viaTokenId: null, source: null },
      changes: [{ kind: 'status', data: { from: { id: S1 }, to: { id: S2 } } }],
    });

    recordHistory.mockClear();
    listColumn.mockResolvedValue([
      { taskId: TASK_ID, position: 'a0' },
      { taskId: A, position: 'a1' },
    ]);
    await movePlacement(session, { ...moveInput, statusId: S1, prevTaskId: A });
    expect(recordHistory).not.toHaveBeenCalled();
  });

  it('does nothing when the card already stands under the anchor', async () => {
    listColumn.mockResolvedValue([
      { taskId: A, position: 'a0' },
      { taskId: TASK_ID, position: 'a1' },
    ]);
    await movePlacement(session, { ...moveInput, statusId: S1, prevTaskId: A });
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('rekeys the column when neighbours share a key', async () => {
    listColumn.mockResolvedValue([
      { taskId: A, position: 'a0' },
      { taskId: B, position: 'a0' },
    ]);
    await movePlacement(session, { ...moveInput, prevTaskId: A });
    const [, , , rows] = updatePositions.mock.calls[0] as [
      unknown,
      string,
      string,
      { taskId: string; position: string }[],
    ];
    expect(rows.map((row) => row.taskId)).toEqual([A, B]);
    const [first, second] = rows.map((row) => row.position) as [string, string];
    expect(first < written().position && written().position < second).toBe(true);
  });

  it('rejects a stale anchor with CONFLICT', async () => {
    listColumn.mockResolvedValue([{ taskId: B, position: 'a0' }]);
    await expect(movePlacement(session, { ...moveInput, prevTaskId: A })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('rejects a status of another project', async () => {
    findStatus.mockResolvedValue({ id: S2, projectId: OTHER_PROJECT, category: 'todo' });
    await expect(movePlacement(session, moveInput)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the task is not in the project', async () => {
    findPlacement.mockResolvedValue(null);
    await expect(movePlacement(session, moveInput)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a malformed anchor without a query', async () => {
    await expect(
      movePlacement(session, { ...moveInput, prevTaskId: 'nope' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(findPlacement).not.toHaveBeenCalled();
  });

  it('maps a deleted status (FK violation) to NOT_FOUND', async () => {
    updateStatus.mockRejectedValue({ code: 'P2003' });
    await expect(movePlacement(session, moveInput)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns NOT_FOUND for a non-member', async () => {
    requireWorkspaceAccess.mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'NOT_FOUND' }),
    );
    await expect(movePlacement(session, moveInput)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(findPlacement).not.toHaveBeenCalled();
  });
});

describe('changePlacementStatusBySystem', () => {
  const systemInput = { ...input, reason: 'github_pr_merged' };

  it('changes status without a session and reports change', async () => {
    lastPosition.mockResolvedValue(null);
    await expect(changePlacementStatusBySystem(systemInput)).resolves.toBe(true);
    expect(requireWorkspaceAccess).not.toHaveBeenCalled();
    expect(updateStatus).toHaveBeenCalledTimes(1);
    expect(recordHistory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        author: { actorId: null, viaTokenId: null, source: 'github' },
        changes: [expect.objectContaining({ kind: 'status' })],
      }),
    );
    expect(notifyWatchersAboutStatus).toHaveBeenCalledWith(
      expect.objectContaining({ actor: null, systemName: 'GitHub' }),
    );
  });

  it('reports no change for the same status', async () => {
    await expect(changePlacementStatusBySystem({ ...systemInput, statusId: S1 })).resolves.toBe(
      false,
    );
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('keeps project and placement checks', async () => {
    findStatus.mockResolvedValue({ id: S2, projectId: OTHER_PROJECT, category: 'todo' });
    await expect(changePlacementStatusBySystem(systemInput)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    findPlacement.mockResolvedValue(null);
    await expect(changePlacementStatusBySystem(systemInput)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('listPlacementsForAutomation', () => {
  it('maps categories and skips malformed ids without a query', async () => {
    listWithCategory.mockResolvedValue([
      { taskId: TASK_ID, projectId: PROJECT_ID, statusId: S1, status: { category: 'todo' } },
    ]);
    await expect(listPlacementsForAutomation('ws-1', [TASK_ID, TASK_ID, 'bad'])).resolves.toEqual([
      { taskId: TASK_ID, projectId: PROJECT_ID, statusId: S1, category: 'todo' },
    ]);
    expect(listWithCategory).toHaveBeenCalledWith('ws-1', [TASK_ID]);
    await expect(listPlacementsForAutomation('ws-1', ['bad'])).resolves.toEqual([]);
    expect(listWithCategory).toHaveBeenCalledTimes(1);
  });
});

describe('archive', () => {
  it('rejects changes of an archived task with VALIDATION_ERROR', async () => {
    findArchiveState.mockResolvedValue({ taskArchived: true, projectArchived: false });
    await expect(changeStatus(session, input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringMatching(/Задача в архиве/),
    });
    await expect(addToProject(session, input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(movePlacement(session, { ...input, prevTaskId: null })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(removeFromProject(session, input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(updateStatus).not.toHaveBeenCalled();
    expect(deletePlacement).not.toHaveBeenCalled();
  });

  it('rejects changes in an archived project', async () => {
    findArchiveState.mockResolvedValue({ taskArchived: false, projectArchived: true });
    await expect(changeStatus(session, input)).rejects.toMatchObject({
      message: expect.stringMatching(/Проект в архиве/),
    });
  });

  it('system skips an archived task without an error', async () => {
    findArchiveState.mockResolvedValue({ taskArchived: true, projectArchived: false });
    await expect(
      changePlacementStatusBySystem({ ...input, reason: 'github_pr_merged' }),
    ).resolves.toBe(false);
    expect(updateStatus).not.toHaveBeenCalled();
    expect(notifyWatchersAboutStatus).not.toHaveBeenCalled();
  });
});
