import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';

const requireWorkspaceAccess =
  vi.fn<(session: AuthSession, ws: string) => Promise<WorkspaceAccess>>();
const lockTree = vi.fn<(...args: unknown[]) => Promise<void>>();
const pathIds = vi.fn<(ws: string, taskId: string, tx?: unknown) => Promise<string[]>>();
const subtreeHeight = vi.fn<(...args: unknown[]) => Promise<number>>();
const subtreeIds = vi.fn<(...args: unknown[]) => Promise<string[]>>();
const countChildren = vi.fn<(...args: unknown[]) => Promise<number>>();
const setParent = vi.fn<(...args: unknown[]) => Promise<number>>();
const listChildren = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const childrenCategories = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const searchCandidates = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();

const assertTaskActive = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
const findArchiveState = vi.fn<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve({ archivedAt: null, parent: null }),
);
vi.mock('../task/task.repository', () => ({
  taskRepository: { findArchiveState: (...args: unknown[]) => findArchiveState(...args) },
}));
vi.mock('../task/task-archive.guard', () => ({
  assertTaskActive: (...args: unknown[]) => assertTaskActive(...args),
}));
vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: (...args: Parameters<typeof requireWorkspaceAccess>) =>
    requireWorkspaceAccess(...args),
}));
vi.mock('@/modules/projects', () => ({
  isEntityId: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
  parseStatusColor: (value: string) => value,
}));
vi.mock('@/shared/db', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
}));
const recordHistory = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('../history/history.service', () => ({
  historyAuthorOf: (s: AuthSession) => ({
    actorId: s.user.id,
    viaTokenId: s.via?.tokenId ?? null,
    source: null,
  }),
  recordHistory: (...args: unknown[]) => recordHistory(...args),
  taskSnapshot: (_tx: unknown, _workspaceId: string, taskId: string | null) =>
    Promise.resolve(
      taskId === null ? null : { id: taskId, number: 1, key: '#1', title: 'Родитель' },
    ),
}));
vi.mock('./subtask.repository', () => ({
  subtaskRepository: {
    lockTree: (...args: unknown[]) => lockTree(...args),
    pathIds: (ws: string, taskId: string, tx?: unknown) => pathIds(ws, taskId, tx),
    subtreeHeight: (...args: unknown[]) => subtreeHeight(...args),
    subtreeIds: (...args: unknown[]) => subtreeIds(...args),
    countChildren: (...args: unknown[]) => countChildren(...args),
    setParent: (...args: unknown[]) => setParent(...args),
    listChildren: (...args: unknown[]) => listChildren(...args),
    childrenCategories: (...args: unknown[]) => childrenCategories(...args),
    searchCandidates: (...args: unknown[]) => searchCandidates(...args),
  },
}));

const { getSubtaskProgress, listSubtasks, searchParentCandidates, setTaskParent } =
  await import('./subtask.service');

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

const ROOT = '0192f3a0-0000-7000-8000-000000000001';
const TASK = '0192f3a0-0000-7000-8000-000000000002';
const CHILD = '0192f3a0-0000-7000-8000-000000000003';
const OTHER = '0192f3a0-0000-7000-8000-000000000004';

/** Дерево: ROOT → TASK → CHILD; OTHER — отдельная задача верхнего уровня. */
const PATHS: Record<string, string[]> = {
  [ROOT]: [ROOT],
  [TASK]: [ROOT, TASK],
  [CHILD]: [ROOT, TASK, CHILD],
  [OTHER]: [OTHER],
};

function listRow(id: string, number: number, categories: string[], subtasks = 0) {
  return {
    id,
    number,
    title: `Задача ${number}`,
    priority: 'none',
    dueDate: null,
    assignee: null,
    parent: null,
    workspace: { taskKey: 'TM' },
    placements: categories.map((category) => ({
      projectId: 'p',
      statusId: 's',
      project: { name: 'Сайт' },
      status: { name: 'Статус', color: 'gray', category },
    })),
    _count: { subtasks },
    labels: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockImplementation((_session, workspaceId) =>
    Promise.resolve({
      userId: session.user.id,
      workspaceId,
      memberId: 'm-1',
      role: 'member',
      permissions: { manageProjects: false, manageDocuments: false },
    }),
  );
  lockTree.mockResolvedValue();
  pathIds.mockImplementation((_ws, taskId) => Promise.resolve(PATHS[taskId] ?? []));
  subtreeHeight.mockResolvedValue(2);
  countChildren.mockResolvedValue(0);
  setParent.mockResolvedValue(1);
  subtreeIds.mockResolvedValue([TASK, CHILD]);
  searchCandidates.mockResolvedValue([]);
});

