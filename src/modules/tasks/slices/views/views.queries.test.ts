import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';

const requireWorkspaceAccess = vi.fn<() => Promise<WorkspaceAccess>>();
const listBoardPlacements = vi.fn<() => Promise<unknown[]>>();
type PageResult = { total: number; rows: unknown[] };
const listTaskPage = vi.fn<(args: { skip: number; take: number }) => Promise<PageResult>>();
const listPlacementPage = vi.fn<(args: { skip: number; take: number }) => Promise<PageResult>>();
const memberSummary =
  vi.fn<
    (
      ws: string,
      userId: string,
      options: { today: Date; since: Date; take: number },
    ) => Promise<unknown>
  >();
const isWorkspaceMember = vi.fn<(ws: string, userId: string) => Promise<boolean>>();
const listTaskSummaries = vi.fn<(ws: string, ids: string[]) => Promise<unknown[]>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: () => requireWorkspaceAccess(),
}));
vi.mock('@/modules/projects', () => ({
  isEntityId: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
  parseStatusColor: (value: string) => value,
}));
vi.mock('@/modules/workspaces', () => ({
  isWorkspaceMember: (ws: string, userId: string) => isWorkspaceMember(ws, userId),
}));
vi.mock('./views.repository', () => ({
  viewsRepository: {
    listBoardPlacements: () => listBoardPlacements(),
    listTaskPage: (args: { skip: number; take: number }) => listTaskPage(args),
    listPlacementPage: (args: { skip: number; take: number }) => listPlacementPage(args),
    memberSummary: (
      ws: string,
      userId: string,
      options: { today: Date; since: Date; take: number },
    ) => memberSummary(ws, userId, options),
    listTaskSummaries: (ws: string, ids: string[]) => listTaskSummaries(ws, ids),
  },
}));

const getSubtaskProgress =
  vi.fn<(ws: string, ids: readonly string[]) => Promise<Map<string, unknown>>>();
vi.mock('../subtask/subtask.service', () => ({
  getSubtaskProgress: (ws: string, ids: readonly string[]) => getSubtaskProgress(ws, ids),
}));

const { getBoardCards, getMemberTaskSummary, getTaskSummaries, listProjectTasks, listTasks } =
  await import('./views.queries');
const { defaultTaskListQuery, TASK_LIST_PAGE_SIZE } = await import('../../models');

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

const PROJECT_ID = '0192f3a0-0000-7000-8000-000000000001';

