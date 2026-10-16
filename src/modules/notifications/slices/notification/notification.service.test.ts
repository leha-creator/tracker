import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';

import type { NotificationChannels, NotificationEvent, NotificationType } from '../../models';

const listForUsers =
  vi.fn<
    (ids: readonly string[]) => Promise<Map<string, Map<NotificationType, NotificationChannels>>>
  >();
const findRecipients =
  vi.fn<(ids: readonly string[]) => Promise<{ id: string; email: string; name: string }[]>>();
const createMany =
  vi.fn<(rows: { userId: string }[]) => Promise<{ id: string; userId: string }[]>>();
const findUserIdByEmail = vi.fn<(email: string) => Promise<string | null>>();
const list = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const exists = vi.fn<(userId: string, id: string) => Promise<boolean>>();
const markRead = vi.fn<(userId: string, ids?: readonly string[]) => Promise<number>>();
const sendMail =
  vi.fn<(message: { to: string; subject: string }) => Promise<{ messageId: string }>>();
const afterTasks: (() => Promise<void>)[] = [];

vi.mock('next/server', () => ({
  after: (task: () => Promise<void>) => afterTasks.push(task),
}));
vi.mock('@/shared/env', () => ({
  getEnv: () => ({ BETTER_AUTH_URL: 'https://tasker.test', LOG_LEVEL: 'silent', NODE_ENV: 'test' }),
}));
vi.mock('@/shared/mail', () => ({
  sendMail: (message: { to: string; subject: string }) => sendMail(message),
}));
vi.mock('../preference/preference.repository', () => ({
  preferenceRepository: { listForUsers: (ids: readonly string[]) => listForUsers(ids) },
}));
vi.mock('./notification.repository', () => ({
  notificationRepository: {
    findRecipients: (ids: readonly string[]) => findRecipients(ids),
    createMany: (rows: { userId: string }[]) => createMany(rows),
    findUserIdByEmail: (email: string) => findUserIdByEmail(email),
    list: (...args: unknown[]) => list(...args),
    exists: (userId: string, id: string) => exists(userId, id),
    markRead: (userId: string, ids?: readonly string[]) => markRead(userId, ids),
  },
}));

const { listMyNotifications, markNotificationRead, notify, notifyByEmail } =
  await import('./notification.service');

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

const payload = {
  workspaceSlug: 'team',
  workspaceName: 'Команда',
  actorName: 'Анна',
  taskNumber: 7,
  taskTitle: 'Задача',
  commentExcerpt: 'Привет',
};

function event(type: 'mention' | 'task_comment', recipientId: string): NotificationEvent {
  return {
    type,
    recipientId,
    workspaceId: 'ws-1',
    actorId: 'actor',
    taskId: 'task-1',
    commentId: 'comment-1',
    payload,
  };
}

function recipient(id: string) {
  return { id, email: `${id}@example.com`, name: id };
}

async function flushAfter() {
  await Promise.all(afterTasks.splice(0).map((task) => task()));
}

beforeEach(() => {
  vi.clearAllMocks();
  afterTasks.length = 0;
  listForUsers.mockResolvedValue(new Map());
  findRecipients.mockImplementation((ids) => Promise.resolve(ids.map(recipient)));
  createMany.mockImplementation((rows) =>
    Promise.resolve(rows.map((row, index) => ({ id: `n${index}`, userId: row.userId }))),
  );
  sendMail.mockResolvedValue({ messageId: 'm1' });
});

