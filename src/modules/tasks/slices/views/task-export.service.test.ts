import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import type * as EnvModule from '@/shared/env';
import { ForbiddenError } from '@/shared/errors';

import { defaultTaskListQuery, TASK_EXPORT_MAX_ROWS } from '../../models';

const requireWorkspaceAccess = vi.fn<() => Promise<WorkspaceAccess>>();
const listTasksForExport = vi.fn<(args: { take: number; where: unknown }) => Promise<unknown[]>>();
const listProjectTasksForExport =
  vi.fn<(args: { take: number; where: unknown }) => Promise<unknown[]>>();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: () => requireWorkspaceAccess(),
}));
vi.mock('@/shared/env', async (importOriginal) => {
  const original = await importOriginal<typeof EnvModule>();
  return {
    ...original,
    getEnv: () => ({ ...original.getEnv(), BETTER_AUTH_URL: 'https://tracker.example/' }),
  };
});
vi.mock('@/modules/projects', () => ({
  isEntityId: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
}));
vi.mock('./views.repository', () => ({
  viewsRepository: {
    listTasksForExport: (args: { take: number; where: unknown }) => listTasksForExport(args),
    listProjectTasksForExport: (args: { take: number; where: unknown }) =>
      listProjectTasksForExport(args),
  },
}));

const { exportTasks } = await import('./task-export.service');

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

function exportRow(number: number) {
  return {
    id: `task-${number}`,
    workspaceId: 'ws-1',
    number,
    title: `=Задача ${number}`,
    priority: 'high',
    dueDate: null,
    assignee: { id: 'u1', name: 'Анна', image: null },
    workspace: { taskKey: 'TSK' },
    parent: null,
    placements: [{ project: { name: 'Сайт' }, status: { name: 'В работе' } }],
    labels: [],
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-02T00:00:00Z'),
  };
}

const input = {
  workspaceId: 'ws-1',
  workspaceSlug: 'studio',
  query: defaultTaskListQuery('workspace'),
};

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockResolvedValue({ userId: 'user-1' } as WorkspaceAccess);
});

describe('exportTasks', () => {
  it('builds the CSV with escaped titles and task links', async () => {
    listTasksForExport.mockResolvedValue([exportRow(42)]);
    const result = await exportTasks(session, input);
    expect(result.rows).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.fileName).toMatch(/^tasker-studio-\d{4}-\d{2}-\d{2}\.csv$/);
    const line = result.csv.split('\r\n')[1];
    expect(line).toContain("TSK-42;'=Задача 42;Сайт: В работе;Высокий;Анна");
    expect(line).toContain('https://tracker.example/w/studio/tasks/42');
    expect(listTasksForExport).toHaveBeenCalledWith(
      expect.objectContaining({
        take: TASK_EXPORT_MAX_ROWS + 1,
        where: expect.objectContaining({ workspaceId: 'ws-1' }),
      }),
    );
  });

  it('cuts at the limit and marks the file as truncated', async () => {
    listTasksForExport.mockResolvedValue(
      Array.from({ length: TASK_EXPORT_MAX_ROWS + 1 }, (_, index) => exportRow(index + 1)),
    );
    const result = await exportTasks(session, input);
    expect(result).toMatchObject({ rows: TASK_EXPORT_MAX_ROWS, truncated: true });
  });

  it('a project tab exports placements of that project', async () => {
    listProjectTasksForExport.mockResolvedValue([]);
    const projectId = '0192f3a0-0000-7000-8000-000000000001';
    await exportTasks(session, {
      ...input,
      query: defaultTaskListQuery('project'),
      projectId,
    });
    expect(listProjectTasksForExport).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'ws-1', projectId }),
      }),
    );
  });

  it('a non-member gets nothing', async () => {
    requireWorkspaceAccess.mockRejectedValue(new ForbiddenError());
    await expect(exportTasks(session, input)).rejects.toBeInstanceOf(ForbiddenError);
    expect(listTasksForExport).not.toHaveBeenCalled();
  });
});
