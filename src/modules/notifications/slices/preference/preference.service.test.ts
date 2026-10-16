import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/shared/auth';
import { ValidationError } from '@/shared/errors';

import type { NotificationChannels, NotificationType } from '../../models';

const listForUsers =
  vi.fn<
    (ids: readonly string[]) => Promise<Map<string, Map<NotificationType, NotificationChannels>>>
  >();
const upsert =
  vi.fn<
    (
      userId: string,
      type: NotificationType,
      channels: NotificationChannels,
    ) => Promise<NotificationChannels>
  >();

vi.mock('./preference.repository', () => ({
  preferenceRepository: {
    listForUsers: (ids: readonly string[]) => listForUsers(ids),
    upsert: (userId: string, type: NotificationType, channels: NotificationChannels) =>
      upsert(userId, type, channels),
  },
}));

const { getMyNotificationPreferences, updateNotificationPreference } =
  await import('./preference.service');

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
  listForUsers.mockResolvedValue(new Map());
  upsert.mockImplementation((_userId, _type, channels) => Promise.resolve(channels));
});

describe('getMyNotificationPreferences', () => {
  it('returns defaults merged with saved values', async () => {
    listForUsers.mockResolvedValue(
      new Map([['user-1', new Map([['mention', { inApp: true, email: false }]])]]),
    );
    const result = await getMyNotificationPreferences(session);
    expect(result.map((item) => [item.type, item.value])).toEqual([
      ['mention', { inApp: true, email: false }],
      ['task_assigned', { inApp: true, email: true }],
      ['task_comment', { inApp: true, email: false }],
      ['workspace_invitation', { inApp: true, email: false }],
      ['pr_linked', { inApp: true, email: false }],
      ['pr_merged', { inApp: true, email: false }],
      ['pr_review', { inApp: true, email: true }],
    ]);
  });
});

describe('updateNotificationPreference', () => {
  it('keeps the other channel from defaults', async () => {
    const result = await updateNotificationPreference(session, {
      type: 'task_comment',
      channel: 'email',
      enabled: true,
    });
    expect(upsert).toHaveBeenCalledWith('user-1', 'task_comment', { inApp: true, email: true });
    expect(result).toEqual({ inApp: true, email: true });
  });

  it('rejects an unsupported channel', async () => {
    await expect(
      updateNotificationPreference(session, {
        type: 'workspace_invitation',
        channel: 'email',
        enabled: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(upsert).not.toHaveBeenCalled();
  });
});
