import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';

const publishRealtimeEvent = vi.fn<(...args: unknown[]) => Promise<void>>();
const listProjectIdsOfTasks = vi.fn<(...args: unknown[]) => Promise<string[]>>();

vi.mock('@/shared/realtime', () => ({
  publishRealtimeEvent: (...args: unknown[]) => publishRealtimeEvent(...args),
}));
vi.mock('../placement/placement.repository', () => ({
  placementRepository: {
    listProjectIdsOfTasks: (...args: unknown[]) => listProjectIdsOfTasks(...args),
  },
}));

const { emitTaskEvent, emitWorkspaceResync } = await import('./task-events.service');

const session = { user: { id: 'user-1' } } as AuthSession;

beforeEach(() => {
  vi.clearAllMocks();
  publishRealtimeEvent.mockResolvedValue();
  listProjectIdsOfTasks.mockResolvedValue(['p-1', 'p-2']);
});

describe('emitTaskEvent', () => {
  it('uses the given projects without a query', async () => {
    await emitTaskEvent(session, {
      workspaceId: 'ws-1',
      kind: 'placement.changed',
      taskId: 't-1',
      projectIds: ['p-1', 'p-1'],
    });
    expect(listProjectIdsOfTasks).not.toHaveBeenCalled();
    expect(publishRealtimeEvent).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      kind: 'placement.changed',
      taskId: 't-1',
      projectIds: ['p-1'],
      actorId: 'user-1',
    });
  });

  it('loads projects of the task and related tasks', async () => {
    await emitTaskEvent(null, {
      workspaceId: 'ws-1',
      kind: 'task.archived',
      taskId: 't-1',
      taskNumber: 5,
      relatedTaskIds: ['t-2'],
    });
    expect(listProjectIdsOfTasks).toHaveBeenCalledWith('ws-1', ['t-1', 't-2']);
    expect(publishRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ taskNumber: 5, projectIds: ['p-1', 'p-2'], actorId: null }),
    );
  });

  it('never throws', async () => {
    listProjectIdsOfTasks.mockRejectedValue(new Error('db down'));
    await expect(
      emitTaskEvent(session, { workspaceId: 'ws-1', kind: 'task.updated', taskId: 't-1' }),
    ).resolves.toBeUndefined();
    expect(publishRealtimeEvent).not.toHaveBeenCalled();
  });
});

describe('emitWorkspaceResync', () => {
  it('publishes resync for the workspace', async () => {
    await emitWorkspaceResync(session, 'ws-1');
    expect(publishRealtimeEvent).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      kind: 'resync',
      projectIds: [],
      actorId: 'user-1',
    });
  });
});
