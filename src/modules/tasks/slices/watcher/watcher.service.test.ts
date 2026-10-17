import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceAccess } from '@/shared/access';
import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import type { TransactionClient } from '@/shared/db';
import { NotFoundError } from '@/shared/errors';

const requireWorkspaceAccess = vi.fn<() => Promise<WorkspaceAccess>>();
const filterWatchable = vi.fn<(db: unknown, ids: string[]) => Promise<string[]>>();
const addMany = vi.fn<(...args: unknown[]) => Promise<number>>();
const remove = vi.fn<(...args: unknown[]) => Promise<number>>();
const taskExists = vi.fn<() => Promise<boolean>>();
const listUserIds = vi.fn<() => Promise<string[]>>();
const findTaskRef = vi.fn<() => Promise<unknown>>();
const notify =
  vi.fn<(events: { recipientId: string; actorId: string | null }[]) => Promise<void>>();

vi.mock('@/modules/notifications', () => ({
  notify: (events: { recipientId: string; actorId: string | null }[]) => notify(events),
}));

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: () => requireWorkspaceAccess(),
}));
vi.mock('@/modules/projects', () => ({
  isEntityId: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
}));
vi.mock('@/shared/db', () => ({ prisma: {} }));
vi.mock('./watcher.repository', () => ({
  watcherRepository: {
    filterWatchable: (db: unknown, ids: string[]) => filterWatchable(db, ids),
    addMany: (...args: unknown[]) => addMany(...args),
    remove: (...args: unknown[]) => remove(...args),
    taskExists: () => taskExists(),
    listUserIds: () => listUserIds(),
    findTaskRef: () => findTaskRef(),
  },
}));

const { ensureWatchers, notifyWatchersAboutStatus, setWatching } =
  await import('./watcher.service');

const session = { user: { id: 'user-1' } } as AuthSession;
const tx = {} as TransactionClient;
const TASK_ID = '0192f3a0-0000-7000-8000-000000000010';
const input = { workspaceId: 'ws-1', taskId: TASK_ID };

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockResolvedValue({ userId: 'user-1' } as WorkspaceAccess);
  taskExists.mockResolvedValue(true);
  filterWatchable.mockImplementation((_db, ids) => Promise.resolve(ids));
  addMany.mockResolvedValue(1);
});

describe('ensureWatchers', () => {
  it('drops empty ids and duplicates, skips agents', async () => {
    filterWatchable.mockResolvedValue(['user-1']);
    await ensureWatchers(tx, 'ws-1', TASK_ID, ['user-1', null, 'agent-1', 'user-1', undefined]);
    expect(filterWatchable).toHaveBeenCalledWith(tx, ['user-1', 'agent-1']);
    expect(addMany).toHaveBeenCalledWith(tx, 'ws-1', TASK_ID, ['user-1']);
  });

  it('does nothing when nobody can watch', async () => {
    await ensureWatchers(tx, 'ws-1', TASK_ID, [null]);
    filterWatchable.mockResolvedValue([]);
    await ensureWatchers(tx, 'ws-1', TASK_ID, ['agent-1']);
    expect(addMany).not.toHaveBeenCalled();
  });
});

describe('setWatching', () => {
  it('subscribes the current user (idempotent in the repository)', async () => {
    await setWatching(session, { ...input, watch: true });
    await setWatching(session, { ...input, watch: true });
    expect(addMany).toHaveBeenCalledTimes(2);
    expect(addMany.mock.calls[0]?.slice(1)).toEqual(['ws-1', TASK_ID, ['user-1']]);
  });

  it('unsubscribes the current user', async () => {
    await setWatching(session, { ...input, watch: false });
    expect(remove).toHaveBeenCalledWith('ws-1', TASK_ID, 'user-1');
  });

  it('returns NOT_FOUND for a non-member or a foreign task', async () => {
    requireWorkspaceAccess.mockRejectedValueOnce(new NotFoundError('Пространство не найдено'));
    await expect(setWatching(session, { ...input, watch: true })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    taskExists.mockResolvedValue(false);
    await expect(setWatching(session, { ...input, watch: true })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(addMany).not.toHaveBeenCalled();
  });
});

describe('notifyWatchersAboutStatus', () => {
  const notice = {
    workspaceId: 'ws-1',
    taskId: TASK_ID,
    projectName: 'Сайт',
    fromStatus: 'К выполнению',
    toStatus: 'В работе',
  };

  beforeEach(() => {
    listUserIds.mockResolvedValue(['user-1', 'user-2', 'user-3']);
    findTaskRef.mockResolvedValue({
      number: 42,
      title: 'Задача',
      workspace: { slug: 'team', name: 'Команда', taskKey: 'TSK' },
    });
    notify.mockResolvedValue();
  });

  it('notifies every watcher except the actor', async () => {
    const count = await notifyWatchersAboutStatus({
      ...notice,
      actor: { id: 'user-1', name: 'Анна' },
    });
    expect(count).toBe(2);
    const events = notify.mock.calls[0]![0];
    expect(events.map((event) => event.recipientId)).toEqual(['user-2', 'user-3']);
    expect(events[0]).toMatchObject({
      type: 'task_status_changed',
      actorId: 'user-1',
      payload: { taskKey: 'TSK-42', fromStatus: 'К выполнению', toStatus: 'В работе' },
    });
  });

  it('notifies all watchers for a system change', async () => {
    await notifyWatchersAboutStatus({ ...notice, actor: null, systemName: 'GitHub' });
    const events = notify.mock.calls[0]![0];
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ actorId: null, payload: { actorName: 'GitHub' } });
  });

  it('does not throw when reading watchers fails', async () => {
    listUserIds.mockRejectedValue(new Error('db down'));
    await expect(notifyWatchersAboutStatus({ ...notice, actor: null })).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });
});
