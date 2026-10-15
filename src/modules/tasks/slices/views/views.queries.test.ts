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

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: () => requireWorkspaceAccess(),
}));
vi.mock('@/modules/projects', () => ({
  isEntityId: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
  parseStatusColor: (value: string) => value,
}));
vi.mock('./views.repository', () => ({
  viewsRepository: {
    listBoardPlacements: () => listBoardPlacements(),
    listTaskPage: (args: { skip: number; take: number }) => listTaskPage(args),
    listPlacementPage: (args: { skip: number; take: number }) => listPlacementPage(args),
  },
}));

const { getBoardCards, listProjectTasks, listTasks } = await import('./views.queries');
const { defaultTaskListQuery, TASK_LIST_PAGE_SIZE } = await import('../../models');

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

function row(
  taskId: string,
  statusId: string,
  position: string,
  extra: { category?: string; dueDate?: Date | null } = {},
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
    permissions: { manageProjects: false },
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