describe('notify', () => {
  it('creates one notification per recipient and mails by defaults', async () => {
    await notify([
      event('task_comment', 'u1'),
      event('mention', 'u1'),
      event('task_comment', 'u2'),
    ]);

    expect(createMany).toHaveBeenCalledTimes(1);
    const rows = createMany.mock.calls[0]![0] as { userId: string; type: string }[];
    expect(rows.map((row) => [row.userId, row.type])).toEqual([
      ['u1', 'mention'],
      ['u2', 'task_comment'],
    ]);
    // Письма — после ответа: по умолчанию только упоминание (комментарии — без email).
    expect(sendMail).not.toHaveBeenCalled();
    await flushAfter();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]![0].to).toBe('u1@example.com');
  });

  it('respects saved preferences', async () => {
    listForUsers.mockResolvedValue(
      new Map([['u1', new Map([['mention', { inApp: false, email: false }]])]]),
    );
    await notify([event('mention', 'u1')]);
    expect(createMany).toHaveBeenCalledWith([]);
    await flushAfter();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('skips the actor and unknown or banned users', async () => {
    findRecipients.mockResolvedValue([]);
    await notify([event('mention', 'actor'), event('mention', 'gone')]);
    expect(findRecipients).toHaveBeenCalledWith(['gone']);
    expect(createMany).toHaveBeenCalledWith([]);
  });

  it('does nothing without recipients', async () => {
    await notify([event('mention', 'actor')]);
    expect(listForUsers).not.toHaveBeenCalled();
  });

  it('never throws', async () => {
    createMany.mockRejectedValue(new Error('db down'));
    await expect(notify([event('mention', 'u1')])).resolves.toBeUndefined();
  });

  it('logs mail failures without throwing', async () => {
    sendMail.mockRejectedValue(new Error('smtp down'));
    await notify([event('mention', 'u1')]);
    await expect(flushAfter()).resolves.not.toThrow();
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});

describe('notifyByEmail', () => {
  const invitation = {
    type: 'workspace_invitation' as const,
    workspaceId: 'ws-1',
    actorId: 'actor',
    invitationId: 'inv-1',
    payload: { workspaceSlug: 'team', workspaceName: 'Команда', actorName: 'Анна' },
  };

  it('notifies an existing user', async () => {
    findUserIdByEmail.mockResolvedValue('u1');
    await notifyByEmail('u1@example.com', invitation);
    const rows = createMany.mock.calls[0]![0] as { userId: string; invitationId: string }[];
    expect(rows).toEqual([expect.objectContaining({ userId: 'u1', invitationId: 'inv-1' })]);
    await flushAfter();
    // Приглашение — только в приложении: письмо отправляет сам модуль пространств.
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('ignores an unknown email', async () => {
    findUserIdByEmail.mockResolvedValue(null);
    await notifyByEmail('nobody@example.com', invitation);
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe('listMyNotifications', () => {
  function row(id: string, createdAt: string) {
    return {
      id,
      workspaceId: 'ws-1',
      type: 'mention' as const,
      taskId: 'task-1',
      commentId: 'c1',
      invitationId: null,
      payload,
      readAt: null,
      createdAt: new Date(createdAt),
      actor: { id: 'actor', name: 'Анна', image: null },
    };
  }

  it('returns a page with the next cursor', async () => {
    list.mockResolvedValue([
      row('0192f3a0-0000-7000-8000-000000000003', '2026-10-16T10:00:00.000Z'),
      row('0192f3a0-0000-7000-8000-000000000002', '2026-10-16T09:00:00.000Z'),
      row('0192f3a0-0000-7000-8000-000000000001', '2026-10-16T08:00:00.000Z'),
    ]);
    const page = await listMyNotifications(session, { limit: 2 });

    expect(list).toHaveBeenCalledWith('user-1', { cursor: null, unreadOnly: false, take: 3 });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      title: 'Упоминание в комментарии',
      subject: '#7 Задача',
      href: '/w/team/tasks/7#comment-c1',
      actorName: 'Анна',
    });
    expect(page.nextCursor).toBe('2026-10-16T09:00:00.000Z_0192f3a0-0000-7000-8000-000000000002');
  });

  it('skips rows with an invalid payload', async () => {
    list.mockResolvedValue([{ ...row('n1', '2026-10-16T10:00:00.000Z'), payload: {} }]);
    const page = await listMyNotifications(session);
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

describe('markNotificationRead', () => {
  it('rejects a foreign notification', async () => {
    exists.mockResolvedValue(false);
    await expect(markNotificationRead(session, 'n1')).rejects.toBeInstanceOf(NotFoundError);
    expect(markRead).not.toHaveBeenCalled();
  });

  it('marks own notification', async () => {
    exists.mockResolvedValue(true);
    markRead.mockResolvedValue(1);
    await markNotificationRead(session, 'n1');
    expect(markRead).toHaveBeenCalledWith('user-1', ['n1']);
  });
});
