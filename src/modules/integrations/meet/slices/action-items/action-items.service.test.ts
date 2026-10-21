import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';
import { ValidationError } from '@/shared/errors';

import type { StoredActionItem } from '../../models';

const requireWorkspaceAccess = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const assertTaskActive = vi.fn<(...args: unknown[]) => Promise<void>>();
const createTask = vi.fn<(...args: unknown[]) => Promise<{ taskId: string; number: number }>>();
let stored: StoredActionItem[] = [];
let recapWorkspace = 'ws-1';
const repo = {
  lockRecap: vi.fn(() =>
    Promise.resolve({
      id: 'r-1',
      actionItems: stored,
      completedAt: new Date('2026-10-21T13:00:00.000Z'),
      meeting: { workspaceId: recapWorkspace, taskId: 'parent-1' },
    }),
  ),
  saveActionItems: vi.fn((_tx: unknown, _id: string, items: StoredActionItem[]) => {
    stored = items.map((item) => ({ ...item }));
    return Promise.resolve();
  }),
};

vi.mock('@/shared/env', () => ({ getEnv: () => ({ LOG_LEVEL: 'silent' }) }));
vi.mock('@/shared/access', () => ({
  requireWorkspaceAccess: (...args: unknown[]) => requireWorkspaceAccess(...args),
}));
vi.mock('@/shared/db', () => ({
  prisma: { $transaction: (run: (tx: unknown) => Promise<unknown>) => run({}) },
}));
vi.mock('@/modules/tasks', () => ({
  TASK_TITLE_MAX_LENGTH: 200,
  assertTaskActive: (...args: unknown[]) => assertTaskActive(...args),
  createTask: (...args: unknown[]) => createTask(...args),
}));
vi.mock('../meeting/meeting.repository', () => ({ meetingRepository: repo }));

const { createSubtasksFromActionItems } = await import('./action-items.service');

const session = { user: { id: 'u1' } } as AuthSession;
const item = (task: string, extra: Partial<StoredActionItem> = {}): StoredActionItem => ({
  owner: 'Анна',
  task,
  due: null,
  subtaskId: null,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  recapWorkspace = 'ws-1';
  stored = [
    item('Макет', { due: '2026-10-28' }),
    item('Тексты'),
    item('Готово', { subtaskId: 't-0' }),
  ];
  requireWorkspaceAccess.mockResolvedValue({});
  assertTaskActive.mockResolvedValue();
  let n = 0;
  createTask.mockImplementation(() => Promise.resolve({ taskId: `t-${++n}`, number: 100 + n }));
});

describe('createSubtasksFromActionItems', () => {
  it('creates subtasks under the meeting task and stores their ids', async () => {
    const result = await createSubtasksFromActionItems(session, {
      workspaceId: 'ws-1',
      recapId: 'r-1',
      items: [{ index: 0, assigneeId: 'm-1' }, { index: 1 }],
    });
    expect(result).toEqual({ created: 2 });
    expect(createTask).toHaveBeenNthCalledWith(
      1,
      session,
      expect.objectContaining({
        workspaceId: 'ws-1',
        title: 'Макет',
        parentId: 'parent-1',
        dueDate: '2026-10-28',
        assigneeId: 'm-1',
      }),
    );
    expect(createTask.mock.calls[1]?.[1]).not.toHaveProperty('assigneeId');
    expect(stored.map((i) => i.subtaskId)).toEqual(['t-1', 't-2', 't-0']);
  });

  it('does not create an item twice', async () => {
    await expect(
      createSubtasksFromActionItems(session, {
        workspaceId: 'ws-1',
        recapId: 'r-1',
        items: [{ index: 2 }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(createTask).not.toHaveBeenCalled();
  });

  it('rejects a recap of another workspace and an archived task', async () => {
    recapWorkspace = 'ws-2';
    await expect(
      createSubtasksFromActionItems(session, {
        workspaceId: 'ws-1',
        recapId: 'r-1',
        items: [{ index: 0 }],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    recapWorkspace = 'ws-1';
    assertTaskActive.mockRejectedValueOnce(new ValidationError('Задача в архиве'));
    await expect(
      createSubtasksFromActionItems(session, {
        workspaceId: 'ws-1',
        recapId: 'r-1',
        items: [{ index: 0 }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(createTask).not.toHaveBeenCalled();
  });

  it('releases items that failed to become tasks', async () => {
    createTask
      .mockResolvedValueOnce({ taskId: 't-9', number: 9 })
      .mockRejectedValueOnce(new Error('db'));
    await expect(
      createSubtasksFromActionItems(session, {
        workspaceId: 'ws-1',
        recapId: 'r-1',
        items: [{ index: 0 }, { index: 1 }],
      }),
    ).rejects.toThrow('db');
    expect(stored.map((i) => i.subtaskId)).toEqual(['t-9', null, 't-0']);
  });
});
