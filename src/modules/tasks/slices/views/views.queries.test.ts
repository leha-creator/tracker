import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';

const requireWorkspaceAccess = vi.fn<() => Promise<WorkspaceAccess>>();
const listBoardPlacements = vi.fn<() => Promise<unknown[]>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: () => requireWorkspaceAccess(),
}));
vi.mock('@/modules/projects', () => ({
  isEntityId: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
  parseStatusColor: (value: string) => value,
}));
vi.mock('./views.repository', () => ({
  viewsRepository: { listBoardPlacements: () => listBoardPlacements() },
}));

const { getBoardCards } = await import('./views.queries');

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
