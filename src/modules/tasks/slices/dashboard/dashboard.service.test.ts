import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import type * as EnvModule from '@/shared/env';
import { ForbiddenError } from '@/shared/errors';

type Dates = { today: Date; weekEnd: Date; doneSince: Date };

const requireWorkspaceAccess = vi.fn<() => Promise<WorkspaceAccess>>();
const listMembers = vi.fn<() => Promise<unknown[]>>();
const aggregate = vi.fn<(ws: string, dates: Dates, limit: number) => Promise<unknown>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: () => requireWorkspaceAccess(),
}));
vi.mock('@/shared/env', async (importOriginal) => {
  const original = await importOriginal<typeof EnvModule>();
  return {
    ...original,
    getEnv: () => ({ ...original.getEnv(), REMINDERS_TIMEZONE: 'Europe/Moscow' }),
  };
});
vi.mock('@/modules/workspaces', () => ({ listMembers: () => listMembers() }));
vi.mock('@/modules/projects', () => ({ parseStatusColor: (value: string) => value }));
vi.mock('./dashboard.repository', () => ({
  dashboardRepository: {
    aggregate: (ws: string, dates: Dates, limit: number) => aggregate(ws, dates, limit),
  },
}));

const { getWorkspaceDashboard } = await import('./dashboard.service');

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

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockResolvedValue({ userId: 'user-1' } as WorkspaceAccess);
  listMembers.mockResolvedValue([
    { userId: 'user-1', name: 'Анна', image: null, isAgent: false, email: 'a@example.com' },
  ]);
  aggregate.mockResolvedValue({
    counts: { open: 2, overdue: 1, dueWeek: 0, unassigned: 0, doneLast7: 0 },
    openByAssignee: [{ id: 'user-1', count: 2 }],
    overdueByAssignee: [{ id: 'user-1', count: 1 }],
    openByProject: [{ id: 'p1', count: 2 }],
    overdueByProject: [],
    projects: [
      { id: 'p1', name: 'Сайт' },
      { id: 'p2', name: 'Пустой' },
    ],
    overdueTasks: [],
  });
});

describe('getWorkspaceDashboard', () => {
  it('counts «today» in the reminders time zone', async () => {
    // 22:30 UTC 16 октября — в Москве уже 17-е.
    const dashboard = await getWorkspaceDashboard(
      session,
      'ws-1',
      new Date('2026-10-16T22:30:00.000Z'),
    );
    expect(dashboard.today).toBe('2026-10-17');
    const dates = aggregate.mock.calls[0]![1];
    expect(dates.today.toISOString()).toBe('2026-10-17T00:00:00.000Z');
    expect(dates.weekEnd.toISOString()).toBe('2026-10-23T00:00:00.000Z');
  });

  it('merges member and project aggregates', async () => {
    const dashboard = await getWorkspaceDashboard(session, 'ws-1');
    expect(dashboard.workload).toEqual([
      { userId: 'user-1', name: 'Анна', image: null, isAgent: false, open: 2, overdue: 1 },
    ]);
    expect(dashboard.projects).toEqual([
      { projectId: 'p1', name: 'Сайт', open: 2, overdue: 0 },
      { projectId: 'p2', name: 'Пустой', open: 0, overdue: 0 },
    ]);
  });

  it('a non-member gets no data', async () => {
    requireWorkspaceAccess.mockRejectedValue(new ForbiddenError());
    await expect(getWorkspaceDashboard(session, 'ws-2')).rejects.toBeInstanceOf(ForbiddenError);
    expect(aggregate).not.toHaveBeenCalled();
  });
});