function row(
  taskId: string,
  statusId: string,
  position: string,
  extra: {
    category?: string;
    dueDate?: Date | null;
    parent?: { number: number; title: string } | null;
    subtasks?: number;
  } = {},
) {
  return {
    taskId,
    statusId,
    position,
    status: { category: extra.category ?? 'todo' },
    task: {
      number: Number(taskId.replace(/\D/g, '')) || 1,
      title: `Задача ${taskId}`,
      priority: 'none',
      dueDate: extra.dueDate ?? null,
      assignee: null,
      workspace: { taskKey: null },
      parent: extra.parent ?? null,
      _count: { subtasks: extra.subtasks ?? 0 },
      labels: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockResolvedValue({
    userId: 'user-1',
    workspaceId: 'ws-1',
    memberId: 'm-1',
    role: 'member',
    permissions: { manageProjects: false, manageDocuments: false },
  });
});

describe('getBoardCards', () => {
  it('groups cards by status in position order', async () => {
    listBoardPlacements.mockResolvedValue([
      row('t3', 's1', 'a2'),
      row('t1', 's1', 'a0'),
      row('t2', 's2', 'a0'),
      row('t4', 's1', 'Zz'),
    ]);
    const cards = await getBoardCards(session, 'ws-1', PROJECT_ID);
    expect(cards.s1?.map((card) => card.taskId)).toEqual(['t4', 't1', 't3']);
    expect(cards.s2?.map((card) => card.key)).toEqual(['#2']);
  });

  it('marks overdue only when the status in this project is not done', async () => {
    const past = new Date('2000-01-01T00:00:00.000Z');
    listBoardPlacements.mockResolvedValue([
      row('t1', 's1', 'a0', { dueDate: past }),
      row('t2', 's2', 'a0', { dueDate: past, category: 'done' }),
    ]);
    const cards = await getBoardCards(session, 'ws-1', PROJECT_ID);
    expect(cards.s1?.[0]).toMatchObject({ isOverdue: true, dueDate: '2000-01-01' });
    expect(cards.s2?.[0]?.isOverdue).toBe(false);
  });

  it('adds the parent and subtask progress; no progress query without subtasks', async () => {
    listBoardPlacements.mockResolvedValue([row('t1', 's1', 'a0')]);
    const plain = await getBoardCards(session, 'ws-1', PROJECT_ID);
    expect(plain.s1?.[0]).toMatchObject({ parent: null, subtaskProgress: null });
    expect(getSubtaskProgress).not.toHaveBeenCalled();

    getSubtaskProgress.mockResolvedValue(new Map([['t2', { total: 3, done: 1 }]]));
    listBoardPlacements.mockResolvedValue([
      row('t2', 's1', 'a0', { parent: { number: 1, title: 'Эпик' }, subtasks: 3 }),
    ]);
    const cards = await getBoardCards(session, 'ws-1', PROJECT_ID);
    expect(getSubtaskProgress).toHaveBeenCalledWith('ws-1', ['t2']);
    expect(cards.s1?.[0]).toMatchObject({
      parent: { number: 1, key: '#1', title: 'Эпик' },
      subtaskProgress: { total: 3, done: 1 },
    });
  });

  it('returns NOT_FOUND for a malformed project id', async () => {
    await expect(getBoardCards(session, 'ws-1', 'abc')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(listBoardPlacements).not.toHaveBeenCalled();
  });
});

function listRow(number: number, extra: { dueDate?: Date | null; categories?: string[] } = {}) {
  return {
    id: `0192f3a0-0000-7000-8000-${String(number).padStart(12, '0')}`,
    number,
    title: `Задача ${number}`,
    priority: 'none',
    dueDate: extra.dueDate ?? null,
    assignee: null,
    workspace: { taskKey: null },
    labels: [],
    placements: (extra.categories ?? []).map((category, index) => ({
      projectId: `p${index}`,
      statusId: `s${index}`,
      project: { name: `Проект ${index}` },
      status: { name: 'Статус', color: 'gray', category },
    })),
  };
}

describe('listTasks', () => {
  it('returns a page with totals', async () => {
    listTaskPage.mockResolvedValue({ total: 2, rows: [listRow(2), listRow(1)] });
    const page = await listTasks(session, 'ws-1', defaultTaskListQuery('workspace'));
    expect(page).toMatchObject({ total: 2, page: 1, pageCount: 1, pageSize: TASK_LIST_PAGE_SIZE });
    expect(page.items.map((item) => item.key)).toEqual(['#2', '#1']);
    expect(listTaskPage).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: TASK_LIST_PAGE_SIZE }),
    );
  });

  it('has one page when there are no tasks', async () => {
    listTaskPage.mockResolvedValue({ total: 0, rows: [] });
    const page = await listTasks(session, 'ws-1', defaultTaskListQuery('workspace'));
    expect(page).toMatchObject({ total: 0, page: 1, pageCount: 1, items: [] });
  });

  it('clamps a page beyond the last one and re-queries it', async () => {
    listTaskPage
      .mockResolvedValueOnce({ total: 60, rows: [] })
      .mockResolvedValueOnce({ total: 60, rows: [listRow(1)] });
    const page = await listTasks(session, 'ws-1', {
      ...defaultTaskListQuery('workspace'),
      page: 9,
    });
    expect(page).toMatchObject({ page: 2, pageCount: 2 });
    expect(listTaskPage).toHaveBeenNthCalledWith(1, expect.objectContaining({ skip: 400 }));
    expect(listTaskPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ skip: 50 }));
  });

  it('rejects non-members', async () => {
    requireWorkspaceAccess.mockRejectedValue(new NotFoundError('Пространство не найдено'));
    await expect(
      listTasks(session, 'ws-1', defaultTaskListQuery('workspace')),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(listTaskPage).not.toHaveBeenCalled();
  });
});