describe('setTaskParent', () => {
  it('moves a task with its subtree under another task', async () => {
    await setTaskParent(session, { workspaceId: 'ws-1', taskId: TASK, parentId: OTHER });
    expect(lockTree).toHaveBeenCalled();
    expect(setParent).toHaveBeenCalledWith(expect.anything(), 'ws-1', TASK, OTHER);
    expect(recordHistory.mock.calls[0]?.[1]).toMatchObject({
      changes: [{ kind: 'parent', data: { from: { id: ROOT }, to: { id: OTHER } } }],
    });
  });

  it('moves a task to the top level', async () => {
    await setTaskParent(session, { workspaceId: 'ws-1', taskId: TASK, parentId: null });
    expect(setParent).toHaveBeenCalledWith(expect.anything(), 'ws-1', TASK, null);
  });

  it('does nothing when the parent is unchanged', async () => {
    await setTaskParent(session, { workspaceId: 'ws-1', taskId: TASK, parentId: ROOT });
    expect(setParent).not.toHaveBeenCalled();
    expect(recordHistory).not.toHaveBeenCalled();
  });

  it('rejects moving a task under its own subtask', async () => {
    await expect(
      setTaskParent(session, { workspaceId: 'ws-1', taskId: TASK, parentId: CHILD }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(setParent).not.toHaveBeenCalled();
  });

  it('rejects moving a task under itself', async () => {
    await expect(
      setTaskParent(session, { workspaceId: 'ws-1', taskId: OTHER, parentId: OTHER }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('checks the resulting depth with the subtree height', async () => {
    subtreeHeight.mockResolvedValue(10);
    await expect(
      setTaskParent(session, { workspaceId: 'ws-1', taskId: TASK, parentId: OTHER }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(setParent).not.toHaveBeenCalled();
  });

  it('rejects a parent over the subtasks limit', async () => {
    countChildren.mockResolvedValue(200);
    await expect(
      setTaskParent(session, { workspaceId: 'ws-1', taskId: TASK, parentId: OTHER }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('returns NOT_FOUND for a parent of another workspace', async () => {
    const foreign = '0192f3a0-0000-7000-8000-0000000000ff';
    await expect(
      setTaskParent(session, { workspaceId: 'ws-1', taskId: TASK, parentId: foreign }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(setParent).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for a non-member', async () => {
    requireWorkspaceAccess.mockRejectedValue(new NotFoundError('Пространство не найдено'));
    await expect(
      setTaskParent(session, { workspaceId: 'ws-1', taskId: TASK, parentId: OTHER }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(lockTree).not.toHaveBeenCalled();
  });
});

describe('listSubtasks', () => {
  it('maps children and counts progress', async () => {
    listChildren.mockResolvedValue([listRow(CHILD, 3, ['done'], 2), listRow(OTHER, 4, [])]);
    const result = await listSubtasks(session, 'ws-1', TASK);
    expect(result.progress).toEqual({ total: 2, done: 1 });
    expect(result.items[0]).toMatchObject({ key: 'TM-3', subtaskCount: 2 });
  });

  it('rejects a malformed task id without a query', async () => {
    await expect(listSubtasks(session, 'ws-1', 'abc')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(listChildren).not.toHaveBeenCalled();
  });
});

describe('getSubtaskProgress', () => {
  it('groups children by parent', async () => {
    childrenCategories.mockResolvedValue([
      { parentId: ROOT, placements: [{ status: { category: 'done' } }] },
      { parentId: ROOT, placements: [] },
      { parentId: TASK, placements: [{ status: { category: 'done' } }] },
    ]);
    const progress = await getSubtaskProgress('ws-1', [ROOT, TASK, OTHER]);
    expect(progress.get(ROOT)).toEqual({ total: 2, done: 1 });
    expect(progress.get(TASK)).toEqual({ total: 1, done: 1 });
    expect(progress.has(OTHER)).toBe(false);
  });
});

describe('searchParentCandidates', () => {
  it('excludes the task subtree and parses a task number', async () => {
    searchCandidates.mockResolvedValue([
      { id: ROOT, number: 1, title: 'Корень', workspace: { taskKey: 'TM' } },
    ]);
    await expect(
      searchParentCandidates(session, { workspaceId: 'ws-1', taskId: TASK, q: 'TM-1' }),
    ).resolves.toEqual([{ taskId: ROOT, number: 1, key: 'TM-1', title: 'Корень' }]);
    expect(searchCandidates).toHaveBeenCalledWith('ws-1', {
      number: 1,
      text: 'TM-1',
      excludeIds: [TASK, CHILD],
      take: 20,
    });
  });
});