describe('listProjectTasks', () => {
  it('computes overdue by the status in this project', async () => {
    const past = new Date('2000-01-01T00:00:00.000Z');
    // Задача выполнена в другом проекте, но в этом — нет: просрочена.
    listPlacementPage.mockResolvedValue({
      total: 2,
      rows: [
        { status: { category: 'todo' }, task: listRow(1, { dueDate: past, categories: ['done'] }) },
        { status: { category: 'done' }, task: listRow(2, { dueDate: past, categories: ['todo'] }) },
      ],
    });
    const page = await listProjectTasks(
      session,
      'ws-1',
      PROJECT_ID,
      defaultTaskListQuery('project'),
    );
    expect(page.items.map((item) => item.isOverdue)).toEqual([true, false]);
  });

  it('returns NOT_FOUND for a malformed project id', async () => {
    await expect(
      listProjectTasks(session, 'ws-1', 'abc', defaultTaskListQuery('project')),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(listPlacementPage).not.toHaveBeenCalled();
  });
});

describe('getMemberTaskSummary', () => {
  it('hides non-members', async () => {
    isWorkspaceMember.mockResolvedValue(false);
    await expect(getMemberTaskSummary(session, 'ws-1', 'stranger')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(memberSummary).not.toHaveBeenCalled();
  });

  it('maps counters, the latest activity and open tasks', async () => {
    isWorkspaceMember.mockResolvedValue(true);
    memberSummary.mockResolvedValue({
      openCount: 3,
      overdueCount: 1,
      doneRecentlyCount: 2,
      createdCount: 5,
      commentsCount: 7,
      lastCommentAt: new Date('2026-10-10T10:00:00Z'),
      lastTaskAt: new Date('2026-10-12T10:00:00Z'),
      openTasks: [
        {
          id: 't1',
          number: 4,
          title: 'Задача',
          priority: 'none',
          dueDate: null,
          assignee: { id: 'user-2', name: 'Борис', image: null },
          workspace: { taskKey: 'TSK' },
          placements: [],
          labels: [],
        },
      ],
    });

    const summary = await getMemberTaskSummary(session, 'ws-1', 'user-2');

    const options = memberSummary.mock.calls[0]![2];
    expect(options.take).toBe(10);
    expect(options.today.toISOString().endsWith('T00:00:00.000Z')).toBe(true);
    expect(summary).toMatchObject({
      openCount: 3,
      overdueCount: 1,
      doneRecentlyCount: 2,
      createdCount: 5,
      commentsCount: 7,
      lastActivityAt: new Date('2026-10-12T10:00:00Z'),
    });
    expect(summary.openTasks[0]).toMatchObject({ key: 'TSK-4', isOverdue: false });
  });

  it('reports no activity', async () => {
    isWorkspaceMember.mockResolvedValue(true);
    memberSummary.mockResolvedValue({
      openCount: 0,
      overdueCount: 0,
      doneRecentlyCount: 0,
      createdCount: 0,
      commentsCount: 0,
      lastCommentAt: null,
      lastTaskAt: null,
      openTasks: [],
    });
    expect((await getMemberTaskSummary(session, 'ws-1', 'user-2')).lastActivityAt).toBeNull();
  });
});

describe('getTaskSummaries', () => {
  const T1 = '0192f3a0-0000-7000-8000-0000000000a1';
  const T2 = '0192f3a0-0000-7000-8000-0000000000a2';

  it('maps keys and done state, skipping malformed ids', async () => {
    listTaskSummaries.mockResolvedValue([
      {
        id: T2,
        number: 42,
        title: 'Готовая',
        placements: [{ status: { category: 'done' } }],
        workspace: { taskKey: 'TSK' },
      },
      { id: T1, number: 7, title: 'Без проекта', placements: [], workspace: { taskKey: null } },
    ]);
    await expect(getTaskSummaries(session, 'ws-1', [T1, T2, T1, '../x'])).resolves.toEqual([
      { id: T2, number: 42, key: 'TSK-42', title: 'Готовая', isDone: true },
      { id: T1, number: 7, key: '#7', title: 'Без проекта', isDone: false },
    ]);
    expect(listTaskSummaries).toHaveBeenCalledWith('ws-1', [T1, T2]);
  });

  it('does not query without ids', async () => {
    await expect(getTaskSummaries(session, 'ws-1', [])).resolves.toEqual([]);
    expect(listTaskSummaries).not.toHaveBeenCalled();
  });
});
